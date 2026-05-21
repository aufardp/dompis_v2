import { useCallback, useEffect, useState, useMemo, useRef } from 'react';
import { Ticket } from '../types/ticket';
import { fetchWithAuth } from '@/app/libs/fetcher';

interface PaginationInfo {
  currentPage: number;
  totalPages: number;
  total: number;
  limit: number;
}

const UI_PAGE_SIZE = 10;
// Fetch in bigger chunks so we can reach 5k+ rows fast.
const FETCH_PAGE_SIZE = 500;
// Safety cap to avoid runaway requests if API misbehaves.
const MAX_TOTAL_PAGES = 200;

/**
 * React hook for fetching daily tickets.
 *
 * Daily tickets are tickets that:
 * - Were synced today (sync_date = TODAY) OR
 * - Have a pending_dompis (not null and not empty)
 *
 * This creates a "working board" for daily operations.
 */
export function useDailyTickets(
  search: string,
  page: number,
  workzone?: string,
  ctype?: string,
  statusUpdate?: string,
  dept?: string,
  ticketType?: string,
  options?: { fetchAll?: boolean; limit?: number },
) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pagination, setPagination] = useState<
    Omit<PaginationInfo, 'currentPage'>
  >({
    totalPages: 1,
    total: 0,
    limit: UI_PAGE_SIZE,
  });

  const requestIdRef = useRef(0);

  const fetchData = useCallback(
    async (showLoading = true, bypassCache = false) => {
      const requestId = ++requestIdRef.current;
      try {
        if (showLoading) {
          setLoading(true);
        } else {
          setIsRefreshing(true);
        }

        const fetchAll = options?.fetchAll ?? true;
        const fetchLimit = options?.limit ?? FETCH_PAGE_SIZE;
        const params = new URLSearchParams({
          limit: String(fetchLimit),
        });

        if (search) {
          params.append('search', search);
        }

        if (workzone) {
          params.append('workzone', workzone);
        }

        if (ctype) {
          params.append('ctype', ctype);
        }

        if (statusUpdate) {
          params.append('statusUpdate', statusUpdate);
        }

        if (dept) {
          params.append('dept', dept);
        }

        if (ticketType) {
          params.append('ticketType', ticketType);
        }

        if (bypassCache) {
          params.append('_t', String(Date.now()));
        }

        const all: Ticket[] = [];

        // Page 1 first (to get totalPages)
        params.set('page', '1');
        const firstRes = await fetchWithAuth(
          `/api/tickets/daily?${params.toString()}`,
        );
        if (!firstRes) {
          console.log(
            '[useDailyTickets] No response - possibly redirecting to login',
          );
          return;
        }

        const firstJson = await firstRes.json();
        if (requestId !== requestIdRef.current) return;

        if (!firstRes.ok) {
          throw new Error(firstJson.message || 'Failed fetch daily tickets');
        }

        const firstRows: Ticket[] =
          (firstJson?.success && firstJson?.data?.data) || [];
        all.push(...firstRows);

        const apiTotalPages = Number(firstJson?.data?.totalPages || 1);
        const totalPages =
          Number.isFinite(apiTotalPages) && apiTotalPages > 0
            ? Math.min(apiTotalPages, MAX_TOTAL_PAGES)
            : 1;

        for (let p = 2; fetchAll && p <= totalPages; p++) {
          if (requestId !== requestIdRef.current) return;
          params.set('page', String(p));

          const res = await fetchWithAuth(
            `/api/tickets/daily?${params.toString()}`,
          );
          if (!res) return;

          const json = await res.json();
          if (requestId !== requestIdRef.current) return;
          if (!res.ok) {
            throw new Error(json.message || 'Failed fetch daily tickets');
          }

          const rows: Ticket[] = (json?.success && json?.data?.data) || [];
          all.push(...rows);

          // Early stop if backend returns short page
          if (rows.length < fetchLimit) break;
        }

        // Dedupe by idTicket
        const seen = new Set<number>();
        const deduped: Ticket[] = [];
        for (const t of all) {
          const id = Number(t?.idTicket);
          if (!Number.isFinite(id) || id <= 0) continue;
          if (seen.has(id)) continue;
          seen.add(id);
          deduped.push(t);
        }

        setTickets(deduped);
        setPagination({
          total: deduped.length,
          totalPages: fetchAll
            ? Math.max(1, Math.ceil(deduped.length / UI_PAGE_SIZE))
            : Math.max(1, apiTotalPages),
          limit: UI_PAGE_SIZE,
        });
      } catch (err) {
        if (requestId !== requestIdRef.current) return;
        setTickets([]);
      } finally {
        if (requestId !== requestIdRef.current) return;
        if (showLoading) {
          setLoading(false);
        } else {
          setIsRefreshing(false);
        }
      }
    },
    [search, workzone, ctype, statusUpdate, dept, ticketType, options?.fetchAll, options?.limit],
  );

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const memoizedReturn = useMemo(
    () => ({
      tickets,
      loading,
      isRefreshing,
      pagination: { ...pagination, currentPage: page },
      refresh: () => fetchData(true, true),
      refreshSilent: () => fetchData(false, true),
    }),
    [tickets, loading, isRefreshing, pagination, page, fetchData],
  );

  return memoizedReturn;
}
