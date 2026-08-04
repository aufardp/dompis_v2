'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchWithAuth } from '@/app/libs/fetcher';
import { queryKeys } from '@/app/libs/query-keys';

export interface CurrentUser {
  id_user: number;
  nama: string;
  jabatan: string;
  role_name: string;
  role_key: string;
}

export function useCurrentUser() {
  const { data, isLoading, error: queryError, refetch } = useQuery({
    queryKey: queryKeys.users.me(),
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const res = await fetchWithAuth('/api/users/me');
      if (!res) throw new Error('No response');
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        throw new Error(json?.message || 'Failed to load user');
      }
      return json.data as CurrentUser;
    },
  });

  return {
    user: data ?? null,
    loading: isLoading,
    error: queryError ? (queryError as Error).message : null,
    refresh: () => { refetch(); },
  };
}
