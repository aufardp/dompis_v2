'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchWithAuth } from '@/app/libs/fetcher';
import { queryKeys } from '@/app/libs/query-keys';
import type { TicketCtype } from '@/app/types/ticket';
import { detectSearchType } from '@/lib/search-intent';

export type DatePreset = '7d' | '30d' | 'ytd' | 'custom';

export type TicketAnalyticsFilters = {
  search?: string;
  workzone?: string;
  ctype?: TicketCtype | string;
  dept?: string;
  ticketType?: string;
  statusUpdate?: string;
  startDate?: string;
  endDate?: string;
  preset?: DatePreset;
};

export type StatMetrics = {
  total: number;
  open: number;
  onProgress: number;
  closed: number;
};

export type TicketTypeDatum = {
  key: string;
  label: string;
  count: number;
};

export type WorkzoneDatum = {
  workzone: string;
  count: number;
};

export type TrendDatum = {
  key: string;
  label: string;
  count: number;
};

export type TicketAnalytics = {
  metrics: StatMetrics;
  byType: TicketTypeDatum[];
  byWorkzone: WorkzoneDatum[];
  trend: TrendDatum[];
  truncated: boolean;
};

export function useTicketAnalytics(filters: TicketAnalyticsFilters) {
  const searchType = detectSearchType(filters.search);
  const normalizedFilters = useMemo(
    () => ({
      search: filters.search || undefined,
      searchType,
      workzone: filters.workzone || undefined,
      ctype: filters.ctype ? String(filters.ctype) : undefined,
      dept: filters.dept || undefined,
      ticketType: filters.ticketType || undefined,
      statusUpdate: filters.statusUpdate || undefined,
      startDate: filters.startDate || undefined,
      endDate: filters.endDate || undefined,
    }),
    [
      filters.search,
      searchType,
      filters.workzone,
      filters.ctype,
      filters.dept,
      filters.ticketType,
      filters.statusUpdate,
      filters.startDate,
      filters.endDate,
    ],
  );

  const query = useQuery({
    queryKey: queryKeys.dashboard.semestaSummary(normalizedFilters),
    staleTime: 60_000,
    queryFn: async () => {
      const params = new URLSearchParams();

      for (const [key, value] of Object.entries(normalizedFilters)) {
        if (value) params.set(key, value);
      }

      const res = await fetchWithAuth(
        `/api/dashboard/semesta-summary?${params.toString()}`,
      );

      if (!res) throw new Error('No response');

      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        throw new Error(json?.message || 'Failed to load analytics');
      }

      return json.data as TicketAnalytics;
    },
  });

  return {
    data: query.data ?? null,
    loading: query.isLoading,
    error: query.error instanceof Error ? query.error.message : null,
    refresh: query.refetch,
  };
}
