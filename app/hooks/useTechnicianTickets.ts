import { useCallback, useState, useEffect } from 'react';
import {
  Technician,
  TechnicianSummary,
  TechnicianFilters,
  TechnicianApiResponse,
} from '@/app/types/technician';
import { fetchWithAuth } from '@/app/libs/fetcher';

interface UseTechnicianTicketsReturn {
  technicians: Technician[];
  summary: TechnicianSummary;
  userWorkzones: string[];
  loading: boolean;
  error: string | null;
  lastUpdated: Date | null;
  refresh: () => Promise<void>;
}

export function useTechnicianTickets(
  filters: TechnicianFilters,
  autoRefreshSeconds = 60,
  includeAbsent = false,
  opts?: { includeClosedToday?: boolean; closedTodayLimit?: number },
): UseTechnicianTicketsReturn {
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [summary, setSummary] = useState<TechnicianSummary>({
    total_active: 0,
    total_assigned: 0,
    overload_count: 0,
    idle_count: 0,
  });
  const [userWorkzones, setUserWorkzones] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

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

      const data: TechnicianApiResponse = await res.json();

      if (!data.success) {
        throw new Error(data.message || 'Failed to fetch technicians');
      }

      setTechnicians(data.data?.technicians ?? []);
      setSummary(
        data.data?.summary ?? {
          total_active: 0,
          total_assigned: 0,
          overload_count: 0,
          idle_count: 0,
        },
      );
      setUserWorkzones(data.data?.userWorkzones ?? []);
      setLastUpdated(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setTechnicians([]);
    } finally {
      setLoading(false);
    }
  }, [filters.search, filters.workzone, filters.status, includeAbsent]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (autoRefreshSeconds <= 0) return;

    const interval = setInterval(() => {
      fetchData();
    }, autoRefreshSeconds * 1000);

    return () => clearInterval(interval);
  }, [autoRefreshSeconds, fetchData]);

  return {
    technicians,
    summary,
    userWorkzones,
    loading,
    error,
    lastUpdated,
    refresh: fetchData,
  };
}
