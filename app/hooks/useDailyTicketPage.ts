'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { keepPreviousData } from '@tanstack/react-query';
import { fetchWithAuth } from '@/app/libs/fetcher';
import { Ticket } from '@/app/types/ticket';
import { queryKeys } from '@/app/libs/query-keys';
import { detectSearchType } from '@/lib/search-intent';

type DailyTicketPageFilters = {
  search?: string;
  symptom?: string;
  excludeSymptom?: string;
  workzone?: string;
  dept: 'all' | 'b2b' | 'b2c';
  ctype?: string;
  ticketType?: string[];
  ticketGroup?: string[];
  operationalBucket?: string[];
  regulerOnly?: boolean;
  anomalyBucket?: string[];
  statusUpdate?: string[];
  ticketStatus?: string[];
  flagging?: string[];
  page: number;
  limit?: number;
  validasiPage?: number;
  validasiLimit?: number;
  enabled?: boolean;
  includeValidasi?: boolean;
};

type PaginationInfo = {
  currentPage: number;
  totalPages: number;
  total: number;
  limit: number;
};

type TicketTypeOption = {
  key: string;
  label: string;
  total?: number;
  open?: number;
  assigned?: number;
  close?: number;
};

export function useDailyTicketPage({
  search,
  symptom,
  excludeSymptom,
  workzone,
  dept,
  ctype,
  ticketType = [],
  ticketGroup = [],
  operationalBucket = [],
  regulerOnly,
  anomalyBucket = [],
  statusUpdate = [],
  ticketStatus = [],
  flagging = [],
  page,
  limit = 10,
  validasiPage = 1,
  validasiLimit = 10,
  enabled = true,
  includeValidasi = true,
}: DailyTicketPageFilters) {
  const searchType = detectSearchType(search);
  const queryKey = queryKeys.tickets.daily({
    search,
    symptom,
    excludeSymptom,
    searchType,
    workzone,
    dept,
    ctype,
    ticketType,
    ticketGroup,
    operationalBucket,
    regulerOnly,
    anomalyBucket,
    statusUpdate,
    ticketStatus,
    flagging,
    page,
    limit,
    validasiPage,
    validasiLimit,
    includeValidasi,
  });

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    placeholderData: keepPreviousData,
    enabled,
    queryFn: async () => {
      const params = new URLSearchParams({
        dept,
        page: String(page),
        limit: String(limit),
        validasiPage: String(validasiPage),
        validasiLimit: String(validasiLimit),
        sort: 'desc',
      });
      if (!includeValidasi) params.set('includeValidasi', 'false');

      const normalizedSearch = search?.trim();
      if (normalizedSearch) {
        params.set('search', normalizedSearch);
        if (searchType) params.set('searchType', searchType);
      }
      const normalizedSymptom = symptom?.trim();
      if (normalizedSymptom) {
        params.set('symptom', normalizedSymptom);
      }
      const normalizedExcludeSymptom = excludeSymptom?.trim();
      if (normalizedExcludeSymptom) {
        params.set('excludeSymptom', normalizedExcludeSymptom);
      }
      if (workzone) params.set('workzone', workzone);
      if (ctype && ctype !== 'all') params.set('ctype', ctype);
      for (const type of ticketType) params.append('ticketType', type);
      for (const group of ticketGroup) params.append('ticketGroup', group);
      for (const bucket of operationalBucket) {
        params.append('operationalBucket', bucket);
      }
      if (typeof regulerOnly === 'boolean') {
        params.set('regulerOnly', regulerOnly ? 'true' : 'false');
      }
      for (const bucket of anomalyBucket) params.append('anomalyBucket', bucket);
      for (const status of statusUpdate) params.append('statusUpdate', status);
      for (const status of ticketStatus) params.append('ticketStatus', status);
      for (const flag of flagging) params.append('flagging', flag);

      const res = await fetchWithAuth(
        `/api/tickets/daily?${params.toString()}`,
      );
      if (!res) throw new Error('No response');

      const json = await res.json();
      if (!res.ok || !json?.success) {
        throw new Error(json?.message || 'Failed to fetch daily tickets');
      }

      return json.data as {
        data: Ticket[];
        summary?: {
          total: number;
          open: number;
          assigned: number;
          close: number;
          ffgCount?: number;
          gamasCount?: number;
          p1Count?: number;
          pPlusCount?: number;
        };
        statusOptions?: string[];
        ticketTypeOptions?: TicketTypeOption[];
        validasiTickets: Ticket[];
        validasiCount: number;
        page: number;
        totalPages: number;
        total: number;
        limit: number;
        validasiPage: number;
        validasiTotalPages: number;
        validasiLimit: number;
      };
    },
  });

  const result = useMemo(() => {
    const pagination: PaginationInfo = {
      currentPage: Number(data?.page || page),
      totalPages: Math.max(1, Number(data?.totalPages || 1)),
      total: Number(data?.total || 0),
      limit: Number(data?.limit || limit),
    };

    const validasiPagination: PaginationInfo = {
      currentPage: Number(data?.validasiPage || validasiPage),
      totalPages: Math.max(1, Number(data?.validasiTotalPages || 1)),
      total: Number(data?.validasiCount || 0),
      limit: Number(data?.validasiLimit || validasiLimit),
    };

    return {
      tickets: data?.data ?? [],
      validasiTickets: data?.validasiTickets ?? [],
      summary: data?.summary ?? {
        total: Number(data?.total ?? 0),
        open: 0,
        assigned: 0,
        close: 0,
        ffgCount: 0,
        gamasCount: 0,
        p1Count: 0,
        pPlusCount: 0,
      },
      statusOptions: data?.statusOptions ?? [],
      ticketTypeOptions: data?.ticketTypeOptions ?? [],
      loading: isLoading,
      isRefreshing: isFetching && !isLoading,
      validasiCount: Number(data?.validasiCount ?? 0),
      pagination,
      validasiPagination,
      refresh: () => { refetch(); },
      refreshSilent: () => { refetch(); },
    };
  }, [data, isLoading, isFetching, page, limit, validasiPage, validasiLimit, refetch]);

  return result;
}
