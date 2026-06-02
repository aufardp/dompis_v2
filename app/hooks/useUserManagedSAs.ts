'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchWithAuth } from '@/app/libs/fetcher';
import { queryKeys } from '@/app/libs/query-keys';

interface ManagedServiceArea {
  id_sa: number;
  nama_sa: string | null;
}

export function useUserManagedSAs() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: queryKeys.users.managedSA(),
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const res = await fetchWithAuth('/api/users/me/sa');
      if (!res) throw new Error('Failed to fetch service areas');
      const json = await res.json();
      if (!json.success) throw new Error(json.message || 'Failed to fetch service areas');
      return json.data as ManagedServiceArea[];
    },
  });

  return {
    serviceAreas: data ?? [],
    loading: isLoading,
    error: error ? (error as Error).message : null,
    refresh: () => { refetch(); },
  };
}
