import { useCallback, useEffect, useState, useMemo } from 'react';
import { Ticket } from '../types/ticket';
import { fetchWithAuth } from '@/app/libs/fetcher';

interface PaginationInfo {
  currentPage: number;
  totalPages: number;
  total: number;
  limit: number;
}

export function useAdminTickets(
  search: string,
  page: number,
  workzone?: string,
  ctype?: string,
) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState<PaginationInfo>({
    currentPage: 1,
    totalPages: 1,
    total: 0,
    limit: 10,
  });

  const fetchData = useCallback(async () => {
    console.log('[useAdminTickets] Starting fetch...');
    try {
      setLoading(true);

      const params = new URLSearchParams({
        page: String(page),
        limit: '10',
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

      console.log(
        '[useAdminTickets] Fetching from /api/tickets?',
        params.toString(),
      );

      const res = await fetchWithAuth(`/api/tickets?${params.toString()}`);

      if (!res) {
        console.log(
          '[useAdminTickets] No response - possibly redirecting to login',
        );
        return;
      }

      const data = await res.json();
      console.log('[useAdminTickets] Response:', {
        ok: res.ok,
        status: res.status,
        data,
      });

      if (!res.ok) {
        console.log('[useAdminTickets] Response not ok:', data.message);
        throw new Error(data.message || 'Failed fetch tickets');
      }

      if (data.success && data.data) {
        console.log('[useAdminTickets] Setting tickets:', {
          ticketsCount: data.data.data?.length ?? 0,
          total: data.data.total,
          firstTicket: data.data.data?.[0],
        });
        setTickets(data.data.data ?? []);
        setPagination({
          currentPage: data.data.page ?? 1,
          totalPages: data.data.totalPages ?? 1,
          total: data.data.total ?? 0,
          limit: data.data.limit ?? 10,
        });
      } else {
        console.log('[useAdminTickets] No data in response:', data);
      }
    } catch (err) {
      console.error('[useAdminTickets] Catch error:', err);
      setTickets([]);
    } finally {
      setLoading(false);
      console.log('[useAdminTickets] Done, loading=false');
    }
  }, [search, page, workzone, ctype]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const memoizedReturn = useMemo(
    () => ({
      tickets,
      loading,
      pagination,
      refresh: fetchData,
    }),
    [tickets, loading, pagination, fetchData],
  );

  return memoizedReturn;
}
