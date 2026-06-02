'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchWithAuth } from '@/app/libs/fetcher';
import { formatDistanceToNow } from 'date-fns';
import { id } from 'date-fns/locale';
import { queryKeys } from '@/app/libs/query-keys';

interface SyncStatusData {
  lastSyncedAt: string | null;
  lastSyncDate: string | null;
  nextSyncAt: string | null;
  cronIntervalMinutes: number;
  inProgress?: boolean;
  lastError?: string | null;
}

export function useSyncStatus(pollIntervalMs = 30_000) {
  const [rapidMode, setRapidMode] = useState(false);
  const [isTriggering, setIsTriggering] = useState(false);
  const rapidTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data, refetch } = useQuery({
    queryKey: queryKeys.sync.status(),
    staleTime: 0,
    refetchInterval: rapidMode ? 2000 : pollIntervalMs,
    queryFn: async () => {
      const res = await fetchWithAuth('/api/sync/status');
      const json = await res?.json();
      if (json?.success) return json.data as SyncStatusData;
      return null;
    },
  });

  const startRapidPoll = useCallback(() => {
    setRapidMode(true);
    if (rapidTimerRef.current) clearTimeout(rapidTimerRef.current);
    rapidTimerRef.current = setTimeout(() => {
      setRapidMode(false);
      rapidTimerRef.current = null;
    }, 10000);
  }, []);

  useEffect(() => {
    return () => {
      if (rapidTimerRef.current) clearTimeout(rapidTimerRef.current);
    };
  }, []);

  const triggerSync = useCallback(async () => {
    if (isTriggering) return;
    setIsTriggering(true);
    startRapidPoll();

    try {
      const res = await fetchWithAuth('/api/sync', {
        method: 'POST',
      });
      await res?.json();
      setTimeout(() => refetch(), 1000);
    } catch (e) {
      console.error('Failed to trigger sync:', e);
    } finally {
      setTimeout(() => setIsTriggering(false), 3000);
    }
  }, [isTriggering, startRapidPoll, refetch]);

  const lastSyncLabel = data?.lastSyncedAt
    ? `Sync ${formatDistanceToNow(new Date(data.lastSyncedAt), { addSuffix: true, locale: id })}`
    : 'Belum pernah sync';

  const nextSyncLabel = data?.nextSyncAt
    ? (() => {
        const next = new Date(data.nextSyncAt);
        const now = new Date();
        if (next <= now) return 'Sync dalam hitungan detik...';
        return `Next sync ${formatDistanceToNow(next, { addSuffix: true, locale: id })}`;
      })()
    : null;

  const isSyncOverdue = data?.nextSyncAt
    ? new Date(data.nextSyncAt) < new Date()
    : false;

  const isInProgress = data?.inProgress || isTriggering;
  const syncError = data?.lastError;

  return {
    lastSyncLabel,
    nextSyncLabel,
    isSyncOverdue,
    isInProgress,
    syncError,
    data,
    refreshNow: () => { refetch(); },
    triggerSync,
  };
}
