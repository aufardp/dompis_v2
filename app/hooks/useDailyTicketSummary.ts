// hooks/useDailyTicketSummary.ts
// Single fetch hook that provides both daily tickets AND computed summary
// This ensures summary and table are ALWAYS from the same dataset

import { useCallback, useEffect, useState, useMemo, useRef } from 'react';
import { fetchWithAuth } from '@/app/libs/fetcher';
import { computeTicketSummary, filterTickets, DailyTicket, TicketSummary } from '@/app/libs/ticket-summary';
import { isTicketClosed } from '@/app/libs/ticket-utils';

interface UseDailyTicketSummaryReturn {
  // All daily tickets (unfiltered)
  allTickets: DailyTicket[];

  // Filtered tickets for table display
  filteredTickets: DailyTicket[];

  // Summary computed from allTickets (daily scope)
  summary: TicketSummary;

  // Filter state
  activeCustomerType: string | null;
  activeStatus: string | null;
  setCustomerTypeFilter: (type: string | null) => void;
  setStatusFilter: (status: string | null) => void;

  // Loading state
  isLoading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}

const FETCH_PAGE_SIZE = 500;
const MAX_TOTAL_PAGES = 200;

export function useDailyTicketSummary(
  dept: 'b2c' | 'b2b',
  search: string = '',
  workzone?: string,
  ticketType?: string,
): UseDailyTicketSummaryReturn {
  const [allTickets, setAllTickets] = useState<DailyTicket[]>([]);
  const [activeCustomerType, setActiveCustomerType] = useState<string | null>(null);
  const [activeStatus, setActiveStatus] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const requestIdRef = useRef(0);

  const fetchData = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    try {
      setIsLoading(true);
      setError(null);

      const params = new URLSearchParams({
        limit: String(FETCH_PAGE_SIZE),
        dept,
      });

      if (search) params.append('search', search);
      if (workzone) params.append('workzone', workzone);
      if (ticketType) params.append('ticketType', ticketType);

      const all: DailyTicket[] = [];

      // Page 1 first (to get totalPages)
      params.set('page', '1');
      const firstRes = await fetchWithAuth(`/api/tickets/daily?${params.toString()}`);
      if (!firstRes) return;

      const firstJson = await firstRes.json();
      if (requestId !== requestIdRef.current) return;

      if (!firstJson?.success) {
        throw new Error(firstJson.message || 'Failed to fetch daily tickets');
      }

      const firstRows: DailyTicket[] = firstJson.data?.data || [];
      all.push(...firstRows);

      const apiTotalPages = Number(firstJson?.data?.totalPages || 1);
      const totalPages =
        Number.isFinite(apiTotalPages) && apiTotalPages > 0
          ? Math.min(apiTotalPages, MAX_TOTAL_PAGES)
          : 1;

      // Fetch remaining pages
      for (let p = 2; p <= totalPages; p++) {
        if (requestId !== requestIdRef.current) return;
        params.set('page', String(p));

        const res = await fetchWithAuth(`/api/tickets/daily?${params.toString()}`);
        if (!res) return;

        const json = await res.json();
        if (requestId !== requestIdRef.current) return;
        if (!json?.success) {
          throw new Error(json.message || 'Failed to fetch daily tickets');
        }

        const rows: DailyTicket[] = json.data?.data || [];
        all.push(...rows);

        // Early stop if backend returns short page
        if (rows.length < FETCH_PAGE_SIZE) break;
      }

      // Dedupe by idTicket
      const seen = new Set<number>();
      const deduped: DailyTicket[] = [];
      for (const t of all) {
        const id = Number(t?.idTicket);
        if (!Number.isFinite(id) || id <= 0) continue;
        if (seen.has(id)) continue;
        seen.add(id);
        deduped.push(t);
      }

      setAllTickets(deduped);
    } catch (err: any) {
      if (requestId !== requestIdRef.current) return;
      setError(err);
      setAllTickets([]);
    } finally {
      if (requestId !== requestIdRef.current) return;
      setIsLoading(false);
    }
  }, [dept, search, workzone, ticketType]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Summary ALWAYS computed from allTickets (full daily scope)
  // This is NOT affected by UI filters
  const summary = useMemo(
    () => computeTicketSummary(allTickets),
    [allTickets],
  );

  // Filtered tickets for table display
  const filteredTickets = useMemo(
    () => filterTickets(allTickets, activeCustomerType, activeStatus),
    [allTickets, activeCustomerType, activeStatus],
  );

  return {
    allTickets,
    filteredTickets,
    summary,
    activeCustomerType,
    activeStatus,
    setCustomerTypeFilter: setActiveCustomerType,
    setStatusFilter: setActiveStatus,
    isLoading,
    error,
    refresh: fetchData,
  };
}
