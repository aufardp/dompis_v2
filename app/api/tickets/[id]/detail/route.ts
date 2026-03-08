export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/app/libs/prisma';
import { protectApi } from '@/app/libs/protectApi';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';
import { isAdminRole } from '@/app/libs/rolesUtil';
import { getWorkzonesForUser } from '@/app/helpers/ticket.helpers';

function normalizeStatus(value: unknown) {
  return String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_');
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await protectApi([
      'admin',
      'helpdesk',
      'superadmin',
      'super_admin',
      'teknisi',
    ]);

    const { id: idParam } = await params;
    const ticketId = Number(idParam);
    if (!Number.isFinite(ticketId) || ticketId <= 0) {
      return NextResponse.json(
        { success: false, message: 'Invalid ticket id' },
        { status: 400 },
      );
    }

    const row = await prisma.ticket.findUnique({
      where: { id_ticket: ticketId },
      include: {
        users: { select: { nama: true } },
      },
    });

    if (!row) {
      return NextResponse.json(
        { success: false, message: 'Ticket not found' },
        { status: 404 },
      );
    }

    // Access control
    if (user.role === 'teknisi') {
      if (row.teknisi_user_id !== user.id_user) {
        return NextResponse.json(
          { success: false, message: 'Unauthorized' },
          { status: 403 },
        );
      }
    } else if (isAdminRole(user.role)) {
      const workzones = await getWorkzonesForUser(user.id_user);
      if (workzones.length > 0) {
        const wz = row.WORKZONE || '';
        const allowed = workzones.some((w) => {
          if (!w) return false;
          return wz.includes(w) || w.includes(wz);
        });
        if (!allowed) {
          return NextResponse.json(
            { success: false, message: 'Unauthorized' },
            { status: 403 },
          );
        }
      }
    }

    const mapped = {
      idTicket: row.id_ticket,
      ticket: row.INCIDENT,
      summary: row.SUMMARY || '',
      reportedDate: row.REPORTED_DATE || '',
      ownerGroup: row.OWNER_GROUP,
      serviceType: row.SERVICE_TYPE,
      customerType: row.CUSTOMER_TYPE,
      ctype: row.CUSTOMER_TYPE || undefined,
      customerSegment: row.CUSTOMER_SEGMENT,
      serviceNo: row.SERVICE_NO || '',
      contactName: row.CONTACT_NAME || '',
      contactPhone: row.CONTACT_PHONE || '',
      deviceName: row.DEVICE_NAME,
      symptom: row.SYMPTOM,
      workzone: row.WORKZONE,
      alamat: row.ALAMAT,
      status: row.STATUS || normalizeStatus(row.STATUS_UPDATE) || 'OPEN',
      STATUS_UPDATE: row.STATUS_UPDATE,
      hasilVisit: row.STATUS_UPDATE,
      bookingDate: row.BOOKING_DATE,
      sourceTicket: row.SOURCE_TICKET,
      jenisTiket: row.JENIS_TIKET,
      maxTtrReguler: row.JAM_EXPIRED_24_JAM_REGULER,
      maxTtrGold: row.JAM_EXPIRED_12_JAM_GOLD,
      maxTtrPlatinum: row.JAM_EXPIRED_6_JAM_PLATINUM,
      maxTtrDiamond: row.JAM_EXPIRED_3_JAM_DIAMOND,
      pendingReason: row.PENDING_REASON,
      rca: row.rca,
      subRca: row.sub_rca,
      teknisiUserId: row.teknisi_user_id,
      technicianName: row.users?.nama,
      closedAt: row.closed_at ? row.closed_at.toISOString() : null,
    };

    return NextResponse.json({ success: true, data: mapped });
  } catch (error: unknown) {
    const message = getErrorMessage(error, 'Unexpected error');
    return NextResponse.json(
      { success: false, message },
      { status: getErrorStatus(error, 400) },
    );
  }
}
