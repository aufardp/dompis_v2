export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/app/libs/prisma';
import { protectApi } from '@/app/libs/protectApi';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';
import { enforceApiRateLimit } from '@/lib/api-rate-limit';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ serviceLocationId: string }> },
) {
  try {
    const rateLimited = await enforceApiRateLimit(req, {
      namespace: 'war-map-point-history',
      limit: 120,
      windowSeconds: 60,
    });
    if (rateLimited) return rateLimited;

    await protectApi([
      'admin',
      'helpdesk',
      'superadmin',
      'super_admin',
      'senior_leader',
      'admin_branch',
    ]);

    const { serviceLocationId: idParam } = await params;
    const serviceLocationId = Number(idParam);
    if (!Number.isFinite(serviceLocationId) || serviceLocationId <= 0) {
      return NextResponse.json(
        { success: false, message: 'Invalid service location id' },
        { status: 400 },
      );
    }

    const location = await prisma.service_location.findUnique({
      where: { id: serviceLocationId },
      select: { id: true, service_no: true },
    });

    if (!location) {
      return NextResponse.json(
        { success: false, message: 'Service location not found' },
        { status: 404 },
      );
    }

    const history = await prisma.service_location_history.findMany({
      where: { service_location_id: serviceLocationId },
      orderBy: { tagged_at: 'desc' },
      take: 100,
      select: {
        id: true,
        incident: true,
        service_no: true,
        customer_name: true,
        alamat: true,
        latitude: true,
        longitude: true,
        accuracy_meters: true,
        device_name: true,
        barcode_dc: true,
        workzone: true,
        source: true,
        tagged_at: true,
        teknisi: { select: { nama: true } },
        ticket: {
          select: {
            rca: true,
            sub_rca: true,
            description_solution_dompis: true,
            closed_at: true,
          },
        },
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        serviceNo: location.service_no,
        history: history.map((h) => ({
          id: h.id,
          incident: h.incident,
          serviceNo: h.service_no,
          customerName: h.customer_name,
          alamat: h.alamat,
          latitude: h.latitude.toNumber(),
          longitude: h.longitude.toNumber(),
          accuracyMeters: h.accuracy_meters ? h.accuracy_meters.toNumber() : null,
          deviceName: h.device_name,
          barcodeDc: h.barcode_dc,
          workzone: h.workzone,
          source: h.source,
          taggedAt: h.tagged_at,
          technicianName: h.teknisi?.nama ?? null,
          rca: h.ticket?.rca ?? null,
          subRca: h.ticket?.sub_rca ?? null,
          descriptionSolution: h.ticket?.description_solution_dompis ?? null,
          closedAt: h.ticket?.closed_at ?? null,
        })),
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