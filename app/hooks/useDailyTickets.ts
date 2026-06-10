'use client';

import { useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { keepPreviousData } from '@tanstack/react-query';
import { Ticket } from '../types/ticket';
import { fetchWithAuth } from '@/app/libs/fetcher';
import { queryKeys } from '@/app/libs/query-keys';
import { detectSearchType } from '@/lib/search-intent';

interface PaginationInfo {
  currentPage: number;
  totalPages: number;
  total: number;
  limit: number;
}

const UI_PAGE_SIZE = 10;
const DEFAULT_PAGE_SIZE = 10;

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
  const bypassCacheRef = useRef<string | null>(null);
  const searchType = detectSearchType(search);
  const queryKey = queryKeys.tickets.daily({
    search,
    searchType,
    page,
    workzone,
    ctype,
    statusUpdate,
    dept,
    ticketType,
    fetchAll: options?.fetchAll,
    limit: options?.limit ?? DEFAULT_PAGE_SIZE,
  });

  const fetchLimit = options?.limit ?? DEFAULT_PAGE_SIZE;

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    placeholderData: search.trim() ? undefined : keepPreviousData,
    queryFn: async () => {
      const params = new URLSearchParams({ limit: String(fetchLimit) });
      const bypassToken = bypassCacheRef.current;
      bypassCacheRef.current = null;

      const normalizedSearch = search.trim();
      if (normalizedSearch) {
        params.append('search', normalizedSearch);
        if (searchType) params.append('searchType', searchType);
      }
      if (workzone) params.append('workzone', workzone);
      if (ctype) params.append('ctype', ctype);
      if (statusUpdate) params.append('statusUpdate', statusUpdate);
      if (dept) params.append('dept', dept);
      if (ticketType) params.append('ticketType', ticketType);
      params.set('page', String(options?.fetchAll ? 1 : page));
      if (bypassToken) params.set('_t', bypassToken);

      const res = await fetchWithAuth(`/api/tickets/daily?${params.toString()}`);
      if (!res) throw new Error('No response');

      const json = await res.json();
      if (!res.ok || !json?.success) {
        throw new Error(json?.message || 'Failed to fetch daily tickets');
      }

      return json.data as {
        data: Ticket[];
        totalPages: number;
        total: number;
        limit: number;
      };
    },
  });

  const result = useMemo(() => {
    const apiTotalPages = Number(data?.totalPages || 1);
    const totalPages = Number.isFinite(apiTotalPages) && apiTotalPages > 0 ? apiTotalPages : 1;
    const total = Number(data?.total || 0);

    return {
      tickets: data?.data ?? [],
      loading: isLoading,
      isRefreshing: isFetching && !isLoading,
      pagination: {
        ...(options?.fetchAll
          ? { total, totalPages: Math.max(1, Math.ceil(total / UI_PAGE_SIZE)), limit: UI_PAGE_SIZE }
          : { total, totalPages, limit: UI_PAGE_SIZE }),
        currentPage: page,
      },
      refresh: () => {
        bypassCacheRef.current = String(Date.now());
        refetch();
      },
      refreshSilent: () => {
        bypassCacheRef.current = String(Date.now());
        refetch();
      },
    };
  }, [data, isLoading, isFetching, page, options?.fetchAll, refetch]);

  return result;
}
