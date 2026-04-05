'use client';

import { useState, useEffect, useCallback } from 'react';
import { fetchWithAuth } from '@/app/libs/fetcher';
import type { ClusterWithStats } from '@/app/types/cluster';

export function useClusterList() {
  const [data, setData] = useState<ClusterWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchClusters = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const res = await fetchWithAuth('/api/clustering');
      if (!res) {
        setError('Failed to fetch clusters');
        setLoading(false);
        return;
      }

      const json = await res.json();

      if (json.success) {
        setData(json.data);
      } else {
        setError(json.message || 'Failed to fetch clusters');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchClusters();
  }, [fetchClusters]);

  return {
    clusters: data,
    loading,
    error,
    refresh: fetchClusters,
  };
}
