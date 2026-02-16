import { useCallback, useEffect, useState, useMemo } from 'react';
import { Ticket } from '../types/ticket';

interface PaginationInfo {
  currentPage: number;
  totalPages: number;
  total: number;
}

export function useAdminTickets(
  search: string,
  page: number,
  workzone?: string,
) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState<PaginationInfo>({
    currentPage: 1,
    totalPages: 1,
    total: 0,
  });

  const fetchData = useCallback(async () => {
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

      const res = await fetch(`/api/tickets?${params.toString()}`, {
        credentials: 'include',
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || 'Failed fetch tickets');
      }

      if (data.success && data.data) {
        setTickets(data.data.data ?? []);
        setPagination({
          currentPage: data.data.page ?? 1,
          totalPages: data.data.totalPages ?? 1,
          total: data.data.total ?? 0,
        });
      }
    } catch (err) {
      console.error('Fetch tickets error:', err);
      setTickets([]);
    } finally {
      setLoading(false);
    }
  }, [search, page, workzone]);

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
