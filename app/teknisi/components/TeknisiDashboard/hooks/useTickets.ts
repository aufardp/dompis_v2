// app/teknisi/components/TeknisiDashboard/hooks/useTickets.ts

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Ticket } from '@/app/types/ticket';
import { fetchWithAuth } from '@/app/libs/fetcher';
import { TicketFilter } from '../constants/ticket';

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

  const fetchTickets = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetchWithAuth(
        `/api/tickets?limit=100&_t=${Date.now()}`,
      );
      if (!res) return;
      const data = await res.json();

      if (data.success && data.data?.data) {
        setTickets(data.data.data);
      }
    } catch (err) {
      console.error('Failed to fetch tickets:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  const filteredTickets = useMemo(() => {
    return tickets.filter((t) => {
      if (filter === 'all') return t.hasilVisit !== 'CLOSE';
      if (filter === 'assigned') return t.hasilVisit === 'ASSIGNED';
      if (filter === 'on_progress') return t.hasilVisit === 'ON_PROGRESS';
      if (filter === 'pending') return t.hasilVisit === 'PENDING';
      if (filter === 'closed') return t.hasilVisit === 'CLOSE';
      return true;
    });
  }, [tickets, filter]);

  const stats = useMemo(
    () => ({
      assigned: tickets.filter((t) => t.hasilVisit === 'ASSIGNED').length,
      onProgress: tickets.filter((t) => t.hasilVisit === 'ON_PROGRESS').length,
      pending: tickets.filter((t) => t.hasilVisit === 'PENDING').length,
      closed: tickets.filter((t) => t.hasilVisit === 'CLOSE').length,
      totalAktif:
        tickets.filter((t) => t.hasilVisit === 'ASSIGNED').length +
        tickets.filter((t) => t.hasilVisit === 'ON_PROGRESS').length,
    }),
    [tickets],
  );

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
