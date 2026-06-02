'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchWithAuth } from '@/app/libs/fetcher';
import { queryKeys } from '@/app/libs/query-keys';
import type { Cluster, ClusterArea, ClusterNode } from '@/app/types/cluster';

interface ClusterDetailData {
  cluster: Cluster;
  areas: ClusterArea[];
  nodes: ClusterNode[];
}

export function useClusterDetail(clusterId: number | null) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: queryKeys.clustering.detail(clusterId ?? 0),
    enabled: clusterId !== null && clusterId > 0,
    staleTime: 30_000,
    queryFn: async () => {
      if (!clusterId) throw new Error('No cluster ID');
      const res = await fetchWithAuth(`/api/clustering/${clusterId}`);
      if (!res) throw new Error('Failed to fetch cluster detail');
      const json = await res.json();
      if (!json.success) throw new Error(json.message || 'Failed to fetch cluster detail');
      return json.data as ClusterDetailData;
    },
  });

  return {
    cluster: data?.cluster,
    areas: data?.areas || [],
    nodes: data?.nodes || [],
    loading: isLoading,
    error: error ? (error as Error).message : null,
    refresh: () => { refetch(); },
  };
}
