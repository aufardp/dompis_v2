// app/teknisi/components/TeknisiDashboard/hooks/useTickets.ts

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Ticket } from '@/app/types/ticket';
import { fetchWithAuth } from '@/app/libs/fetcher';
import { TicketFilter } from '../constants/ticket';
import { isTicketClosed } from '@/app/libs/ticket-utils';

interface UseTicketsReturn {
  tickets: Ticket[];
  loading: boolean;
  filter: TicketFilter;
  setFilter: (filter: TicketFilter) => void;
  filteredTickets: Ticket[];
  stats: {
    assigned: number;
    onProgress: number;
    pending: number;
    closed: number;
    totalAktif: number;
  };
  refresh: () => Promise<void>;
}

export function useTickets(
  initialFilter: TicketFilter = 'all',
): UseTicketsReturn {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<TicketFilter>(initialFilter);

  // Guard concurrent requests with requestId pattern
  const requestIdRef = useRef(0);
  // Debounce timer ref
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchTickets = useCallback(async () => {
    // Debounce: cancel if called repeatedly within 300ms
    if (debounceRef.current) clearTimeout(debounceRef.current);

    await new Promise<void>((resolve) => {
      debounceRef.current = setTimeout(resolve, 300);
    });

    const requestId = ++requestIdRef.current;

    try {
      setLoading(true);
      // No _t cache-buster — let Redis cache work
      const res = await fetchWithAuth('/api/tickets?limit=100');
      if (!res) return;

      // Cancel if this request is stale (a newer one was made)
      if (requestId !== requestIdRef.current) return;

      const data = await res.json();

      if (data.success && data.data?.data) {
        // Cancel if this request is stale
        if (requestId !== requestIdRef.current) return;
        setTickets(data.data.data);
      }
    } catch (err) {
      // Cancel if this request is stale
      if (requestId !== requestIdRef.current) return;
      console.error('Failed to fetch tickets:', err);
    } finally {
      // Only update loading if this is still the current request
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  // Refetch on window focus (real-time update)
  useEffect(() => {
    const onFocus = () => {
      fetchTickets();
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [fetchTickets]);

  const filteredTickets = useMemo(() => {
    return tickets.filter((t) => {
      if (filter === 'all') return !isTicketClosed(t.STATUS_UPDATE);
      const status = (t.STATUS_UPDATE ?? '').toLowerCase();
      if (filter === 'assigned') return status === 'assigned';
      if (filter === 'on_progress') return status === 'on_progress';
      if (filter === 'pending') return status === 'pending';
      if (filter === 'closed') return isTicketClosed(t.STATUS_UPDATE);
      return true;
    });
  }, [tickets, filter]);

  const stats = useMemo(() => {
    const getStatus = (t: Ticket) => (t.STATUS_UPDATE ?? '').toLowerCase();
    return {
      assigned: tickets.filter((t) => getStatus(t) === 'assigned').length,
      onProgress: tickets.filter((t) => getStatus(t) === 'on_progress').length,
      pending: tickets.filter((t) => getStatus(t) === 'pending').length,
      closed: tickets.filter((t) => isTicketClosed(t.STATUS_UPDATE)).length,
      totalAktif:
        tickets.filter((t) => getStatus(t) === 'assigned').length +
        tickets.filter((t) => getStatus(t) === 'on_progress').length,
    };
  }, [tickets]);

  return {
    tickets,
    loading,
    filter,
    setFilter,
    filteredTickets,
    stats,
    refresh: fetchTickets,
  };
}
