'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchWithAuth } from '@/app/libs/fetcher';
import { queryKeys } from '@/app/libs/query-keys';
import type { ClusterWithStats } from '@/app/types/cluster';

export function useClusterList() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: queryKeys.clustering.lists(),
    staleTime: 30_000,
    queryFn: async () => {
      const res = await fetchWithAuth('/api/clustering');
      if (!res) throw new Error('Failed to fetch clusters');
      const json = await res.json();
      if (!json.success) throw new Error(json.message || 'Failed to fetch clusters');
      return json.data as ClusterWithStats[];
    },
  });

  return {
    clusters: data ?? [],
    loading: isLoading,
    error: error ? (error as Error).message : null,
    refresh: () => { refetch(); },
  };
}
