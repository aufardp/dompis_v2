'use client';

import { useEffect, useRef } from 'react';
import { useCurrentUser } from './useCurrentUser';

const HEARTBEAT_INTERVAL_MS = 15_000;

export function useTicketHeartbeat(ticketIncident: string) {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { user } = useCurrentUser();

  useEffect(() => {
    if (!ticketIncident || !user) return;

    const sendHeartbeat = () => {
      fetch(`/api/tickets/${encodeURIComponent(ticketIncident)}/heartbeat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userName: user.nama ?? user.role_name ?? 'Unknown',
          role: user.role_name ?? 'unknown',
        }),
      }).catch(() => {
        /* ignore heartbeat failures */
      });
    };

    // Send immediately on mount
    sendHeartbeat();

    // Then every 15 seconds
    intervalRef.current = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [ticketIncident, user]);
}
