'use client';

import { useState, useEffect, useCallback } from 'react';
import { fetchWithAuth } from '@/app/libs/fetcher';
import { formatDistanceToNow } from 'date-fns';
import { id } from 'date-fns/locale';

export function useSyncStatus(interval = 60000) {
  const [data, setData] = useState<any>(null);

  const fetch_ = useCallback(async () => {
    try {
      const res = await fetchWithAuth('/api/sync/status');
      const json = await res?.json();
      if (json?.success) setData(json.data);
    } catch {
      // Silently fail, will retry on next interval
    }
  }, []);

  useEffect(() => {
    fetch_();
    const i = setInterval(fetch_, interval);
    return () => clearInterval(i);
  }, [fetch_, interval]);

  const lastSyncLabel = data?.lastSyncedAt
    ? `Sync ${formatDistanceToNow(new Date(data.lastSyncedAt), { addSuffix: true, locale: id })}`
    : null;

  return { lastSyncLabel, data };
}
