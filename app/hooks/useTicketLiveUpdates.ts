'use client';

import { useState, useEffect } from 'react';
import { useTicketEvents, TicketUpdatedPayload, BridgeFreshnessPayload, TicketViewersPayload } from './useTicketEvents';

export interface ViewerData {
  userId: string;
  userName: string;
  role: string;
}

export function useTicketLiveUpdates(ticketIncident: string) {
  const [lastUpdate, setLastUpdate] = useState<TicketUpdatedPayload | null>(null);
  const [viewers, setViewers] = useState<ViewerData[]>([]);
  const [viewerCount, setViewerCount] = useState(0);
  const [freshness, setFreshness] = useState<BridgeFreshnessPayload | null>(null);

  const { isConnected } = useTicketEvents({
    onInvalidate: () => {},
    onTicketUpdated: (payload) => {
      if (payload.incident === ticketIncident) {
        setLastUpdate(payload);
      }
    },
    onBridgeFreshness: (payload) => {
      setFreshness(payload);
    },
    onTicketViewers: (payload: TicketViewersPayload) => {
      if (payload.ticketId === ticketIncident) {
        setViewers(payload.viewers);
        setViewerCount(payload.viewerCount);
      }
    },
  });

  // Reset state when incident changes
  useEffect(() => {
    setLastUpdate(null);
    setViewers([]);
    setViewerCount(0);
    setFreshness(null);
  }, [ticketIncident]);

  return {
    isConnected,
    lastUpdate,
    viewers,
    viewerCount,
    freshness,
  };
}
