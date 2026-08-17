'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Ticket } from '@/app/types/ticket';
import { fetchWithAuth } from '@/app/libs/fetcher';
import { TicketFilter } from '../constants/ticket';
import { useTicketEvents, TicketUpdatedPayload } from '@/app/hooks/useTicketEvents';

interface UseTicketsReturn {
  tickets: Ticket[];
  loading: boolean;
  filter: TicketFilter;
  setFilter: (filter: TicketFilter) => void;
  paginatedTickets: Ticket[];
  currentPage: number;
  totalPages: number;
  totalItems: number;
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
  highlightedIncidents: Set<string>;
}

const PAGE_SIZE = 5;

// Map filter tab to API parameters
function getFilterParams(filter: TicketFilter) {
  switch (filter) {
    case 'assigned':
      return { statusUpdate: 'assigned', dateRange: 'today' };
    case 'on_progress':
      return { statusUpdate: 'on_progress', dateRange: 'today' };
    case 'pending':
      return { statusUpdate: 'pending', dateRange: 'today' };
    case 'closed':
      return { statusUpdate: 'close', dateRange: 'thisMonth' };
    case 'all':
    default:
      return { statusUpdate: undefined, dateRange: 'today' };
  }
}

export function useTickets(
  initialFilter: TicketFilter = 'all',
): UseTicketsReturn {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<TicketFilter>(initialFilter);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [stats, setStats] = useState({
    assigned: 0,
    onProgress: 0,
    pending: 0,
    closed: 0,
    totalAktif: 0,
  });
  const [highlightedIncidents, setHighlightedIncidents] = useState<Set<string>>(new Set());
  const highlightTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const buildQueryParams = useCallback(
    (page: number, search: string, filterParams: ReturnType<typeof getFilterParams>) => {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(PAGE_SIZE),
      });
      if (search.trim()) {
        params.set('search', search.trim());
      }
      if (filterParams.statusUpdate) {
        params.set('statusUpdate', filterParams.statusUpdate);
      }
      if (filterParams.dateRange) {
        params.set('dateRange', filterParams.dateRange);
      }
      return params.toString();
    },
    [],
  );

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetchWithAuth('/api/tickets/stats');
      if (!res) return;
      const data = await res.json();
      if (data.success && data.data) {
        setStats(data.data);
      }
    } catch (err) {
      console.error('Failed to fetch ticket stats:', err);
    }
  }, []);

  const fetchPage = useCallback(
    async (page: number, search: string, filterParam: TicketFilter) => {
      try {
        setLoading(true);
        const filterParams = getFilterParams(filterParam);
        const queryString = buildQueryParams(page, search, filterParams);
        const res = await fetchWithAuth(`/api/tickets?${queryString}`);
        if (!res) return;
        const data = await res.json();
        if (data.success && data.data) {
          setTickets(data.data.data || []);
          setTotalPages(data.data.totalPages || 1);
          setTotalItems(data.data.total || 0);
          setCurrentPage(data.data.page || page);
        }
      } catch (err) {
        console.error('Failed to fetch tickets:', err);
      } finally {
        setLoading(false);
      }
    },
    [buildQueryParams],
  );

  // Initial load and when filter/search/page changes
  useEffect(() => {
    fetchStats();
    fetchPage(1, searchQuery, filter);
  }, [filter, searchQuery, fetchPage, fetchStats]);

  // SSE for real-time updates
  useTicketEvents({
    onInvalidate: () => {
      fetchStats();
      fetchPage(currentPage, searchQuery, filter);
    },
    onTicketUpdated: useCallback((payload: TicketUpdatedPayload) => {
      const inc = payload.incident;
      setHighlightedIncidents((prev) => {
        const next = new Set(prev);
        next.add(inc);
        return next;
      });

      const existing = highlightTimersRef.current.get(inc);
      if (existing) clearTimeout(existing);
      const timer = setTimeout(() => {
        setHighlightedIncidents((prev) => {
          const next = new Set(prev);
          next.delete(inc);
          return next;
        });
        highlightTimersRef.current.delete(inc);
      }, 2000);
      highlightTimersRef.current.set(inc, timer);
    }, []),
    enabled: true,
    debounceMs: 1000,
  });

  const setPage = useCallback((page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
      fetchPage(page, searchQuery, filter);
    }
  }, [currentPage, totalPages, searchQuery, filter, fetchPage]);

  const refresh = useCallback(async () => {
    await fetchStats();
    await fetchPage(currentPage, searchQuery, filter);
  }, [currentPage, searchQuery, filter, fetchStats, fetchPage]);

  return {
    tickets,
    loading,
    filter,
    setFilter,
    paginatedTickets: tickets, // Already paginated from server
    currentPage,
    totalPages,
    totalItems,
    setPage,
    searchQuery,
    setSearchQuery,
    stats,
    refresh,
    highlightedIncidents,
  };
}