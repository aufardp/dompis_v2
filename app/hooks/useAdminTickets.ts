import { useCallback, useEffect, useState, useMemo, useRef } from 'react';
import { Ticket } from '../types/ticket';
import { fetchWithAuth } from '@/app/libs/fetcher';

interface PaginationInfo {
  currentPage: number;
  totalPages: number;
  total: number;
  limit: number;
}

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
  const [pagination, setPagination] = useState<PaginationInfo>({
    currentPage: 1,
    totalPages: 1,
    total: 0,
    limit: 10,
  });

  const requestIdRef = useRef(0);

  const fetchData = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    try {
      setLoading(true);

      const params = new URLSearchParams({
        page: String(page),
        limit: '10',
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

      const res = await fetchWithAuth(`/api/tickets?${params.toString()}`);

      if (!res) {
        console.log(
          '[useAdminTickets] No response - possibly redirecting to login',
        );
        return;
      }

      const data = await res.json();

      // Ignore stale responses (e.g. filter changed while request was in-flight)
      if (requestId !== requestIdRef.current) return;

      if (!res.ok) {
        throw new Error(data.message || 'Failed fetch tickets');
      }

      if (data.success && data.data) {
        setTickets(data.data.data ?? []);
        setPagination({
          currentPage: data.data.page ?? 1,
          totalPages: data.data.totalPages ?? 1,
          total: data.data.total ?? 0,
          limit: data.data.limit ?? 10,
        });
      } else {
        setTickets([]);
      }
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      setTickets([]);
    } finally {
      if (requestId !== requestIdRef.current) return;
      setLoading(false);
    }
  }, [search, page, workzone, ctype, hasilVisit, dept, ticketType]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const memoizedReturn = useMemo(
    () => ({
      tickets,
      loading,
      pagination,
      refresh: fetchData,
    }),
    [tickets, loading, pagination, fetchData],
  );

  return memoizedReturn;
}
