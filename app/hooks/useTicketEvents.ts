'use client';

import { useEffect, useRef, useCallback } from 'react';

type TicketEvent =
  | { type: 'connected'; ts: number }
  | { type: 'heartbeat'; ts: number }
  | { type: 'invalidate'; reason: string; ts: number };

interface UseTicketEventsOptions {
  onInvalidate: () => void;
  enabled?: boolean;
  debounceMs?: number;
}

export function useTicketEvents({
  onInvalidate,
  enabled = true,
  debounceMs = 500,
}: UseTicketEventsOptions) {
  const esRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  // Keep latest callback without triggering reconnect loops
  const onInvalidateRef = useRef(onInvalidate);
  useEffect(() => {
    onInvalidateRef.current = onInvalidate;
  });

  const connect = useCallback(() => {
    if (!enabled || !mountedRef.current) return;

    // Close existing connection
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }

    const es = new EventSource('/api/tickets/events');
    esRef.current = es;

    es.onmessage = (e) => {
      try {
        const event: TicketEvent = JSON.parse(e.data);
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
      es.close();
      esRef.current = null;
      // Reconnect after 5 seconds
      if (mountedRef.current) {
        reconnectTimerRef.current = setTimeout(connect, 5_000);
      }
    };
  }, [enabled, debounceMs]);

  useEffect(() => {
    mountedRef.current = true;
    connect();

    return () => {
      mountedRef.current = false;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
    };
  }, [connect]);
}
