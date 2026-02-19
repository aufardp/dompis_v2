import { NextResponse } from 'next/server';
import { TicketService } from '@/app/libs/services/tickets.service';
import { protectApi } from '@/app/libs/protectApi';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';

export async function GET(req: Request) {
  try {
    const user = await protectApi([
      'admin',
      'teknisi',
      'helpdesk',
      'superadmin',
    ]);

    const { searchParams } = new URL(req.url);
    const serviceNo = searchParams.get('serviceNo');

    if (!serviceNo) {
      return NextResponse.json(
        { success: false, message: 'serviceNo parameter is required' },
        { status: 400 },
      );
    }

    const result = await TicketService.searchByServiceNo(
      serviceNo,
      user.role,
      user.id_user,
    );

    return NextResponse.json({
      success: true,
      total: result.length,
      data: result,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        success: false,
        message: getErrorMessage(error, 'Error'),
      },
      { status: getErrorStatus(error, 400) },
    );
  }
}
