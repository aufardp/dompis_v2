export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { enforceApiRateLimit } from '@/lib/api-rate-limit';
import { protectApi } from '@/app/libs/protectApi';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';
import { TicketService } from '@/app/libs/services/tickets.service';

export async function GET(request: NextRequest) {
  try {
    const rateLimited = await enforceApiRateLimit(request, {
      namespace: 'ticket-global-search',
      limit: 30,
      windowSeconds: 60,
    });
    if (rateLimited) return rateLimited;

    const user = await protectApi(['teknisi']);

    const { searchParams } = new URL(request.url);
    const query = (searchParams.get('q') || '').trim();
    if (query.length < 3) {
      return NextResponse.json({ success: true, data: { data: [], total: 0 } });
    }

    const result = await TicketService.globalSearchForTeknisi(query, {
      page: 1,
      limit: 20,
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: getErrorMessage(error, 'Search global failed') },
      { status: getErrorStatus(error, 500) },
    );
  }
}