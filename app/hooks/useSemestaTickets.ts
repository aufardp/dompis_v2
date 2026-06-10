'use client';

import { useMemo } from 'react';
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

export function useSemestaTickets(
  search: string,
  page: number,
  workzone?: string,
  ctype?: string,
  statusUpdate?: string,
  dept?: string,
  ticketType?: string,
  startDate?: string,
  endDate?: string,
) {
  const searchType = detectSearchType(search);
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: queryKeys.tickets.semesta({ search, searchType, page, workzone, ctype, statusUpdate, dept, ticketType, startDate, endDate }),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    placeholderData: search.trim() ? undefined : keepPreviousData,
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        limit: '50',
      });

      if (search) {
        params.append('search', search);
        if (searchType) params.append('searchType', searchType);
      }
      if (workzone) params.append('workzone', workzone);
      if (ctype) params.append('ctype', ctype);
      if (statusUpdate) params.append('statusUpdate', statusUpdate);
      if (dept) params.append('dept', dept);
      if (ticketType) params.append('ticketType', ticketType);
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);

      const res = await fetchWithAuth(`/api/tickets?${params.toString()}`);

      if (!res) throw new Error('No response');

      const result = await res.json();
      if (!res.ok) throw new Error(result.message || 'Failed fetch tickets');

      return result.data as {
        data: Ticket[];
        page: number;
        totalPages: number;
        total: number;
        limit: number;
      };
    },
  });

  const result = useMemo(() => ({
    tickets: data?.data ?? [],
    loading: isLoading,
    isRefreshing: isFetching && !isLoading,
    pagination: {
      currentPage: data?.page ?? 1,
      totalPages: data?.totalPages ?? 1,
      total: data?.total ?? 0,
      limit: data?.limit ?? 50,
    } as PaginationInfo,
    refresh: () => { refetch(); },
  }), [data, isLoading, isFetching, refetch]);

  return result;
}
