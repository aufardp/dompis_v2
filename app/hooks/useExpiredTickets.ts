'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchWithAuth } from '@/app/libs/fetcher';
import { getSlaHours } from '@/app/utils/datetime';
import { queryKeys } from '@/app/libs/query-keys';

type ExpiredTicketApiRow = {
  idTicket?: number;
  ticket?: string;
  customerType?: string | null;
  reportedDate?: string | null;
  status?: string | null;
  technicianName?: string | null;
  teknisiUserId?: number | null;
  workzone?: string | null;
  contactName?: string | null;
  serviceNo?: string | null;
};

export type ExpiredTicket = {
  idTicket: number;
  ticketId: string;
  customerType: string;
  reportedAt: Date;
  status: string;
  overdueHours: number;
  technicianName?: string | null;
  teknisiUserId?: number | null;
  workzone?: string | null;
  contactName?: string | null;
  serviceNo?: string | null;
};

function toOverdueHours(customerType: string, reportedAt: Date) {
  const sla = getSlaHours(customerType);
  const diffHours = (Date.now() - reportedAt.getTime()) / (1000 * 60 * 60);
  return Math.max(0, Math.floor(diffHours - sla));
}

export function useExpiredTickets(
  workzoneId?: string,
  opts?: { dept?: string; ticketType?: string; statusUpdate?: string },
) {
  const queryKey = queryKeys.tickets.expired({
    workzoneId,
    dept: opts?.dept,
    ticketType: opts?.ticketType,
    statusUpdate: opts?.statusUpdate,
  });

  const { data, isLoading, isFetching, error: queryError, refetch } = useQuery({
    queryKey,
    staleTime: 30_000,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (workzoneId) params.set('workzone', workzoneId);
      if (opts?.dept && opts.dept !== 'all') params.set('dept', opts.dept);
      if (opts?.ticketType && opts.ticketType !== 'all') {
        params.set('ticketType', opts.ticketType);
      }
      if (opts?.statusUpdate && opts.statusUpdate !== 'all') {
        params.set('statusUpdate', opts.statusUpdate);
      }

      const res = await fetchWithAuth(
        `/api/tickets/expired${params.toString() ? `?${params.toString()}` : ''}`,
      );
      if (!res) throw new Error('No response');

      const json = await res.json();
      if (!json?.success) throw new Error(json?.message || 'Failed to load expired tickets');

      return (json.data || []) as ExpiredTicketApiRow[];
    },
  });

  const tickets = useMemo(() => {
    const rows = data ?? [];
    const mapped: ExpiredTicket[] = [];
    for (const t of rows) {
      const idTicket = t.idTicket || 0;
      const ticketId = String(t.ticket || t.idTicket || '').trim();
      const customerType = String(t.customerType || 'REGULER').toUpperCase();
      const reportedAt = t.reportedDate ? new Date(t.reportedDate) : new Date();
      if (!ticketId) continue;
      mapped.push({
        idTicket,
        ticketId,
        customerType,
        reportedAt,
        status: String(t.status || 'OPEN'),
        overdueHours: toOverdueHours(customerType, reportedAt),
        technicianName: t.technicianName,
        teknisiUserId: t.teknisiUserId,
        workzone: t.workzone,
        contactName: t.contactName,
        serviceNo: t.serviceNo,
      });
    }
    mapped.sort((a, b) => b.overdueHours - a.overdueHours);
    return mapped;
  }, [data]);

  return {
    tickets,
    loading: isLoading,
    isRefreshing: isFetching && !isLoading,
    error: queryError ? (queryError as Error).message : null,
    refresh: () => { refetch(); },
    refreshSilent: () => { refetch(); },
  };
}
