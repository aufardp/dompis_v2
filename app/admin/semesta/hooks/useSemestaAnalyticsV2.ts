'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchWithAuth } from '@/app/libs/fetcher';
import { queryKeys } from '@/app/libs/query-keys';

export type SemestaAnalyticsV2Kpi = {
  total: number;
  open: number;
  onProgress: number;
  closed: number;
  gaul: number;
  lapul: number;
  gamas: number;
  unspec: number;
  unspecB2b: number;
  sqm: number;
  sqmCcan: number;
};

export type TrendByJenis = {
  date: string;
} & Record<string, number>;

export type TrendByDept = {
  date: string;
  b2c: number;
  b2b: number;
};

export type TrendGaulLapul = {
  date: string;
  count: number;
};

export type WorkzoneAnalytics = {
  workzone: string;
  total: number;
  gamas: number;
  sqm: number;
  sqmCcan: number;
  unspec: number;
  unspecB2b: number;
  gaul: number;
  lapul: number;
};

export type TopGaulService = {
  service_no: string;
  occurrences: number;
  workzone: string;
  lastIncident: string;
  lastDate: string;
};

export type TopLapulIncident = {
  incident: string;
  occurrences: number;
  workzone: string;
  firstDate: string;
};

export type SemestaAnalyticsV2Response = {
  kpi: SemestaAnalyticsV2Kpi;
  trendByJenis: TrendByJenis[];
  trendByDept: TrendByDept[];
  trendGaul: TrendGaulLapul[];
  trendLapul: TrendGaulLapul[];
  byWorkzone: WorkzoneAnalytics[];
  topGaulServices: TopGaulService[];
  topLapulIncidents: TopLapulIncident[];
  dateRange: { from: string; to: string };
  granularity: 'day' | 'month';
  truncated: boolean;
};

export type SemestaAnalyticsV2Filters = {
  startDate?: string;
  endDate?: string;
  workzone?: string;
  dept?: 'all' | 'b2b' | 'b2c' | 'netral' | 'neutral';
  ticketType?: string;
};

export function useSemestaAnalyticsV2(filters: SemestaAnalyticsV2Filters) {
  const query = useQuery({
    queryKey: queryKeys.dashboard.semestaSummary({ version: 2, ...filters }),
    staleTime: 120_000,
    gcTime: 300_000,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.startDate) params.set('startDate', filters.startDate);
      if (filters.endDate) params.set('endDate', filters.endDate);
      if (filters.workzone) params.set('workzone', filters.workzone);
      if (filters.dept && filters.dept !== 'all') params.set('dept', filters.dept === 'neutral' ? 'netral' : filters.dept);
      if (filters.ticketType) params.set('ticketType', filters.ticketType);

      const res = await fetchWithAuth(`/api/dashboard/semesta-analytics?${params}`);
      if (!res) throw new Error('No response');
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message ?? 'Failed');
      return json.data as SemestaAnalyticsV2Response;
    },
  });

  return {
    data: query.data ?? null,
    loading: query.isLoading,
    refetching: query.isRefetching,
    error: query.error instanceof Error ? query.error.message : null,
    refresh: query.refetch,
  };
}
