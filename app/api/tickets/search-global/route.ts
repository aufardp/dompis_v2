import { NextResponse } from 'next/server';
import { DailyTicketService } from '@/app/libs/services/daily-ticket.service';
import { TicketService } from '@/app/libs/services/tickets.service';
import { protectApi } from '@/app/libs/protectApi';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';
import { detectSearchType } from '@/lib/search-intent';

export async function GET(request: Request) {
  try {
    const user = await protectApi(['admin', 'superadmin', 'super_admin', 'helpdesk']);
    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q') || '';
    if (!q.trim()) {
      return NextResponse.json({ found: false, count: 0 });
    }
    const searchType = detectSearchType(q);
    const [dailyFound, semestaFound] = await Promise.all([
      DailyTicketService.hasDailyTicketHit(user.role, user.id_user, {
        dept: 'all',
        search: q,
        searchType,
      }),
      (async () => {
        switch (searchType) {
          case 'service':
            return TicketService.hasServiceNoHit(q, user.role, user.id_user);
          case 'contact':
            return TicketService.hasContactNameHit(q, user.role, user.id_user);
          default:
            return TicketService.hasSearchHit(q, user.role, user.id_user);
        }
      })(),
    ]);

    if (dailyFound) {
      return NextResponse.json({ found: true, page: 'admin', count: 1 });
    }
    if (semestaFound) {
      return NextResponse.json({ found: true, page: 'semesta', count: 1 });
    }
    return NextResponse.json({ found: false, count: 0 });
  } catch (error) {
    return NextResponse.json(
      { found: false, count: 0, error: getErrorMessage(error, 'Search global failed') },
      { status: getErrorStatus(error, 500) },
    );
  }
}
