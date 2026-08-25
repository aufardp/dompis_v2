import { useQuery } from '@tanstack/react-query';
import { fetchWithAuth } from '@/app/libs/fetcher';
import { queryKeys } from '@/app/libs/query-keys';

export type TtrPeriod = 'today' | 'week' | 'month';

export interface SegComplianceData {
  totalClose: number;
  comply: number;
  notComply: number;
  gamas: { comply: number; notComply: number };
  nonGamas: { comply: number; notComply: number };
  percent: number;
  target: number | null;
  achievement: number | null;
}

export interface TtrComplianceOverviewData {
  period: TtrPeriod;
  mttrSeconds: number | null;
  mttrFormatted: string;
  complyTotal: number;
  notComplyTotal: number;
  workHourCount: number;
  nonWorkHourCount: number;
  sqmWorkHourCompliance: SegComplianceData;
  tiers: {
    manja: SegComplianceData;
    diamond: SegComplianceData;
    platinum: SegComplianceData;
    gold: SegComplianceData;
    reguler: SegComplianceData;
  };
}

type BaseOptions = {
  workzone?: string;
  branch?: string;
  enabled?: boolean;
};

export function useTtrComplianceOverview({
  period,
  workzone,
  branch,
  enabled = true,
}: BaseOptions & { period: TtrPeriod }) {
  const filters = { period, workzone: workzone || undefined, branch: branch || undefined };

  return useQuery({
    queryKey: queryKeys.dashboard.ttrComplianceOverview(filters),
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: false,
    enabled,
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('period', period);
      if (filters.workzone) params.set('workzone', filters.workzone);
      if (filters.branch) params.set('branch', filters.branch);

      const res = await fetchWithAuth(
        `/api/dashboard/ttr-compliance-overview?${params.toString()}`,
      );
      if (!res) throw new Error('No response from ttr-compliance-overview');
      const json = await res.json();
      if (!res.ok || !json?.success) {
        throw new Error(json?.message || 'Failed to fetch ttr-compliance-overview');
      }
      return json.data as TtrComplianceOverviewData | null;
    },
  });
}

export interface SqmDailyTrendDay {
  date: string;
  open: number;
  workHour: number;
  nonWorkHour: number;
}

export function useSqmDailyTrend({ workzone, branch, enabled = true }: BaseOptions) {
  const filters = { workzone: workzone || undefined, branch: branch || undefined };

  return useQuery({
    queryKey: queryKeys.dashboard.sqmDailyTrend(filters),
    staleTime: 60_000,
    refetchInterval: 120_000,
    refetchOnWindowFocus: false,
    enabled,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.workzone) params.set('workzone', filters.workzone);
      if (filters.branch) params.set('branch', filters.branch);

      const res = await fetchWithAuth(
        `/api/dashboard/sqm-daily-trend?${params.toString()}`,
      );
      if (!res) throw new Error('No response from sqm-daily-trend');
      const json = await res.json();
      if (!res.ok || !json?.success) {
        throw new Error(json?.message || 'Failed to fetch sqm-daily-trend');
      }
      return json.data as { days: SqmDailyTrendDay[] };
    },
  });
}

export interface AssuranceGuaranteeData {
  total: number;
  gamasTotal: number;
  nonGamasTotal: number;
  tiers: Record<'diamond' | 'platinum' | 'gold' | 'reguler', { gamas: number; nonGamas: number }>;
  target: number | null;
}

export function useAssuranceGuarantee({ workzone, branch, enabled = true }: BaseOptions) {
  const filters = { workzone: workzone || undefined, branch: branch || undefined };

  return useQuery({
    queryKey: queryKeys.dashboard.assuranceGuarantee(filters),
    staleTime: 60_000,
    refetchInterval: 120_000,
    refetchOnWindowFocus: false,
    enabled,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.workzone) params.set('workzone', filters.workzone);
      if (filters.branch) params.set('branch', filters.branch);

      const res = await fetchWithAuth(
        `/api/dashboard/assurance-guarantee?${params.toString()}`,
      );
      if (!res) throw new Error('No response from assurance-guarantee');
      const json = await res.json();
      if (!res.ok || !json?.success) {
        throw new Error(json?.message || 'Failed to fetch assurance-guarantee');
      }
      return json.data as AssuranceGuaranteeData | null;
    },
  });
}
