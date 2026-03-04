import { useCallback, useEffect, useState, useMemo, useRef } from 'react';
import { Ticket } from '../types/ticket';
import { fetchWithAuth } from '@/app/libs/fetcher';

interface PaginationInfo {
  currentPage: number;
  totalPages: number;
  total: number;
  limit: number;
}

const UI_PAGE_SIZE = 10;
// Fetch in bigger chunks so we can reach 5k+ rows fast.
const FETCH_PAGE_SIZE = 500;
// Safety cap to avoid runaway requests if API misbehaves.
const MAX_TOTAL_PAGES = 200;

export function useAdminTickets(
  search: string,
  page: number,
  workzone?: string,
  ctype?: string,
  hasilVisit?: string,
  dept?: string,
  ticketType?: string,
) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState<
    Omit<PaginationInfo, 'currentPage'>
  >({
    totalPages: 1,
    total: 0,
    limit: UI_PAGE_SIZE,
  });

  const requestIdRef = useRef(0);

  const fetchData = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    try {
      setLoading(true);

      const params = new URLSearchParams({
        limit: String(FETCH_PAGE_SIZE),
      });

      if (search) {
        params.append('search', search);
      }

      if (workzone) {
        params.append('workzone', workzone);
      }

      if (ctype) {
        params.append('ctype', ctype);
      }

      if (hasilVisit) {
        params.append('hasilVisit', hasilVisit);
      }

      if (dept) {
        params.append('dept', dept);
      }

      if (ticketType) {
        params.append('ticketType', ticketType);
      }

      const all: Ticket[] = [];

      // Page 1 first (to get totalPages)
      params.set('page', '1');
      const firstRes = await fetchWithAuth(`/api/tickets?${params.toString()}`);
      if (!firstRes) {
        console.log(
          '[useAdminTickets] No response - possibly redirecting to login',
        );
        return;
      }

      const firstJson = await firstRes.json();
      if (requestId !== requestIdRef.current) return;

      if (!firstRes.ok) {
        throw new Error(firstJson.message || 'Failed fetch tickets');
      }

      const firstRows: Ticket[] =
        (firstJson?.success && firstJson?.data?.data) || [];
      all.push(...firstRows);

      const apiTotalPages = Number(firstJson?.data?.totalPages || 1);
      const totalPages =
        Number.isFinite(apiTotalPages) && apiTotalPages > 0
          ? Math.min(apiTotalPages, MAX_TOTAL_PAGES)
          : 1;

      for (let p = 2; p <= totalPages; p++) {
        if (requestId !== requestIdRef.current) return;
        params.set('page', String(p));

        const res = await fetchWithAuth(`/api/tickets?${params.toString()}`);
        if (!res) return;

        const json = await res.json();
        if (requestId !== requestIdRef.current) return;
        if (!res.ok) {
          throw new Error(json.message || 'Failed fetch tickets');
        }

        const rows: Ticket[] = (json?.success && json?.data?.data) || [];
        all.push(...rows);

        // Early stop if backend returns short page
        if (rows.length < FETCH_PAGE_SIZE) break;
      }

      // Dedupe by idTicket
      const seen = new Set<number>();
      const deduped: Ticket[] = [];
      for (const t of all) {
        const id = Number(t?.idTicket);
        if (!Number.isFinite(id) || id <= 0) continue;
        if (seen.has(id)) continue;
        seen.add(id);
        deduped.push(t);
      }

      setTickets(deduped);
      setPagination({
        total: deduped.length,
        totalPages: Math.max(1, Math.ceil(deduped.length / UI_PAGE_SIZE)),
        limit: UI_PAGE_SIZE,
      });
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      setTickets([]);
    } finally {
      if (requestId !== requestIdRef.current) return;
      setLoading(false);
    }
  }, [search, workzone, ctype, hasilVisit, dept, ticketType]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const memoizedReturn = useMemo(
    () => ({
      tickets,
      loading,
      pagination: { ...pagination, currentPage: page },
      refresh: fetchData,
    }),
    [tickets, loading, pagination, page, fetchData],
  );

  return memoizedReturn;
}
