export const runtime = 'nodejs';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { protectApi } from '@/app/libs/protectApi';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';
import { enforceApiRateLimit } from '@/lib/api-rate-limit';
import prisma from '@/app/libs/prisma';
import { broadcastTicketInvalidate } from '@/app/libs/sseBroadcast';
import { toWIB } from '@/app/utils/datetime';
import { acquireLock, releaseLock } from '@/lib/ratelimit';

const manualSchema = z.object({
  incident: z.string().trim().min(3).max(100).optional(),
  service_no: z.string().trim().min(1).max(100),
  workzone: z.string().trim().min(1).max(100),
  customer_type: z.string().trim().min(1).max(100),
  customer_name: z.string().trim().min(1).max(100),
  contact_phone: z.string().trim().min(1).max(50),
  summary: z.string().trim().min(1).max(1000),
  alamat: z.string().trim().max(2000).optional(),
  device_name: z.string().trim().max(100).optional(),
  manual_category: z.enum(['GANGGUAN', 'PSB']).default('GANGGUAN'),
  manual_notes: z.string().trim().max(2000).optional(),
  rk_information: z.string().trim().max(100).optional(),
});

function todayWibDateForDb(): Date {
  const wib = toWIB(new Date());
  return new Date(Date.UTC(wib.getFullYear(), wib.getMonth(), wib.getDate()));
}

function sanitizeCustomerType(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '') || 'MANUAL';
}

function padSeq(seq: number): string {
  if (seq >= 1000) return String(seq); // 4+ digits
  if (seq >= 100) return String(seq).padStart(3, '0');
  return String(seq).padStart(2, '0');
}

async function getNextManualSeq(ddMMyy: string, syncDate: Date): Promise<number> {
  const rows = await prisma.ticket.findMany({
    where: { sync_date: syncDate, incident: { contains: ddMMyy } },
    select: { incident: true },
    take: 2000,
  });
  let max = 0;
  for (const r of rows) {
    const inc = r.incident;
    // INC-CTDDMMYYNN -> extract trailing digits after DDMMYY
    const idx = inc.indexOf(ddMMyy);
    if (idx === -1) continue;
    const tail = inc.slice(idx + 6);
    const m = tail.match(/^0*(\d+)$/);
    if (!m) continue;
    const n = parseInt(m[1] || '0', 10);
    if (n > max) max = n;
  }
  return max + 1;
}

async function generateManualIncident(customerType: string, now: Date = new Date()): Promise<string> {
  const wib = toWIB(now);
  const dd = String(wib.getDate()).padStart(2, '0');
  const mm = String(wib.getMonth() + 1).padStart(2, '0');
  const yy = String(wib.getFullYear()).slice(-2);
  const ddMMyy = `${dd}${mm}${yy}`;
  const syncDate = new Date(Date.UTC(wib.getFullYear(), wib.getMonth(), wib.getDate()));
  const ct = sanitizeCustomerType(customerType);
  const lockKey = `manual-incident:${ddMMyy}`;
  const owner = `manual-${Date.now()}-${Math.random()}`;
  const locked = await acquireLock(lockKey, owner, 5);
  try {
    const seq = await getNextManualSeq(ddMMyy, syncDate);
    return `INC-${ct}${ddMMyy}${padSeq(seq)}`;
  } finally {
    if (locked) await releaseLock(lockKey, owner);
  }
}

export async function POST(req: Request) {
  try {
    const rateLimited = await enforceApiRateLimit(req, {
      namespace: 'tickets-manual',
      limit: 30,
      windowSeconds: 60,
    });
    if (rateLimited) return rateLimited;

    const user = await protectApi(['admin', 'helpdesk', 'superadmin']);

    const body = await req.json().catch(() => null);
    const parsed = manualSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, message: 'Validation failed', errors: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    const data = parsed.data;

    // Validate workzone exists in service_area
    const sa = await prisma.service_area.findFirst({
      where: { nama_sa: data.workzone },
      select: { id_sa: true, nama_sa: true },
    });
    if (!sa) {
      return NextResponse.json({ success: false, message: `Workzone ${data.workzone} tidak ditemukan di service_area` }, { status: 400 });
    }

    const now = new Date();
    const syncDate = todayWibDateForDb();
    const incident = data.incident?.trim() || (await generateManualIncident(data.customer_type, now));

    const exists = await prisma.ticket.findUnique({ where: { incident }, select: { id_ticket: true } });
    if (exists) {
      return NextResponse.json({ success: false, message: `Incident ${incident} sudah ada` }, { status: 409 });
    }

    const created = await prisma.ticket.create({
      data: {
        incident,
        workzone: data.workzone,
        service_no: data.service_no,
        customer_type: data.customer_type,
        customer_name: data.customer_name,
        contact_phone: data.contact_phone,
        summary: data.summary,
        alamat: data.alamat || null,
        device_name: data.device_name || null,
        rk_information: data.rk_information || null,
        status_update: 'open',
        status: 'BACKEND',
        sync_date: syncDate,
        synced_at: now,
        is_manual: true,
        manual_category: data.manual_category,
        manual_notes: data.manual_notes || null,
        manual_created_by: user.id_user,
        jenis_tiket_1: 'MANUAL',
        jenis_tiket_2: 'MANUAL',
        needs_validation: false,
        validation_reason: null,
      },
      select: { id_ticket: true, incident: true },
    });

    broadcastTicketInvalidate('manual');

    return NextResponse.json({ success: true, data: created, message: 'Tiket manual berhasil dibuat' });
  } catch (error: unknown) {
    return NextResponse.json(
      { success: false, message: getErrorMessage(error, 'Failed to create manual ticket') },
      { status: getErrorStatus(error, 400) },
    );
  }
}

export async function GET(req: Request) {
  try {
    await protectApi(['admin', 'helpdesk', 'superadmin', 'teknisi']);
    const { searchParams } = new URL(req.url);
    const workzone = searchParams.get('workzone');
    const category = searchParams.get('category');
    const where: Record<string, unknown> = { is_manual: true, manual_category: { in: ['GANGGUAN', 'PSB'] } };
    if (workzone) where.workzone = workzone;
    if (category) {
      const cat = String(category).toUpperCase();
      if (['GANGGUAN', 'PSB'].includes(cat)) where.manual_category = cat;
    }
    const rows = await prisma.ticket.findMany({
      where,
      orderBy: { id_ticket: 'desc' },
      take: 100,
      select: {
        id_ticket: true,
        incident: true,
        workzone: true,
        alamat: true,
        status_update: true,
        manual_category: true,
        teknisi_user_id: true,
        sync_date: true,
        synced_at: true,
      },
    });
    return NextResponse.json({ success: true, data: rows });
  } catch (error: unknown) {
    return NextResponse.json(
      { success: false, message: getErrorMessage(error, 'Failed to list manual tickets') },
      { status: getErrorStatus(error, 400) },
    );
  }
}
