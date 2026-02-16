import { useCallback, useState } from 'react';
import { Teknisi } from '@/app/types/teknisi';
import { fetchWithAuth } from '@/app/libs/fetcher';

interface ApiResponse {
  success: boolean;
  message?: string;
  data?: Teknisi[];
}

export function useTechnicians() {
  const [technicians, setTechnicians] = useState<Teknisi[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTechnicians = useCallback(async (search?: string) => {
    setLoading(true);
    setError(null);

    try {
      const query = search
        ? `/api/users/role/4?search=${encodeURIComponent(search)}`
        : `/api/users/role/4`;

      const res = await fetchWithAuth(query);

      if (!res || !res.ok) {
        throw new Error('Network response was not ok');
      }

      const data: ApiResponse = await res.json();

      if (!data.success) {
        throw new Error(data.message || 'Failed to fetch technicians');
      }

      setTechnicians(data.data ?? []);
    } catch (err: any) {
      setError(err.message || 'Failed to load technicians');
      setTechnicians([]);
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    technicians,
    loading,
    error,
    fetchTechnicians,
  };
}
