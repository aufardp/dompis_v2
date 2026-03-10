// app/teknisi/components/TeknisiDashboard/hooks/useTickets.ts

import { useState, useEffect, useCallback, useMemo } from 'react';
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

// Normalize status ke uppercase untuk perbandingan yang konsisten
function normalizeStatus(t: Ticket): string {
  // hasilVisit diisi dari STATUS_UPDATE (lowercase), normalize ke uppercase
  const raw = t.hasilVisit ?? t.STATUS_UPDATE ?? '';
  return raw.toUpperCase().trim();
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
      // Hapus _t cache buster — merusak Redis cache
      const res = await fetchWithAuth('/api/tickets?limit=100');
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
    const filtered = tickets.filter((t) => {
      const status = normalizeStatus(t);
      const closed = isTicketClosed(t.STATUS_UPDATE);

      if (filter === 'all')         return !closed;
      if (filter === 'assigned')    return status === 'ASSIGNED';
      if (filter === 'on_progress') return status === 'ON_PROGRESS';
      if (filter === 'pending')     return status === 'PENDING';
      if (filter === 'closed')      return closed;
      return true;
    });

    // Sort: tiket terbaru / terpenting di atas
    return [...filtered].sort((a, b) => {
      if (filter === 'closed') {
        const aTime = a.closedAt ? new Date(a.closedAt).getTime() : 0;
        const bTime = b.closedAt ? new Date(b.closedAt).getTime() : 0;
        return bTime - aTime;
      }

      // Tab aktif: on_progress dulu, lalu assigned, lalu pending
      const PRIORITY: Record<string, number> = {
        ON_PROGRESS: 0,
        ASSIGNED: 1,
        PENDING: 2,
      };
      const aPriority = PRIORITY[normalizeStatus(a)] ?? 9;
      const bPriority = PRIORITY[normalizeStatus(b)] ?? 9;
      if (aPriority !== bPriority) return aPriority - bPriority;

      // Same status: reportedDate DESC (terbaru di atas)
      const aDate = a.reportedDate ? new Date(a.reportedDate as string).getTime() : 0;
      const bDate = b.reportedDate ? new Date(b.reportedDate as string).getTime() : 0;
      return bDate - aDate;
    });
  }, [tickets, filter]);

  const stats = useMemo(() => {
    const norm = (t: Ticket) => normalizeStatus(t);
    return {
      assigned:   tickets.filter((t) => norm(t) === 'ASSIGNED').length,
      onProgress: tickets.filter((t) => norm(t) === 'ON_PROGRESS').length,
      pending:    tickets.filter((t) => norm(t) === 'PENDING').length,
      closed:     tickets.filter((t) => isTicketClosed(t.STATUS_UPDATE)).length,
      totalAktif:
        tickets.filter((t) => norm(t) === 'ASSIGNED').length +
        tickets.filter((t) => norm(t) === 'ON_PROGRESS').length,
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
