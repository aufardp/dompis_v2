'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchWithAuth } from '@/app/libs/fetcher';
import { formatDistanceToNow } from 'date-fns';
import { id } from 'date-fns/locale';

interface SyncStatusData {
  lastSyncedAt: string | null;
  lastSyncDate: string | null;
  nextSyncAt: string | null;
  cronIntervalMinutes: number;
  inProgress?: boolean;
  lastError?: string | null;
}

export function useSyncStatus(pollIntervalMs = 30_000) {
  const [data, setData] = useState<SyncStatusData | null>(null);
  const [tick, setTick] = useState(0);
  const [isTriggering, setIsTriggering] = useState(false);
  const rapidPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetchWithAuth('/api/sync/status');
      const json = await res?.json();
      if (json?.success) setData(json.data);
    } catch {
      // silently fail
    }
  }, []);

  // Clean up rapid poll
  const cleanupRapidPoll = useCallback(() => {
    if (rapidPollRef.current) {
      clearInterval(rapidPollRef.current);
      rapidPollRef.current = null;
    }
  }, []);

  // Start rapid polling after trigger sync
  const startRapidPoll = useCallback(() => {
    cleanupRapidPoll();
    rapidPollRef.current = setInterval(() => {
      fetchStatus();
    }, 2000);
    
    // Stop rapid poll after 10 seconds
    setTimeout(cleanupRapidPoll, 10000);
  }, [fetchStatus, cleanupRapidPoll]);

  const triggerSync = useCallback(async () => {
    if (isTriggering) return;
    setIsTriggering(true);
    startRapidPoll();
    
    try {
      const res = await fetchWithAuth('/api/sync', {
        method: 'POST',
      });
      await res?.json();
      // Immediate refresh after triggering
      setTimeout(fetchStatus, 1000);
    } catch (e) {
      console.error('Failed to trigger sync:', e);
    } finally {
      setTimeout(() => setIsTriggering(false), 3000);
    }
  }, [isTriggering, startRapidPoll, fetchStatus]);

  // Listen for SSE sync events to refresh status
  useEffect(() => {
    let es: EventSource | null = null;
    
    const connect = () => {
      try {
        es = new EventSource('/api/tickets/events');
        es.onmessage = (e) => {
          try {
            const event = JSON.parse(e.data);
            if (event.type === 'sync') {
              if (event.syncType === 'complete') {
                console.log('[useSyncStatus] Sync completed, refreshing status');
                fetchStatus();
                cleanupRapidPoll();
              }
            }
          } catch {
            // ignore
          }
        };
        es.onerror = () => {
          es?.close();
          setTimeout(connect, 5000);
        };
      } catch {
        // ignore
      }
    };
    
    connect();
    
    return () => {
      es?.close();
      cleanupRapidPoll();
    };
  }, [fetchStatus, cleanupRapidPoll]);

  useEffect(() => {
    fetchStatus();
    const id = setInterval(fetchStatus, pollIntervalMs);
    return () => clearInterval(id);
  }, [fetchStatus, pollIntervalMs]);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    return () => cleanupRapidPoll();
  }, [cleanupRapidPoll]);

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
    refreshNow: fetchStatus,
    triggerSync,
  };
}
