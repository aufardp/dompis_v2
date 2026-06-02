'use client';

import { useQuery } from '@tanstack/react-query';
import {
  Technician,
  TechnicianSummary,
  TechnicianFilters,
  TechnicianApiResponse,
} from '@/app/types/technician';
import { fetchWithAuth } from '@/app/libs/fetcher';
import { queryKeys } from '@/app/libs/query-keys';

interface UseTechnicianTicketsReturn {
  technicians: Technician[];
  summary: TechnicianSummary;
  userWorkzones: string[];
  loading: boolean;
  error: string | null;
  lastUpdated: Date | null;
  refresh: () => void;
}

export function useTechnicianTickets(
  filters: TechnicianFilters,
  autoRefreshSeconds = 180,
  includeAbsent = false,
  opts?: { includeClosedToday?: boolean; closedTodayLimit?: number },
): UseTechnicianTicketsReturn {
  const queryKey = queryKeys.technicians.lists({
    ...filters,
    includeAbsent,
    includeClosedToday: opts?.includeClosedToday,
    closedTodayLimit: opts?.closedTodayLimit,
  });

  const { data, isLoading, error: queryError, dataUpdatedAt, refetch } = useQuery({
    queryKey,
    staleTime: 30_000,
    refetchInterval: autoRefreshSeconds > 0 ? autoRefreshSeconds * 1000 : false,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.search) params.append('search', filters.search);
      if (filters.workzone) params.append('workzone', filters.workzone);
      if (filters.status && filters.status !== 'all') {
        params.append('status', filters.status);
      }
      if (includeAbsent) {
        params.append('include_absent', 'true');
      }
      if (opts?.includeClosedToday) {
        params.append('include_closed_today', 'true');
        if (opts.closedTodayLimit != null) {
          params.append('closed_today_limit', String(opts.closedTodayLimit));
        }
      }

      const res = await fetchWithAuth(`/api/technicians?${params.toString()}`);
      if (!res || !res.ok) {
        const body = res ? await res.json().catch(() => null) : null;
        throw new Error(body?.message || 'Failed to fetch technicians');
      }

      const result: TechnicianApiResponse = await res.json();

      if (!result.success) {
        throw new Error(result.message || 'Failed to fetch technicians');
      }

      if (!result.data) throw new Error('No data in response');
      return result.data;
    },
  });

  return {
    technicians: data?.technicians ?? [],
    summary: data?.summary ?? {
      total_active: 0,
      total_assigned: 0,
      overload_count: 0,
      idle_count: 0,
    },
    userWorkzones: data?.userWorkzones ?? [],
    loading: isLoading,
    error: queryError ? (queryError as Error).message : null,
    lastUpdated: dataUpdatedAt ? new Date(dataUpdatedAt) : null,
    refresh: () => { refetch(); },
  };
}
