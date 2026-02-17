'use client';

import { useCallback, useEffect, useState } from 'react';

export interface CurrentUser {
  id_user: number;
  nama: string;
  jabatan: string;
  role_name: string;
}

export function useCurrentUser() {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/users/me', { credentials: 'include' });
      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.success) {
        setUser(null);
        setError(data?.message || 'Failed to load user');
        return;
      }

      setUser(data.data);
    } catch (e) {
      console.error('Failed to fetch current user:', e);
      setUser(null);
      setError('Failed to load user');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { user, loading, error, refresh };
}
