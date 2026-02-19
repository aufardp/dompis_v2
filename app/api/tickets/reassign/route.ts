export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { protectApi } from '@/app/libs/protectApi';
import { TicketWorkflowService } from '@/app/libs/services/ticketWorkflow.service';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';

export async function POST(req: Request) {
  try {
    const user = await protectApi([
      'admin',
      'helpdesk',
      'superadmin',
      'super_admin',
    ]);

    const { ticketId, teknisiId } = await req.json();

    if (!ticketId || !teknisiId) {
      return NextResponse.json(
        { success: false, message: 'ticketId dan teknisiId wajib diisi' },
        { status: 400 },
      );
    }

    const result = await TicketWorkflowService.assignToUser(
      Number(ticketId),
      Number(teknisiId),
      user,
    );

    return NextResponse.json({ success: true, ...result });
  } catch (error: unknown) {
    const message = getErrorMessage(error, 'Failed to reassign');
    return NextResponse.json(
      { success: false, message },
      { status: getErrorStatus(error, 400) },
    );
  }
}
