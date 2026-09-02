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

const MAX_ROWS = 1000;
const BATCH_SIZE = 100;

const rowSchema = z.object({
  service_no: z.string().trim().min(1).max(100),
  workzone: z.string().trim().min(1).max(100),
  customer_type: z.string().trim().min(1).max(100),
  customer_name: z.string().trim().min(1).max(100),
  contact_phone: z.string().trim().min(1).max(50),
  summary: z.string().trim().min(1).max(1000),
  rk_information: z.string().trim().max(100).optional(),
  alamat: z.string().trim().max(2000).optional(),
  device_name: z.string().trim().max(100).optional(),
  manual_category: z.enum(['GANGGUAN', 'PSB']).optional(),
  manual_notes: z.string().trim().max(2000).optional(),
});

const bulkSchema = z.object({
  rows: z.array(rowSchema).min(1).max(MAX_ROWS),
});

function todayWibDateForDb(): Date {
  const wib = toWIB(new Date());
  return new Date(Date.UTC(wib.getFullYear(), wib.getMonth(), wib.getDate()));
}

function sanitizeCustomerType(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '') || 'MANUAL';
}

function padSeq(seq: number): string {
  if (seq >= 1000) return String(seq);
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
    const idx = r.incident.indexOf(ddMMyy);
    if (idx === -1) continue;
    const tail = r.incident.slice(idx + 6);
    const m = tail.match(/^0*(\d+)$/);
    if (!m) continue;
    const n = parseInt(m[1] || '0', 10);
    if (n > max) max = n;
  }
  return max + 1;
}

