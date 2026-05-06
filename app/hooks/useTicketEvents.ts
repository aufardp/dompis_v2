'use client';

import { useEffect, useRef, useCallback, useState } from 'react';

type TicketEvent =
  | { type: 'connected'; ts: number }
  | { type: 'heartbeat'; ts: number }
  | { type: 'invalidate'; reason: string; ts: number }
  | { type: 'sync'; syncType: 'start' | 'complete' | 'error'; inserted?: number; updated?: number; error?: string; ts: number };

interface UseTicketEventsOptions {
  onInvalidate: () => void;
  onSyncStart?: () => void;
  onSyncComplete?: (data: { inserted?: number; updated?: number }) => void;
  onSyncError?: (error: string) => void;
  enabled?: boolean;
  debounceMs?: number;
  fallbackPollingMs?: number;
}

export function useTicketEvents({
  onInvalidate,
  onSyncStart,
  onSyncComplete,
  onSyncError,
  enabled = true,
  debounceMs = 500,
  fallbackPollingMs = 30_000,
}: UseTicketEventsOptions) {
  const esRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const [isConnected, setIsConnected] = useState(false);
  const [syncInProgress, setSyncInProgress] = useState(false);
  const consecutiveErrorsRef = useRef(0);

  const onInvalidateRef = useRef(onInvalidate);
  const onSyncStartRef = useRef(onSyncStart);
  const onSyncCompleteRef = useRef(onSyncComplete);
  const onSyncErrorRef = useRef(onSyncError);

  useEffect(() => {
    onInvalidateRef.current = onInvalidate;
  }, [onInvalidate]);

  useEffect(() => {
    if (onSyncStart) onSyncStartRef.current = onSyncStart;
  }, [onSyncStart]);

  useEffect(() => {
    if (onSyncComplete) onSyncCompleteRef.current = onSyncComplete;
  }, [onSyncComplete]);

  useEffect(() => {
    if (onSyncError) onSyncErrorRef.current = onSyncError;
  }, [onSyncError]);

  const triggerFallbackPolling = useCallback(() => {
    if (!enabled || !mountedRef.current) return;
    if (fallbackTimerRef.current) return;

    fallbackTimerRef.current = setInterval(() => {
      if (!mountedRef.current) return;
      onInvalidateRef.current();
    }, fallbackPollingMs);
  }, [enabled, fallbackPollingMs]);

  const stopFallbackPolling = useCallback(() => {
    if (fallbackTimerRef.current) {
      clearInterval(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    }
  }, []);

  const connect = useCallback(() => {
    if (!enabled || !mountedRef.current) return;

    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }

    const es = new EventSource('/api/tickets/events');
    esRef.current = es;

    es.onopen = () => {
      setIsConnected(true);
      consecutiveErrorsRef.current = 0;
      stopFallbackPolling();
    };

    es.onmessage = (e) => {
      try {
        const event: TicketEvent = JSON.parse(e.data);

        if (event.type === 'sync') {
          if (event.syncType === 'start') {
            setSyncInProgress(true);
            onSyncStartRef.current?.();
          } else if (event.syncType === 'complete') {
            setSyncInProgress(false);
            onSyncCompleteRef.current?.({
              inserted: event.inserted,
              updated: event.updated,
            });
            onInvalidateRef.current();
          } else if (event.syncType === 'error') {
            setSyncInProgress(false);
            onSyncErrorRef.current?.(event.error || 'Unknown error');
          }
          return;
        }

        if (event.type === 'invalidate') {
          if (debounceRef.current) clearTimeout(debounceRef.current);
          debounceRef.current = setTimeout(() => {
            onInvalidateRef.current();
          }, debounceMs);
        }
      } catch {
        /* ignore malformed */
      }
    };

    es.onerror = () => {
      setIsConnected(false);
      es.close();
      esRef.current = null;
      consecutiveErrorsRef.current++;

      if (consecutiveErrorsRef.current >= 3) {
        triggerFallbackPolling();
      }

      if (mountedRef.current) {
        reconnectTimerRef.current = setTimeout(connect, 5_000);
      }
    };
  }, [enabled, debounceMs, stopFallbackPolling, triggerFallbackPolling]);

  useEffect(() => {
    mountedRef.current = true;
    connect();

    return () => {
      mountedRef.current = false;
      stopFallbackPolling();
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
    };
  }, [connect, stopFallbackPolling]);

  return { isConnected, syncInProgress };
}
