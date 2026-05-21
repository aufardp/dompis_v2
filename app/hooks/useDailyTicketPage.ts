import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchWithAuth } from '@/app/libs/fetcher';
import { Ticket } from '@/app/types/ticket';

type DailyTicketPageFilters = {
  search?: string;
  workzone?: string;
  dept: 'b2b' | 'b2c';
  ctype?: string;
  ticketType?: string[];
  statusUpdate?: string[];
  flagging?: string[];
  page: number;
  limit?: number;
};

type PaginationInfo = {
  currentPage: number;
  totalPages: number;
  total: number;
  limit: number;
};

export function useDailyTicketPage({
  search,
  workzone,
  dept,
  ctype,
  ticketType = [],
  statusUpdate = [],
  flagging = [],
  page,
  limit = 10,
}: DailyTicketPageFilters) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pagination, setPagination] = useState<PaginationInfo>({
    currentPage: page,
    totalPages: 1,
    total: 0,
    limit,
  });
  const requestIdRef = useRef(0);

  const buildParams = useCallback(
    (bypassCache = false) => {
      const params = new URLSearchParams({
        dept,
        page: String(page),
        limit: String(limit),
        sort: 'desc',
      });

      if (search) params.set('search', search);
      if (workzone) params.set('workzone', workzone);
      if (ctype && ctype !== 'all') params.set('ctype', ctype);
      for (const type of ticketType) params.append('ticketType', type);
      for (const status of statusUpdate) params.append('statusUpdate', status);
      for (const flag of flagging) params.append('flagging', flag);
      if (bypassCache) params.set('_t', String(Date.now()));

      return params;
    },
    [
      ctype,
      dept,
      flagging,
      limit,
      page,
      search,
      statusUpdate,
      ticketType,
      workzone,
    ],
  );

  const fetchPage = useCallback(
    async (showLoading = true, bypassCache = false) => {
      const requestId = ++requestIdRef.current;
      try {
        if (showLoading) setLoading(true);
        else setIsRefreshing(true);

        const res = await fetchWithAuth(
          `/api/tickets/daily?${buildParams(bypassCache).toString()}`,
        );
        if (!res) return;

        const json = await res.json();
        if (requestId !== requestIdRef.current) return;
        if (!res.ok || !json?.success) {
          throw new Error(json?.message || 'Failed to fetch daily tickets');
        }

        const data = json.data;
        setTickets(data?.data ?? []);
        setPagination({
          currentPage: Number(data?.page || page),
          totalPages: Math.max(1, Number(data?.totalPages || 1)),
          total: Number(data?.total || 0),
          limit: Number(data?.limit || limit),
        });
      } catch {
        if (requestId !== requestIdRef.current) return;
        setTickets([]);
        setPagination({
          currentPage: page,
          totalPages: 1,
          total: 0,
          limit,
        });
      } finally {
        if (requestId !== requestIdRef.current) return;
        if (showLoading) setLoading(false);
        else setIsRefreshing(false);
      }
    },
    [buildParams, limit, page],
  );

  useEffect(() => {
    fetchPage();
  }, [fetchPage]);

  return useMemo(
    () => ({
      tickets,
      loading,
      isRefreshing,
      pagination,
      refresh: () => fetchPage(true, true),
      refreshSilent: () => fetchPage(false, true),
    }),
    [fetchPage, isRefreshing, loading, pagination, tickets],
  );
}
