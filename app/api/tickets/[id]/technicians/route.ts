export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { protectApi } from '@/app/libs/protectApi';
import { TicketWorkflowService } from '@/app/libs/services/ticketWorkflow.service';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await protectApi([
      'admin',
      'helpdesk',
      'superadmin',
      'super_admin',
    ]);

    const { id: idParam } = await params;
    const ticketId = Number(idParam);
    if (!Number.isFinite(ticketId) || ticketId <= 0) {
      return NextResponse.json(
        { success: false, message: 'Invalid ticket id' },
        { status: 400 },
      );
    }

    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search') || undefined;

    const data = await TicketWorkflowService.getEligibleTechniciansByTicketId(
      ticketId,
      search,
      { id_user: actor.id_user, role: actor.role },
    );

    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    const message = getErrorMessage(error, 'Unexpected error');
    const status =
      message === 'Ticket not found' ? 404 : getErrorStatus(error, 400);
    return NextResponse.json({ success: false, message }, { status });
  }
}
