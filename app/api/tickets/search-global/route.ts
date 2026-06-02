import { NextResponse } from 'next/server';
import { DailyTicketService } from '@/app/libs/services/daily-ticket.service';
import { TicketService } from '@/app/libs/services/tickets.service';
import { protectApi } from '@/app/libs/protectApi';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';
import { subDays, format } from 'date-fns';

export async function GET(request: Request) {
  try {
    const user = await protectApi(['admin', 'superadmin', 'super_admin', 'helpdesk']);
    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q') || '';
    if (!q.trim()) {
      return NextResponse.json({ found: false, count: 0 });
    }

    const today = format(new Date(), 'yyyy-MM-dd');
    const thirtyDaysAgo = format(subDays(new Date(), 29), 'yyyy-MM-dd');

    const [dailySummary, semestaResult] = await Promise.all([
      DailyTicketService.getDailyTicketSummary(user.role, user.id_user, {
        dept: 'all',
        search: q,
      }),
      TicketService.getTickets(user.role, user.id_user, {
        search: q,
        startDate: thirtyDaysAgo,
        endDate: today,
        limit: 1,
      }),
    ]);

    const dailyCount = dailySummary?.total ?? 0;
    const semestaCount = semestaResult?.total ?? 0;

    if (dailyCount > 0) {
      return NextResponse.json({ found: true, page: 'admin', count: dailyCount });
    }
    if (semestaCount > 0) {
      return NextResponse.json({ found: true, page: 'semesta', count: semestaCount });
    }
    return NextResponse.json({ found: false, count: 0 });
  } catch (error) {
    return NextResponse.json(
      { found: false, count: 0, error: getErrorMessage(error, 'Search global failed') },
      { status: getErrorStatus(error, 500) },
    );
  }
}
