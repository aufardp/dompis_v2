export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/app/libs/prisma';
import { protectApi } from '@/app/libs/protectApi';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';
import { enforceApiRateLimit } from '@/lib/api-rate-limit';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const rateLimited = await enforceApiRateLimit(req, {
      namespace: 'ticket-location-bank',
      limit: 60,
      windowSeconds: 60,
    });
    if (rateLimited) return rateLimited;

    const user = await protectApi(['teknisi']);

    const { id: idParam } = await params;
    const ticketId = Number(idParam);
    if (!Number.isFinite(ticketId) || ticketId <= 0) {
      return NextResponse.json(
        { success: false, message: 'Invalid ticket id' },
        { status: 400 },
      );
    }

    const serviceNo = req.nextUrl.searchParams.get('serviceNo')?.trim() || '';

    const ticket = await prisma.ticket.findFirst({
      where: { id_ticket: ticketId },
      select: {
        service_no: true,
        teknisi_user_id: true,
        workzone: true,
        contact_name: true,
        customer_name: true,
      },
    });

    if (!ticket) {
      return NextResponse.json(
        { success: false, message: 'Ticket not found' },
        { status: 404 },
      );
    }

    if (ticket.teknisi_user_id !== user.id_user) {
      return NextResponse.json(
        { success: false, message: 'Forbidden - Access denied' },
        { status: 403 },
      );
    }

    const queryServiceNo = serviceNo || ticket.service_no || '';
    if (!queryServiceNo) {
      return NextResponse.json({ success: true, found: false, data: null });
    }

    const location = await prisma.service_location.findFirst({
      where: { service_no: queryServiceNo },
      include: {
        last_ticket: { select: { incident: true, closed_at: true } },
        last_teknisi: { select: { nama: true } },
      },
    });

    if (!location) {
      return NextResponse.json({ success: true, found: false, data: null });
    }

    return NextResponse.json({
      success: true,
      found: true,
      data: {
        serviceNo: location.service_no,
        customerName: location.customer_name,
        alamat: location.alamat,
        latitude: location.latitude.toNumber(),
        longitude: location.longitude.toNumber(),
        accuracyMeters: location.accuracy_meters
          ? location.accuracy_meters.toNumber()
          : null,
        deviceName: location.device_name,
        barcodeDc: location.barcode_dc,
        workzone: location.workzone,
        taggedCount: location.tagged_count,
        lastTicketIncident: location.last_ticket?.incident ?? null,
        lastTaggedAt: location.updated_at,
        lastTechnician: location.last_teknisi?.nama ?? null,
      },
    });
  } catch (error: unknown) {
    const message = getErrorMessage(error, 'Unexpected error');
    return NextResponse.json(
      { success: false, message },
      { status: getErrorStatus(error, 400) },
    );
  }
}
