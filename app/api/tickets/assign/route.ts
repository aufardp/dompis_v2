export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { protectApi } from '@/app/libs/protectApi';
import { TicketWorkflowService } from '@/app/libs/services/ticketWorkflow.service';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';

export async function POST(req: Request) {
  try {
    // 🔐 Hanya admin yang boleh assign
    const user = await protectApi([
      'admin',
      'helpdesk',
      'superadmin',
      'super_admin',
    ]);

    const body = await req.json();
    const { ticketId, teknisiUserId } = body;

    // 🔎 Validasi input
    if (!ticketId || !teknisiUserId) {
      return NextResponse.json(
        {
          success: false,
          message: 'ticketId dan teknisiUserId wajib diisi',
        },
        { status: 400 },
      );
    }

    const result = await TicketWorkflowService.assignToUser(
      Number(ticketId),
      Number(teknisiUserId),
      user,
    );

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        success: false,
        message: getErrorMessage(error, 'Failed to assign ticket'),
      },
      { status: getErrorStatus(error, 400) },
    );
  }
}