export async function POST(req: Request) {
  try {
    const rateLimited = await enforceApiRateLimit(req, {
      namespace: 'tickets-manual-bulk',
      limit: 10,
      windowSeconds: 60,
    });
    if (rateLimited) return rateLimited;

    const user = await protectApi(['admin', 'helpdesk', 'superadmin']);

    let rows: z.infer<typeof rowSchema>[] = [];

    const contentType = req.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const body = await req.json().catch(() => null);
      const parsed = bulkSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { success: false, message: 'Validation failed', errors: parsed.error.flatten() },
          { status: 400 },
        );
      }
      rows = parsed.data.rows;
    } else if (contentType.includes('multipart/form-data')) {
      const form = await req.formData();
      const file = form.get('file') as File | null;
      if (!file) {
        return NextResponse.json({ success: false, message: 'File wajib' }, { status: 400 });
      }
      const text = await file.text();
      // Simple CSV parse: header row must be service_no,workzone,customer_type,customer_name,contact_phone,summary
      const lines = text.split(/\r?\n/).filter((l) => l.trim());
      if (lines.length < 2) {
        return NextResponse.json({ success: false, message: 'File kosong' }, { status: 400 });
      }
      const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
      const idxMap: Record<string, number> = {};
      headers.forEach((h, i) => (idxMap[h] = i));
      const required = ['service_no', 'workzone', 'customer_type', 'customer_name', 'contact_phone', 'summary'];
      for (const col of required) {
        if (idxMap[col] === undefined) {
          return NextResponse.json({ success: false, message: `Header ${col} wajib` }, { status: 400 });
        }
      }
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',').map((c) => c.trim());
        if (cols.length < headers.length) continue;
        rows.push({
          service_no: cols[idxMap['service_no']] || '',
          workzone: cols[idxMap['workzone']] || '',
          customer_type: cols[idxMap['customer_type']] || '',
          customer_name: cols[idxMap['customer_name']] || '',
          contact_phone: cols[idxMap['contact_phone']] || '',
          summary: cols[idxMap['summary']] || '',
          rk_information: idxMap['rk_information'] !== undefined ? cols[idxMap['rk_information']] : undefined,
        } as z.infer<typeof rowSchema>);
      }
      if (rows.length === 0) {
        return NextResponse.json({ success: false, message: 'Tidak ada rows' }, { status: 400 });
      }
      if (rows.length > MAX_ROWS) {
        return NextResponse.json({ success: false, message: `Maks ${MAX_ROWS} rows` }, { status: 400 });
      }
      // Validate
      const parsedRows = z.array(rowSchema).safeParse(rows);
      if (!parsedRows.success) {
        return NextResponse.json(
          { success: false, message: 'Validation failed', errors: parsedRows.error.flatten() },
          { status: 400 },
        );
      }
      rows = parsedRows.data;
    } else {
      return NextResponse.json({ success: false, message: 'Content-Type harus JSON atau multipart' }, { status: 400 });
    }

    // Preload service_area map case-insensitive
    const allSa = await prisma.service_area.findMany({ select: { nama_sa: true } });
    const saMap = new Map<string, string>();
    for (const sa of allSa) {
      if (sa.nama_sa) saMap.set(sa.nama_sa.trim().toLowerCase(), sa.nama_sa);
    }

    const now = new Date();
    const wib = toWIB(now);
    const dd = String(wib.getDate()).padStart(2, '0');
    const mm = String(wib.getMonth() + 1).padStart(2, '0');
    const yy = String(wib.getFullYear()).slice(-2);
    const ddMMyy = `${dd}${mm}${yy}`;
    const syncDate = new Date(Date.UTC(wib.getFullYear(), wib.getMonth(), wib.getDate()));

    // Lock for sequence
    const lockKey = `manual-incident:${ddMMyy}`;
    const owner = `bulk-${Date.now()}-${Math.random()}`;
    const locked = await acquireLock(lockKey, owner, 10);
    let startSeq: number;
    try {
      startSeq = await getNextManualSeq(ddMMyy, syncDate);
    } finally {
      if (locked) await releaseLock(lockKey, owner);
    }

    // Check service_no duplicates in file
    const seenServiceNo = new Set<string>();
    const toCreate: Array<{
      service_no: string;
      workzone: string;
      customer_type: string;
      customer_name: string;
      contact_phone: string;
      summary: string;
      rk_information?: string;
      alamat?: string;
      device_name?: string;
      manual_category?: string;
      manual_notes?: string;
    }> = [];
    const failed: Array<{ row: number; reason: string }> = [];

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]!;
      const rowNum = i + 1;
      if (seenServiceNo.has(r.service_no.trim())) {
        failed.push({ row: rowNum, reason: `service_no duplikat dalam file: ${r.service_no}` });
        continue;
      }
      seenServiceNo.add(r.service_no.trim());

      const wzKey = r.workzone.trim().toLowerCase();
      if (!saMap.has(wzKey)) {
        failed.push({ row: rowNum, reason: `workzone tidak ditemukan: ${r.workzone}` });
        continue;
      }
      toCreate.push(r as never);
    }

    if (toCreate.length === 0) {
      return NextResponse.json({ success: false, message: 'Semua rows gagal validasi', failed }, { status: 400 });
    }

    // Check existing incidents for service_no? service_no not unique, but incident must be unique. We generate.
    // Also check existing ticket with same service_no + workzone today? Not required, but we can allow.

    let inserted = 0;
    const chunks: typeof toCreate[] = [];
    for (let i = 0; i < toCreate.length; i += BATCH_SIZE) chunks.push(toCreate.slice(i, i + BATCH_SIZE));

    const createdIncidents: string[] = [];
    let seq = startSeq;

    for (const chunk of chunks) {
      const data = chunk.map((r) => {
        const ct = sanitizeCustomerType(r.customer_type);
        const incident = `INC-${ct}${ddMMyy}${padSeq(seq++)}`;
        createdIncidents.push(incident);
        return {
          incident,
          workzone: saMap.get(r.workzone.trim().toLowerCase())!,
          service_no: r.service_no,
          customer_type: r.customer_type,
          customer_name: r.customer_name,
          contact_phone: r.contact_phone,
          summary: r.summary,
          rk_information: r.rk_information || null,
          alamat: r.alamat || null,
          device_name: r.device_name || null,
          status_update: 'open' as const,
          status: 'BACKEND' as const,
          sync_date: syncDate,
          synced_at: now,
          is_manual: true,
          manual_category: (r.manual_category as string) || 'GANGGUAN',
          manual_notes: r.manual_notes || null,
          manual_created_by: user.id_user,
          jenis_tiket_1: 'MANUAL',
          jenis_tiket_2: 'MANUAL',
          needs_validation: false,
          validation_reason: null,
        };
      });

      // Use createMany with skipDuplicates? Incident unique, so if duplicate just skip
      try {
        const res = await prisma.ticket.createMany({ data: data as never, skipDuplicates: true });
        inserted += res.count;
      } catch (e) {
        // Fallback to逐 row if batch fails
        for (const row of data) {
          try {
            await prisma.ticket.create({ data: row as never });
            inserted++;
          } catch {
            failed.push({ row: 0, reason: `Gagal create ${row.incident}` });
          }
        }
      }
    }

    broadcastTicketInvalidate('manual');

    return NextResponse.json({
      success: true,
      data: { inserted, failed, total: rows.length, incidents: createdIncidents.slice(0, 10) },
      message: `Berhasil ${inserted} dari ${rows.length} (gagal ${failed.length})`,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { success: false, message: getErrorMessage(error, 'Bulk manual failed') },
      { status: getErrorStatus(error, 400) },
    );
  }
}
