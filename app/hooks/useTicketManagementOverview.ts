'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchWithAuth } from '@/app/libs/fetcher';
import { queryKeys } from '@/app/libs/query-keys';

type BucketSummary = {
  total: number;
  open: number;
  assigned: number;
  close: number;
  ffgCount?: number;
  gamasCount?: number;
  p1Count?: number;
  pPlusCount?: number;
};

export type TicketManagementOverview = {
  generatedAt: string;
  totals: {
    total: number;
    b2c: number;
    b2b: number;
    unassigned: number;
    assigned: number;
    close: number;
    ffgCount?: number;
    gamasCount?: number;
    p1Count?: number;
    pPlusCount?: number;
  };
  cards: {
    kpiCustomer: BucketSummary;
    kpiProactive: BucketSummary;
    nonKpiUnspec: BucketSummary;
    nonTechnical: BucketSummary;
    sqmUpdate: BucketSummary;
    obsolete: BucketSummary;
  };
};

export function useTicketManagementOverview(
  enabled = true,
  workzone?: string,
) {
  return useQuery({
    queryKey: [
      ...queryKeys.dashboard.all,
      'ticket-management-overview',
      'v4',
      workzone || 'all',
    ],
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    enabled,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (workzone) params.set('workzone', workzone);
      const url = params.toString()
        ? `/api/dashboard/ticket-management-overview?${params.toString()}`
        : '/api/dashboard/ticket-management-overview';

      const res = await fetchWithAuth(url);
      if (!res) throw new Error('No response from ticket management overview');

      const json = await res.json();
      if (!res.ok || !json?.success) {
        throw new Error(json?.message || 'Failed to fetch ticket management overview');
      }

      return json.data as TicketManagementOverview;
    },
  });
}
