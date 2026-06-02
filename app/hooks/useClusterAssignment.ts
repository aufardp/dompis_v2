'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchWithAuth } from '@/app/libs/fetcher';
import { queryKeys } from '@/app/libs/query-keys';

interface Assignment {
  id: number;
  teknisi_id: number;
  teknisi_nama: string;
  teknisi_nik: string;
  assigned_date: string;
  note: string | null;
}

interface ClusterAssignment {
  cluster_id: number;
  cluster_name: string;
  assignments: Assignment[];
}

export function useClusterAssignment(date?: string, saId?: number) {
  const params = new URLSearchParams();
  if (date) params.set('date', date);
  if (saId) params.set('sa_id', String(saId));
  const queryStr = params.toString();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: queryKeys.clustering.assignments({ date, saId }),
    staleTime: 30_000,
    queryFn: async () => {
      const url = `/api/clustering/assign${queryStr ? `?${queryStr}` : ''}`;
      const res = await fetchWithAuth(url);
      if (!res) throw new Error('Failed to fetch assignments');
      const json = await res.json();
      if (!json.success) throw new Error(json.message || 'Failed to fetch assignments');
      return json.data as ClusterAssignment[];
    },
  });

  return {
    assignments: data ?? [],
    loading: isLoading,
    error: error ? (error as Error).message : null,
    refresh: () => { refetch(); },
  };
}
