import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchWithAuth } from '@/app/libs/fetcher';
import { queryKeys } from '@/app/libs/query-keys';
import { detectSearchType } from '@/lib/search-intent';

type SummaryCounts = {
  total: number;
  open: number;
  assigned: number;
  close: number;
  regulerCount: number;
  sqmCount: number;
  unspecCount: number;
  customerCount: number;
  ffgCount: number;
  gamasCount: number;
  p1Count: number;
  pPlusCount: number;
};

export type OperationsSummary = {
  stats: {
    total: number;
    unassigned: number;
    assigned: number;
    close: number;
    b2c: number;
    b2b: number;
  };
  b2cStats: {
    summary: SummaryCounts;
    reguler: SummaryCounts;
    hvcGold: SummaryCounts;
    hvcPlatinum: SummaryCounts;
    hvcDiamond: SummaryCounts;
  };
  b2bSummary: SummaryCounts;
  b2bGroups: Record<string, SummaryCounts>;
  serviceAreas: Array<{
    name: string;
    total: number;
    unassigned: number;
    open: number;
    assigned: number;
    close: number;
    teknisi: number;
    reguler: number;
    hvcGold: number;
    hvcPlatinum: number;
    hvcDiamond: number;
  }>;
  focusCounts: {
    diamond: number;
    p1: number;
    gamas: number;
    ffg: number;
    carryOver: number;
  };
  generatedAt: string;
};

type OperationsSummaryFilters = {
  search?: string;
  workzone?: string;
  dept?: 'all' | 'b2b' | 'b2c';
  enabled?: boolean;
};

export function useOperationsSummary({
  search,
  workzone,
  dept,
  enabled = true,
}: OperationsSummaryFilters) {
  const normalizedSearch = search?.trim() || undefined;
  const searchType = detectSearchType(normalizedSearch);
  const filters = useMemo(
    () => ({
      search: normalizedSearch,
      searchType,
      workzone: workzone || undefined,
      dept: dept || undefined,
      scopeVersion: 'global-v1',
    }),
    [dept, normalizedSearch, searchType, workzone],
  );

  return useQuery({
    queryKey: queryKeys.dashboard.operations(filters),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    enabled,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.search) {
        params.set('search', filters.search);
        if (searchType) params.set('searchType', searchType);
      }
      if (filters.workzone) params.set('workzone', filters.workzone);
      if (filters.dept && filters.dept !== 'all') params.set('dept', filters.dept);

      const res = await fetchWithAuth(
        `/api/dashboard/operations-summary?${params.toString()}`,
      );
      if (!res) throw new Error('No response from operations summary');

      const json = await res.json();
      if (!res.ok || !json?.success) {
        throw new Error(json?.message || 'Failed to fetch operations summary');
      }

      return json.data as OperationsSummary;
    },
  });
}
