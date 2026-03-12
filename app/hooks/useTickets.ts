'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchWithAuth } from '@/app/libs/fetcher';
import type { Ticket, TicketCtype } from '@/app/types/ticket';

type ApiTicketsResult = {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  data: Ticket[];
};

export type UseTicketsFilters = {
  search?: string;
  workzone?: string;
  dept?: string;
  ctype?: TicketCtype | string;
  ticketType?: string;
  statusUpdate?: string;
  startDate?: string; // YYYY-MM-DD
  endDate?: string; // YYYY-MM-DD
};

async function fetchTicketsPage(
  query: URLSearchParams,
  page: number,
  limit: number,
): Promise<ApiTicketsResult> {
  const params = new URLSearchParams(query);
  params.set('page', String(page));
  params.set('limit', String(limit));

  const res = await fetchWithAuth(`/api/tickets?${params.toString()}`);
  if (!res) throw new Error('No response (possibly redirected to login)');

  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.success) {
    throw new Error(json?.message || 'Failed to fetch tickets');
  }

  return json.data as ApiTicketsResult;
}

export function useTickets(filters: UseTicketsFilters) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);

  const requestIdRef = useRef(0);

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (filters.search) p.set('search', filters.search);
    if (filters.workzone) p.set('workzone', filters.workzone);
    if (filters.dept) p.set('dept', filters.dept);
    if (filters.ctype) p.set('ctype', String(filters.ctype));
    if (filters.ticketType) p.set('ticketType', filters.ticketType);
    if (filters.statusUpdate) p.set('statusUpdate', filters.statusUpdate);
    if (filters.startDate) p.set('startDate', filters.startDate);
    if (filters.endDate) p.set('endDate', filters.endDate);
    return p;
  }, [
    filters.search,
    filters.workzone,
    filters.dept,
    filters.ctype,
    filters.ticketType,
    filters.statusUpdate,
    filters.startDate,
    filters.endDate,
  ]);

  const refresh = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    setTruncated(false);

    const LIMIT = 200;
    const CONCURRENCY = 4;
    const MAX_TICKETS = 5000;

    try {
      const first = await fetchTicketsPage(query, 1, LIMIT);
      if (requestId !== requestIdRef.current) return;

      const totalPages = Math.max(1, Number(first.totalPages || 1));
      let all: Ticket[] = [...(first.data ?? [])];
      let capped = all.length >= MAX_TICKETS;

      const pages: number[] = [];
      for (let p = 2; p <= totalPages; p++) pages.push(p);

      let idx = 0;
      const worker = async () => {
        while (idx < pages.length && !capped) {
          const p = pages[idx++];
          const r = await fetchTicketsPage(query, p, LIMIT);
          if (requestId !== requestIdRef.current) return;

          all = all.concat(r.data ?? []);
          if (all.length >= MAX_TICKETS) {
            all = all.slice(0, MAX_TICKETS);
            capped = true;
            return;
          }
        }
      };

      if (pages.length && !capped) {
        await Promise.all(
          Array.from({ length: Math.min(CONCURRENCY, pages.length) }, () =>
            worker(),
          ),
        );
      }

      if (requestId !== requestIdRef.current) return;
      setTickets(all);
      setTruncated(capped);
    } catch (e: any) {
      if (requestId !== requestIdRef.current) return;
      setTickets([]);
      setTruncated(false);
      setError(e?.message || 'Failed to fetch tickets');
    } finally {
      if (requestId !== requestIdRef.current) return;
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { tickets, loading, error, truncated, refresh };
}
