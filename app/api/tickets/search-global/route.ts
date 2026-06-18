import { NextResponse } from 'next/server';
import { DailyTicketService } from '@/app/libs/services/daily-ticket.service';
import { TicketService } from '@/app/libs/services/tickets.service';
import { protectApi } from '@/app/libs/protectApi';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';
import { detectSearchType, type SearchType } from '@/lib/search-intent';

type BucketRoute =
  | '/admin/ticket-management/kpi-customer'
  | '/admin/ticket-management/kpi-proactive'
  | '/admin/ticket-management/non-kpi-unspec'
  | '/admin/ticket-management/non-technical'
  | '/admin/ticket-management/sqm-update'
  | '/admin/ticket-management/obsolete';

const DAILY_BUCKET_ROUTES: Array<{
  bucket: 'obsolete' | 'sqm_update' | 'non_kpi_unspec' | 'non_technical' | 'kpi_proactive' | 'kpi_customer';
  path: BucketRoute;
}> = [
  { bucket: 'obsolete', path: '/admin/ticket-management/obsolete' },
  { bucket: 'sqm_update', path: '/admin/ticket-management/sqm-update' },
  { bucket: 'non_kpi_unspec', path: '/admin/ticket-management/non-kpi-unspec' },
  { bucket: 'non_technical', path: '/admin/ticket-management/non-technical' },
  { bucket: 'kpi_proactive', path: '/admin/ticket-management/kpi-proactive' },
  { bucket: 'kpi_customer', path: '/admin/ticket-management/kpi-customer' },
];

async function resolveDailyBucketPath(
  role: string,
  userId: number,
  q: string,
  searchType?: SearchType,
): Promise<{
  bucket: (typeof DAILY_BUCKET_ROUTES)[number]['bucket'];
  path: BucketRoute;
  tab: 'main' | 'validasi';
} | null> {
  const hits = await Promise.all(
    DAILY_BUCKET_ROUTES.map(async (item) => {
      const filters = {
        dept: 'all' as const,
        search: q,
        searchType,
        operationalBucket: [item.bucket],
      };
      const validasiHit = await DailyTicketService.hasDailyValidasiHit(
        role,
        userId,
        filters,
      );
      if (validasiHit) return { found: true, path: item.path, bucket: item.bucket, tab: 'validasi' as const };

      const found = await DailyTicketService.hasDailyTicketHit(role, userId, filters);
      return { found, path: item.path, bucket: item.bucket, tab: 'main' as const };
    }),
  );

  const hit = hits.find((item) => item.found);
  return hit ? { bucket: hit.bucket, path: hit.path, tab: hit.tab } : null;
}

export async function GET(request: Request) {
  try {
    const user = await protectApi(['admin', 'superadmin', 'super_admin', 'helpdesk']);
    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q') || '';
    if (!q.trim()) {
      return NextResponse.json({ found: false, count: 0 });
    }
    const searchType = detectSearchType(q);
    const [dailyHit, semestaFound] = await Promise.all([
      resolveDailyBucketPath(user.role, user.id_user, q, searchType),
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

    if (dailyHit) {
      return NextResponse.json({
        found: true,
        page: 'admin',
        path: dailyHit.path,
        tab: dailyHit.tab,
        count: 1,
      });
    }
    if (semestaFound) {
      return NextResponse.json({
        found: true,
        page: 'semesta',
        path: '/admin/semesta',
        count: 1,
      });
    }
    return NextResponse.json({ found: false, count: 0 });
  } catch (error) {
    return NextResponse.json(
      { found: false, count: 0, error: getErrorMessage(error, 'Search global failed') },
      { status: getErrorStatus(error, 500) },
    );
  }
}
