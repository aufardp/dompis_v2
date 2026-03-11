export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { protectApi } from '@/app/libs/protectApi';
import { TicketWorkflowService } from '@/app/libs/services/ticketWorkflow.service';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';
import { invalidateTicketsCache } from '@/lib/cache';
import { broadcastTicketInvalidate } from '@/app/libs/sseBroadcast';
import { TicketUpdatePatch, TicketUpdateWorkflow } from '@/app/types/ticket';

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

    const ticketId =
      toPositiveInt(body.ticketId) ??
      toPositiveInt(body.idTicket) ??
      toPositiveInt(body.id_ticket);

    if (!ticketId) {
      return NextResponse.json(
        { success: false, message: 'ticketId is required' },
        { status: 400 },
      );
    }

    const roleKey = String((user as any)?.role ?? '')
      .trim()
      .toLowerCase();

    /* =====================================================
       🔵 HANDLE RESUME (PENDING → ON_PROGRESS)
    ===================================================== */

    if (body.resume === true) {
      const workflow: TicketUpdateWorkflow = {
        status: 'ON_PROGRESS',
        note: 'Resume work',
      };

      const result = await TicketWorkflowService.updateTicket(ticketId, user, {
        workflow,
      });

      // Invalidate cache to ensure fresh data on next fetch
      await invalidateTicketsCache();
      await new Promise((r) => setTimeout(r, 150));
      broadcastTicketInvalidate('update');

      return NextResponse.json({ success: true, ...result });
    }

    /* =====================================================
       🔵 HANDLE UPDATE → SET PENDING
    ===================================================== */

    if (roleKey === 'teknisi') {
      const reasonRaw =
        typeof body.pendingReason === 'string'
          ? body.pendingReason
          : typeof body.pending_reason === 'string'
            ? body.pending_reason
            : typeof body.description === 'string'
              ? body.description
              : undefined;

      if (typeof reasonRaw === 'string') {
        const reason = reasonRaw.trim();

        if (!reason) {
          return NextResponse.json(
            { success: false, message: 'pendingReason is required' },
            { status: 400 },
          );
        }

        const workflow: TicketUpdateWorkflow = {
          status: 'PENDING',
          pendingReason: reason,
          note: 'Progress update by technician',
        };

        const result = await TicketWorkflowService.updateTicket(
          ticketId,
          user,
          {
            workflow,
          },
        );

        // Invalidate cache to ensure fresh data on next fetch
        await invalidateTicketsCache();
        await new Promise((r) => setTimeout(r, 150));
        broadcastTicketInvalidate('update');

        return NextResponse.json({ success: true, ...result });
      }
    }

    /* =====================================================
       🔵 GENERIC PATCH (ADMIN / HELPDESK SUPPORT)
    ===================================================== */

    const patchSrc = isRecord(body.patch) ? body.patch : body;

    const patch: TicketUpdatePatch = {
      summary: patchSrc.summary as any,
      ownerGroup: (patchSrc.ownerGroup ?? patchSrc.owner_group) as any,
      status: patchSrc.status as any,
      workzone: patchSrc.workzone as any,
      serviceType: (patchSrc.serviceType ?? patchSrc.service_type) as any,
      customerSegment: (patchSrc.customerSegment ??
        patchSrc.customer_segment) as any,
      customerType: (patchSrc.customerType ?? patchSrc.customer_type) as any,
      serviceNo: (patchSrc.serviceNo ?? patchSrc.service_no) as any,
      contactName: (patchSrc.contactName ?? patchSrc.contact_name) as any,
      contactPhone: (patchSrc.contactPhone ?? patchSrc.contact_phone) as any,
      deviceName: (patchSrc.deviceName ?? patchSrc.device_name) as any,
      symptom: patchSrc.symptom as any,
      alamat: patchSrc.alamat as any,
      pendingReason: (patchSrc.pendingReason ?? patchSrc.pending_reason) as any,
      descriptionActualSolution: (patchSrc.descriptionActualSolution ??
        patchSrc.description_actual_solution) as any,
    };

    const wfSrc = isRecord(body.workflow) ? body.workflow : body;

    let workflow: TicketUpdateWorkflow | undefined;

    const rawWorkflowStatus =
      (wfSrc.status as any) ??
      (wfSrc.statusUpdate as any) ??
      (wfSrc.hasilVisit as any) ??
      (wfSrc.hasil_visit as any) ??
      (wfSrc.newStatus as any);

    if (typeof rawWorkflowStatus === 'string') {
      let pendingReason: string | undefined;
      if (typeof (wfSrc as any).pendingReason === 'string') {
        pendingReason = String((wfSrc as any).pendingReason);
      } else if (typeof (wfSrc as any).pending_reason === 'string') {
        pendingReason = String((wfSrc as any).pending_reason);
      }

      let note: string | undefined;
      if (typeof (wfSrc as any).note === 'string') {
        note = String((wfSrc as any).note);
      }

      workflow = { status: rawWorkflowStatus, pendingReason, note };
    }

    const result = await TicketWorkflowService.updateTicket(ticketId, user, {
      patch,
      workflow,
    });

    // Invalidate cache to ensure fresh data on next fetch
    await invalidateTicketsCache();
    await new Promise((r) => setTimeout(r, 150));
    broadcastTicketInvalidate('update');

    return NextResponse.json({ success: true, ...result });
  } catch (error: unknown) {
    const message = getErrorMessage(error, 'Failed to update ticket');
    return NextResponse.json(
      { success: false, message },
      { status: getErrorStatus(error, 400) },
    );
  }
}
