'use client';

// app/teknisi/components/TeknisiDashboard/hooks/useTickets.ts

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Ticket } from '@/app/types/ticket';
import { fetchWithAuth } from '@/app/libs/fetcher';
import { TicketFilter } from '../constants/ticket';
import { isTicketClosed } from '@/app/libs/ticket-utils';
import { useTicketEvents } from '@/app/hooks/useTicketEvents';

interface UseTicketsReturn {
  tickets: Ticket[];
  loading: boolean;
  filter: TicketFilter;
  setFilter: (filter: TicketFilter) => void;
  filteredTickets: Ticket[];
  paginatedTickets: Ticket[];
  currentPage: number;
  totalPages: number;
  setPage: (page: number) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  stats: {
    assigned: number;
    onProgress: number;
    pending: number;
    closed: number;
    totalAktif: number;
  };
  refresh: () => Promise<void>;
}

const PAGE_SIZE = 5;

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
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  const fetchTickets = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetchWithAuth('/api/tickets?limit=200');
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

  // Listen SSE untuk auto-refresh saat admin assign/update tiket
  useTicketEvents({
    onInvalidate: fetchTickets,
    enabled: true,
    debounceMs: 1000,
  });

  // Auto-reset page to 1 when filter or searchQuery changes
  useEffect(() => {
    setCurrentPage(1);
  }, [filter, searchQuery]);

  // Step 1: Search - filter by ticket number (case-insensitive)
  const searchedTickets = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return tickets;
    return tickets.filter((t) => t.ticket?.toLowerCase().includes(q));
  }, [tickets, searchQuery]);

  // Step 2: Filter by status tab - from searchedTickets (NOT from tickets directly)
  const filteredTickets = useMemo(() => {
    const filtered = searchedTickets.filter((t) => {
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
  }, [searchedTickets, filter]);

  // Step 3: Pagination
  const totalPages = useMemo(() => {
    return Math.max(1, Math.ceil(filteredTickets.length / PAGE_SIZE));
  }, [filteredTickets]);

  const paginatedTickets = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredTickets.slice(start, start + PAGE_SIZE);
  }, [filteredTickets, currentPage]);

  // Stats calculated from searchedTickets to stay in sync with search
  const stats = useMemo(() => {
    const norm = (t: Ticket) => normalizeStatus(t);
    return {
      assigned:   searchedTickets.filter((t) => norm(t) === 'ASSIGNED').length,
      onProgress: searchedTickets.filter((t) => norm(t) === 'ON_PROGRESS').length,
      pending:    searchedTickets.filter((t) => norm(t) === 'PENDING').length,
      closed:     searchedTickets.filter((t) => isTicketClosed(t.STATUS_UPDATE)).length,
      totalAktif:
        searchedTickets.filter((t) => norm(t) === 'ASSIGNED').length +
        searchedTickets.filter((t) => norm(t) === 'ON_PROGRESS').length,
    };
  }, [searchedTickets]);

  const setPage = useCallback((page: number) => {
    setCurrentPage(page);
  }, []);

  return {
    tickets,
    loading,
    filter,
    setFilter,
    filteredTickets,
    paginatedTickets,
    currentPage,
    totalPages,
    setPage,
    searchQuery,
    setSearchQuery,
    stats,
    refresh: fetchTickets,
  };
}
