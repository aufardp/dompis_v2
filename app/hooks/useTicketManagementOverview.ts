import { useQuery } from '@tanstack/react-query';
import { fetchWithAuth } from '@/app/libs/fetcher';
import { queryKeys } from '@/app/libs/query-keys';

export type TicketManagementBucketSummary = {
  total: number;
  open: number;
  assigned: number;
  close: number;
  ffgCount: number;
  gamasCount: number;
  p1Count: number;
  pPlusCount: number;
};

export type TicketManagementOverviewData = {
  generatedAt: string;
  totals: {
    total: number;
    b2c: number;
    b2b: number;
    unassigned: number;
    assigned: number;
    close: number;
    ffgCount: number;
    gamasCount: number;
    p1Count: number;
    pPlusCount: number;
  };
  cards: {
    kpiCustomer: TicketManagementBucketSummary;
    kpiProactive: TicketManagementBucketSummary;
    nonKpiUnspec: TicketManagementBucketSummary;
    nonTechnical: TicketManagementBucketSummary;
    sqmUpdate: TicketManagementBucketSummary;
    obsolete: TicketManagementBucketSummary;
  };
  h1: {
    total: number;
    open: number;
    assigned: number;
    close: number;
    p1Count: number;
    pPlusCount: number;
    ffgCount: number;
    gamasCount: number;
  } | null;
};

type Options = {
  workzone?: string;
  branch?: string;
  enabled?: boolean;
};

export function useTicketManagementOverview({ workzone, branch, enabled = true }: Options) {
  const filters = { workzone: workzone || undefined, branch: branch || undefined };

  return useQuery({
    queryKey: queryKeys.dashboard.ticketManagementOverview(filters),
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: false,
    enabled,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.workzone) params.set('workzone', filters.workzone);
      if (filters.branch) params.set('branch', filters.branch);

      const res = await fetchWithAuth(
        `/api/dashboard/ticket-management-overview?${params.toString()}`,
      );
      if (!res) throw new Error('No response from ticket management overview');

      const json = await res.json();
      if (!res.ok || !json?.success) {
        throw new Error(json?.message || 'Failed to fetch ticket management overview');
      }

      return json.data as TicketManagementOverviewData;
    },
  });
}
