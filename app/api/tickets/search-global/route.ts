import { NextResponse } from 'next/server';
import { DailyTicketService } from '@/app/libs/services/daily-ticket.service';
import { TicketService } from '@/app/libs/services/tickets.service';
import { CLOSE_STATUS_VALUES } from '@/app/libs/ticket-utils';
import { protectApi } from '@/app/libs/protectApi';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';
import { detectSearchType, type SearchType } from '@/lib/search-intent';
import { getOrSetCache } from '@/lib/cache';

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

function routePathToBucketKey(path: BucketRoute) {
  const hit = DAILY_BUCKET_ROUTES.find((item) => item.path === path);
  return hit?.bucket ?? null;
}

function inferDailyBucketPathFromCandidate(candidate: {
  source_ticket?: string | null;
  jenis_tiket_1?: string | null;
  jenis_tiket_2?: string | null;
  summary?: string | null;
  sqm_update_reason?: string | null;
  classification_path?: string | null;
  customer_type?: string | null;
}): BucketRoute | null {
  const classificationPath = String(candidate.classification_path ?? '')
    .trim()
    .toUpperCase();
  if (classificationPath === 'Z_PERMINTAAN_044') {
    return '/admin/ticket-management/obsolete';
  }

  const sourceTicket = String(candidate.source_ticket ?? '')
    .trim()
    .toUpperCase();
  const jenis1 = String(candidate.jenis_tiket_1 ?? '')
    .trim()
    .toLowerCase();
  const jenis2 = String(candidate.jenis_tiket_2 ?? '')
    .trim()
    .toLowerCase();
  const isSqmUpdate =
    typeof candidate.sqm_update_reason === 'string' &&
    candidate.sqm_update_reason.trim() !== '';

  const isSqm = jenis1.includes('sqm') || jenis2.includes('sqm');
  const isUnspec = jenis1.includes('unspec') || jenis2.includes('unspec');
  const isNonTechnical =
    ['unknown', 'permintaan', 'infracare', 'billing', 'digital_spbu', 'digital spbu', 'non numbering']
      .some((term) => jenis1.includes(term) || jenis2.includes(term));

  if (sourceTicket.includes('PROACTIVE') && isSqm && isSqmUpdate) {
    return '/admin/ticket-management/sqm-update';
  }
  if (sourceTicket.includes('PROACTIVE') && isSqm) {
    return '/admin/ticket-management/kpi-proactive';
  }
  if (sourceTicket.includes('PROACTIVE') && isUnspec) {
    return '/admin/ticket-management/non-kpi-unspec';
  }
  if (isNonTechnical) {
    return '/admin/ticket-management/non-technical';
  }
  if (
    sourceTicket.includes('CUSTOMER') ||
    String(candidate.customer_type ?? '').trim().toUpperCase().includes('HVC')
  ) {
    return '/admin/ticket-management/kpi-customer';
  }

  return null;
}

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

async function resolveExactDailyBucketPath(
  role: string,
  userId: number,
  q: string,
  searchType?: SearchType,
): Promise<{
  bucket: (typeof DAILY_BUCKET_ROUTES)[number]['bucket'];
  path: BucketRoute;
  tab: 'main' | 'validasi';
} | null> {
  const candidate = await TicketService.findSearchCandidate(
    q,
    role,
    userId,
    searchType,
  );
  if (!candidate) return null;

  const path = inferDailyBucketPathFromCandidate(candidate);
  if (!path) return null;

  const bucket = routePathToBucketKey(path);
  if (!bucket) return null;

  const exactFilters = {
    dept: 'all' as const,
    search: q,
    searchType,
    operationalBucket: [bucket],
    ticketId: candidate.id_ticket,
    ticketStatus: CLOSE_STATUS_VALUES,
    includeClosed: true,
  };

  const [validasiHit, mainHit] = await Promise.all([
    DailyTicketService.hasDailyValidasiHit(role, userId, exactFilters),
    DailyTicketService.hasDailyTicketHit(role, userId, exactFilters),
  ]);

  if (validasiHit) {
    return { bucket, path, tab: 'validasi' };
  }

  if (mainHit) {
    return { bucket, path, tab: 'main' };
  }

  return null;
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
    const isExactTicketLookup =
      searchType === 'ticket_code' ||
      searchType === 'service' ||
      /^[\d\s+().-]+$/.test(q.trim());

    const cacheKey = `search-global:${user.role}:${user.id_user}:${searchType || 'unknown'}:${q.trim().toLowerCase()}`;
    const data = await getOrSetCache(cacheKey, async () => {
      if (isExactTicketLookup) {
        const exactHit = await resolveExactDailyBucketPath(
          user.role,
          user.id_user,
          q,
          searchType,
        );
        if (exactHit) {
          return {
            found: true,
            page: 'admin',
            path: exactHit.path,
            tab: exactHit.tab,
            count: 1,
          };
        }
      }

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
        return {
          found: true,
          page: 'admin',
          path: dailyHit.path,
          tab: dailyHit.tab,
          count: 1,
        };
      }
      if (semestaFound) {
        return {
          found: true,
          page: 'semesta',
          path: '/admin/semesta',
          count: 1,
        };
      }
      return { found: false, count: 0 };
    }, 15);

    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { found: false, count: 0, error: getErrorMessage(error, 'Search global failed') },
      { status: getErrorStatus(error, 500) },
    );
  }
}
