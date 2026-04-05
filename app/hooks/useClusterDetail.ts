'use client';

import { useState, useEffect, useCallback } from 'react';
import { fetchWithAuth } from '@/app/libs/fetcher';
import type { Cluster, ClusterArea, ClusterNode } from '@/app/types/cluster';

interface ClusterDetailData {
  cluster: Cluster;
  areas: ClusterArea[];
  nodes: ClusterNode[];
}

export function useClusterDetail(clusterId: number | null) {
  const [data, setData] = useState<ClusterDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCluster = useCallback(async () => {
    if (!clusterId) {
      setData(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const res = await fetchWithAuth(`/api/clustering/${clusterId}`);
      if (!res) {
        setError('Failed to fetch cluster detail');
        setLoading(false);
        return;
      }

      const json = await res.json();

      if (json.success) {
        setData(json.data);
      } else {
        setError(json.message || 'Failed to fetch cluster detail');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, [clusterId]);

  useEffect(() => {
    fetchCluster();
  }, [fetchCluster]);

  return {
    cluster: data?.cluster,
    areas: data?.areas || [],
    nodes: data?.nodes || [],
    loading,
    error,
    refresh: fetchCluster,
  };
}
