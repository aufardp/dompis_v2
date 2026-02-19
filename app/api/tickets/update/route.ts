export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { protectApi } from '@/app/libs/protectApi';
import {
  TicketWorkflowService,
  type TicketUpdatePatch,
  type TicketUpdateWorkflow,
} from '@/app/libs/services/ticketWorkflow.service';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';

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
      descriptionActualSolution: (patchSrc.descriptionActualSolution ??
        patchSrc.description_actual_solution) as any,
    };

    const wfSrc = isRecord(body.workflow) ? body.workflow : body;
    const workflowStatus =
      (wfSrc.status as any) ??
      (wfSrc.hasilVisit as any) ??
      (wfSrc.hasil_visit as any) ??
      (wfSrc.newStatus as any);

    const workflow: TicketUpdateWorkflow | undefined =
      workflowStatus !== undefined
        ? {
            status: workflowStatus,
            pendingReason: (wfSrc.pendingReason ?? wfSrc.pending_reason) as any,
            note: wfSrc.note as any,
          }
        : undefined;

    const result = await TicketWorkflowService.updateTicket(ticketId, user, {
      patch,
      workflow,
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error: unknown) {
    const message = getErrorMessage(error, 'Failed to update ticket');
    return NextResponse.json(
      { success: false, message },
      { status: getErrorStatus(error, 400) },
    );
  }
}
