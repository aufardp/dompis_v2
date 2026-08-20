export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { enforceApiRateLimit } from '@/lib/api-rate-limit';
import { protectApi } from '@/app/libs/protectApi';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';
import { getTicketDetailForActor } from '@/app/libs/services/ticketDetail.service';

export async function GET(request: NextRequest) {
  try {
    const rateLimited = await enforceApiRateLimit(request, {
      namespace: 'ticket-global-detail',
      limit: 30,
      windowSeconds: 60,
    });
    if (rateLimited) return rateLimited;

    const { searchParams } = new URL(request.url);
    const ticketId = searchParams.get('id');
    if (!ticketId) {
      return NextResponse.json({ success: false, message: 'Missing ticket id' }, { status: 400 });
    }

    const user = await protectApi(['teknisi']);
    const ticket = await getTicketDetailForActor(Number(ticketId), user, { allowGlobalReadOnly: true });
    if (!ticket) {
      return NextResponse.json({ success: false, message: 'Ticket not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: ticket });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: getErrorMessage(error, 'Global detail failed') },
      { status: getErrorStatus(error, 500) },
    );
  }
}