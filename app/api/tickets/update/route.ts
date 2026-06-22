export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { protectApi } from '@/app/libs/protectApi';
import { TicketWorkflowService } from '@/app/libs/services/ticketWorkflow.service';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';
import { broadcastTicketInvalidate } from '@/app/libs/sseBroadcast';
import { TicketUpdatePatch, TicketUpdateWorkflow } from '@/app/types/ticket';
import { updateTicketSchema } from '@/app/libs/validations/ticket.schema';
import { enforceApiRateLimit } from '@/lib/api-rate-limit';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function toPositiveInt(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.floor(n);
}

export async function POST(req: Request) {
  try {
    const rateLimited = await enforceApiRateLimit(req, {
      namespace: 'tickets-update',
      limit: 30,
      windowSeconds: 60,
    });
    if (rateLimited) return rateLimited;

    const user = await protectApi([
      'admin',
      'helpdesk',
      'teknisi',
      'superadmin',
      'super_admin',
    ]);

    const body = await req.json().catch(() => null);
    if (!isRecord(body)) {
      return NextResponse.json(
        { success: false, message: 'Invalid request body' },
        { status: 400 },
      );
    }

    const parsed = updateTicketSchema.safeParse({
      ...body,
      ticketId: body.ticketId ?? body.idTicket ?? body.id_ticket,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, message: 'ticketId wajib valid' },
        { status: 400 },
      );
    }

    const ticketId = parsed.data.ticketId;

    const roleKey = String((user as any)?.role ?? '')
      .trim()
      .toLowerCase();

    /* =====================================================
       🔵 HANDLE RESUME (PENDING → ON_PROGRESS)
    ===================================================== */

    if (parsed.data.resume === true) {
      const workflow: TicketUpdateWorkflow = {
        status: 'ON_PROGRESS',
        note: 'Resume work',
      };

      const result = (await TicketWorkflowService.updateTicket(ticketId, user, {
        workflow,
      })) as { message: string };

      broadcastTicketInvalidate('update');

      return NextResponse.json({ success: true, message: result.message });
    }

    /* =====================================================
       🔵 HANDLE UPDATE → SET PENDING
    ===================================================== */

    if (roleKey === 'teknisi') {
      const reasonRaw =
        parsed.data.pendingDompis ??
        parsed.data.description;

      if (typeof reasonRaw === 'string') {
        const reason = reasonRaw.trim();

        if (!reason) {
          return NextResponse.json(
            { success: false, message: 'pendingDompis is required' },
            { status: 400 },
          );
        }

        const workflow: TicketUpdateWorkflow = {
          status: 'PENDING',
          pendingDompis: reason,
          note: 'Progress update by technician',
        };

        const result = (await TicketWorkflowService.updateTicket(
          ticketId,
          user,
          {
            workflow,
          },
        )) as { message: string };

        broadcastTicketInvalidate('update');

        return NextResponse.json({ success: true, message: result.message });
      }
    }

    /* =====================================================
       🔵 GENERIC PATCH (ADMIN / HELPDESK SUPPORT)
    ===================================================== */

    const patchSrc = (isRecord(parsed.data.patch) ? parsed.data.patch : parsed.data) as Record<
      string,
      string | null | undefined
    >;

    const sqmUpdateReason =
      patchSrc.sqmUpdateReason !== undefined
        ? patchSrc.sqmUpdateReason
        : patchSrc.sqm_update_reason;

    const patch: TicketUpdatePatch = {
      summary: patchSrc.summary,
      ownerGroup: patchSrc.ownerGroup ?? patchSrc.owner_group,
      status: patchSrc.status,
      workzone: patchSrc.workzone,
      serviceType: patchSrc.serviceType ?? patchSrc.service_type,
      customerSegment: patchSrc.customerSegment ?? patchSrc.customer_segment,
      customerType: patchSrc.customerType ?? patchSrc.customer_type,
      serviceNo: patchSrc.serviceNo ?? patchSrc.service_no,
      contactName: patchSrc.contactName ?? patchSrc.contact_name,
      contactPhone: patchSrc.contactPhone ?? patchSrc.contact_phone,
      deviceName: patchSrc.deviceName ?? patchSrc.device_name,
      symptom: patchSrc.symptom,
      alamat: patchSrc.alamat,
      sqmUpdateReason,
      pendingDompis: patchSrc.pendingDompis,
      descriptionSolutionDompis: patchSrc.descriptionSolutionDompis ?? patchSrc.description_solution_dompis,
    };

    const wfSrc = (isRecord(parsed.data.workflow) ? parsed.data.workflow : parsed.data) as Record<
      string,
      string | null | undefined
    >;

    let workflow: TicketUpdateWorkflow | undefined;

    const rawWorkflowStatus =
      wfSrc.status ??
      wfSrc.statusUpdate ??
      wfSrc.hasilVisit ??
      wfSrc.hasil_visit ??
      wfSrc.newStatus;

    if (typeof rawWorkflowStatus === 'string') {
      let pendingDompis: string | undefined;
      if (typeof wfSrc.pendingDompis === 'string') {
        pendingDompis = String(wfSrc.pendingDompis);
      }

      let note: string | undefined;
      if (typeof wfSrc.note === 'string') {
        note = String(wfSrc.note);
      }

      workflow = { status: rawWorkflowStatus, pendingDompis, note };
    }

    const result = (await TicketWorkflowService.updateTicket(ticketId, user, {
      patch,
      workflow,
    })) as { message: string };

    broadcastTicketInvalidate('update');

    return NextResponse.json({ success: true, message: result.message });
  } catch (error: unknown) {
    const message = getErrorMessage(error, 'Failed to update ticket');
    return NextResponse.json(
      { success: false, message },
      { status: getErrorStatus(error, 400) },
    );
  }
}
