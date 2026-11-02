import { NextRequest, NextResponse } from 'next/server';
import { protectApi } from '@/app/libs/protectApi';
import { enforceApiRateLimit } from '@/lib/api-rate-limit';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';
import { BRANCH_LIST } from '@/app/libs/priority/constants';
import { parsePrioritySelection } from '@/app/libs/priority/selection';
import { queryPriorityTickets } from '@/app/libs/priority/queries';
import { logger } from '@/lib/observability/logger';

export async function GET(request: NextRequest) {
  try {
    const limited = await enforceApiRateLimit(request, { namespace: 'priority-tickets', limit: 120, windowSeconds: 60 });
    if (limited) return limited;
    const user = await protectApi(['superadmin', 'admin', 'admin_branch', 'senior_leader']);
    const { branch, selection } = parsePrioritySelection(request.nextUrl.searchParams);
    const integer = (name: string, fallback: number, max: number) => {
      const value = Number(request.nextUrl.searchParams.get(name) ?? fallback);
      return Number.isFinite(value) ? Math.min(max, Math.max(1, Math.floor(value))) : fallback;
    };
    const page = integer('page', 1, 1000000);
    const limit = integer('limit', 20, 100);
    const tickets = await queryPriorityTickets(branch, selection, user.id_user, user.role);
    return NextResponse.json({ success: true, data: {
      meta: {
        branch, branch_name: BRANCH_LIST.find(item => item.code === branch)!.name,
        ...selection, page, limit, total: tickets.length, has_more: page * limit < tickets.length,
        counts: selection.kind === 'reguler' ? {
          all: tickets.length,
          within: tickets.filter(row => 'deadline_at' in row.evidence && row.evidence.deadline_at && row.evidence.ttr_state !== 'over').length,
          near: tickets.filter(row => 'ttr_state' in row.evidence && row.evidence.ttr_state === 'near').length,
          over: tickets.filter(row => 'ttr_state' in row.evidence && row.evidence.ttr_state === 'over').length,
        } : undefined,
      },
      rows: tickets.slice((page - 1) * limit, page * limit),
    } });
  } catch (error) {
    const status = getErrorStatus(error, 500);
    if (status >= 500) logger.error('Priority tickets error', error);
    return NextResponse.json({ success: false, message: getErrorMessage(error, 'Gagal memuat data tiket priority.') }, { status });
  }
}
