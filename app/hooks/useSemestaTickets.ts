import { useCallback, useEffect, useState, useMemo, useRef } from 'react';
import { Ticket } from '../types/ticket';
import { fetchWithAuth } from '@/app/libs/fetcher';

interface PaginationInfo {
  currentPage: number;
  totalPages: number;
  total: number;
  limit: number;
}

export function useSemestaTickets(
  search: string,
  page: number,
  workzone?: string,
  ctype?: string,
  hasilVisit?: string,
  dept?: string,
  ticketType?: string,
  startDate?: string,
  endDate?: string,
) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState<PaginationInfo>({
    currentPage: 1,
    totalPages: 1,
    total: 0,
    limit: 50,
  });

  const requestIdRef = useRef(0);

  const fetchData = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    try {
      setLoading(true);

      const params = new URLSearchParams({
        page: String(page),
        limit: '50',
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

      if (startDate) {
        params.append('startDate', startDate);
      }

      if (endDate) {
        params.append('endDate', endDate);
      }

      const res = await fetchWithAuth(`/api/tickets?${params.toString()}`);

      if (!res) {
        console.log(
          '[useSemestaTickets] No response - possibly redirecting to login',
        );
        return;
      }

      const data = await res.json();

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
          limit: data.data.limit ?? 50,
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
  }, [
    search,
    page,
    workzone,
    ctype,
    hasilVisit,
    dept,
    ticketType,
    startDate,
    endDate,
  ]);

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
