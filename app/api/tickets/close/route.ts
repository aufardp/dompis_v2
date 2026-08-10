export const runtime = 'nodejs';

import { protectApi } from '@/app/libs/protectApi';
import { TicketWorkflowService } from '@/app/libs/services/ticketWorkflow.service';
import { NextResponse } from 'next/server';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';
import { broadcastTicketInvalidate, broadcastWarMapUpsert } from '@/app/libs/sseBroadcast';
import { closeTicketSchema } from '@/app/libs/validations/ticket.schema';
import { validateBody } from '@/app/libs/validations/validate';
import { enforceApiRateLimit } from '@/lib/api-rate-limit';

export async function POST(req: Request) {
  try {
    const rateLimited = await enforceApiRateLimit(req, {
      namespace: 'tickets-close',
      limit: 20,
      windowSeconds: 60,
    });
    if (rateLimited) return rateLimited;

    const user = await protectApi(['teknisi']);

    const body = await req.json().catch(() => null);
    const parsed = validateBody(closeTicketSchema, {
      ticketId: body?.ticketId,
      rca: body?.rca,
      subRca: body?.subRca,
      descriptionSolutionDompis: body?.descriptionSolutionDompis,
      latitude: body?.latitude,
      longitude: body?.longitude,
      accuracyMeters: body?.accuracyMeters,
      barcodeDc: body?.barcodeDc,
      locationSource: body?.locationSource,
    });

    if (!parsed.success) {
      const fieldErrors = parsed.error.flatten().fieldErrors as Record<string, string[] | undefined>;
      const messages: string[] = [];
      if (fieldErrors.ticketId) messages.push('ticketId tidak valid');
      if (fieldErrors.descriptionSolutionDompis) messages.push('detail perbaikan minimal 10 karakter');
      if (fieldErrors.rca) messages.push('RCA tidak valid (maks 100 karakter)');
      if (fieldErrors.subRca) messages.push('Sub RCA tidak valid (maks 100 karakter)');
      if (fieldErrors.latitude || fieldErrors.longitude) messages.push('Koordinat lokasi tidak valid');
      if (fieldErrors.barcodeDc) messages.push('Barcode DC tidak valid (maks 150 karakter)');

      return NextResponse.json(
        {
          success: false,
          message: messages.join('. ') || 'Data tidak valid',
          errors: fieldErrors,
        },
        { status: 400 },
      );
    }

    const {
      ticketId,
      rca,
      subRca,
      descriptionSolutionDompis,
      latitude,
      longitude,
      accuracyMeters,
      barcodeDc,
      locationSource,
    } = parsed.data;

    const result = (await TicketWorkflowService.closeTicket(
      Number(ticketId),
      user,
      rca ?? '',
      subRca ?? '',
      descriptionSolutionDompis,
      {
        latitude: latitude as number | undefined,
        longitude: longitude as number | undefined,
        accuracyMeters: accuracyMeters as number | undefined,
        barcodeDc: barcodeDc as string | undefined,
        locationSource: locationSource as 'manual_tag' | 'reused_bank_data' | undefined,
      },
    )) as { message: string; warMapPoint?: { serviceNo: string; incident: string; latitude: number; longitude: number; workzone: string | null; taggedAt: string } | null };

    broadcastTicketInvalidate('close');

    if (result?.warMapPoint) {
      broadcastWarMapUpsert(result.warMapPoint);
    }

    return NextResponse.json({ success: true, message: result.message });
  } catch (error: unknown) {
    const message = getErrorMessage(error, 'Failed to close ticket');
    return NextResponse.json(
      { success: false, message },
      { status: getErrorStatus(error, 400) },
    );
  }
}
