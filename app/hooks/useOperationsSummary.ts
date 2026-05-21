import { useQuery } from '@tanstack/react-query';
import { fetchWithAuth } from '@/app/libs/fetcher';

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
};

export function useOperationsSummary({
  search,
  workzone,
  dept,
}: OperationsSummaryFilters) {
  return useQuery({
    queryKey: ['operations-summary', search ?? '', workzone ?? '', dept ?? 'all'],
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (workzone) params.set('workzone', workzone);
      if (dept && dept !== 'all') params.set('dept', dept);

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
