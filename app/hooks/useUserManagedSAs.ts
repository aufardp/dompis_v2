'use client';

import { useState, useEffect, useCallback } from 'react';
import { fetchWithAuth } from '@/app/libs/fetcher';

interface ManagedServiceArea {
  id_sa: number;
  nama_sa: string | null;
}

export function useUserManagedSAs() {
  const [data, setData] = useState<ManagedServiceArea[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchManagedSAs = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const res = await fetchWithAuth('/api/users/me/sa');
      if (!res) {
        setError('Failed to fetch service areas');
        setLoading(false);
        return;
      }

      const json = await res.json();

      if (json.success) {
        setData(json.data);
      } else {
        setError(json.message || 'Failed to fetch service areas');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchManagedSAs();
  }, [fetchManagedSAs]);

  return {
    serviceAreas: data,
    loading,
    error,
    refresh: fetchManagedSAs,
  };
}
