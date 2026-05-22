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
const DEFAULT_PAGE_SIZE = 10;

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

        const fetchAll = options?.fetchAll ?? false;
        const fetchLimit = options?.limit ?? DEFAULT_PAGE_SIZE;
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

        params.set('page', String(fetchAll ? 1 : page));
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

        const apiTotalPages = Number(firstJson?.data?.totalPages || 1);
        const totalPages =
          Number.isFinite(apiTotalPages) && apiTotalPages > 0 ? apiTotalPages : 1;
        const total = Number(firstJson?.data?.total || firstRows.length);

        setTickets(firstRows);
        setPagination({
          total,
          totalPages: fetchAll
            ? Math.max(1, Math.ceil(total / UI_PAGE_SIZE))
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
    [search, page, workzone, ctype, statusUpdate, dept, ticketType, options?.fetchAll, options?.limit],
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
