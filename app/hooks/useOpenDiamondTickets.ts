'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchWithAuth } from '@/app/libs/fetcher';
import { queryKeys } from '@/app/libs/query-keys';

type AlertDiamondTicketApi = {
  idTicket?: number;
  id_ticket?: number;
  incident?: string;
  ticketId?: string;
  customerType?: string;
  CUSTOMER_TYPE?: string;
  status?: string;
  status_update?: string;
  reportedAt?: string | Date | null;
  REPORTED_DATE?: string | null;
  workzone?: string | null;
  contactName?: string | null;
  CONTACT_NAME?: string | null;
  serviceNo?: string | null;
  SERVICE_NO?: string | null;
  technicianName?: string | null;
  teknisiUserId?: number | null;
  teknisi_user_id?: number | null;
  syncDate?: string | null;
};

export type OpenDiamondTicket = {
  idTicket: number;
  ticketId: string;
  customerType: string;
  status: string;
  reportedAt: Date;
  technicianName?: string | null;
  teknisiUserId?: number | null;
  workzone?: string | null;
  contactName?: string | null;
  serviceNo?: string | null;
};

export function useOpenDiamondTickets(
  workzoneId?: string,
  opts?: { dept?: string; ticketType?: string },
) {
  const queryKey = queryKeys.tickets.diamond({
    workzoneId,
    dept: opts?.dept,
    ticketType: opts?.ticketType,
  });

  const { data, isLoading, error: queryError, refetch } = useQuery({
    queryKey,
    staleTime: 30_000,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (workzoneId) params.set('workzone', workzoneId);
      if (opts?.dept && opts.dept !== 'all') params.set('dept', opts.dept);
      if (opts?.ticketType && opts.ticketType !== 'all') {
        params.set('ticketType', opts.ticketType);
      }
      params.set('limit', '100');

      const res = await fetchWithAuth(
        `/api/tickets/alert/diamond?${params.toString()}`,
      );
      if (!res) throw new Error('No response');

      const json = await res.json();
      if (!json?.success) throw new Error(json?.message || 'Failed to load open Diamond tickets');

      const apiData = json.data;
      return (Array.isArray(apiData) ? apiData : []) as AlertDiamondTicketApi[];
    },
  });

  const tickets = useMemo(() => {
    const rows = data ?? [];
    const mapped: OpenDiamondTicket[] = [];

    for (const t of rows) {
      const idTicket = t.idTicket || t.id_ticket || 0;
      const ticketId = String(t.incident || t.ticketId || t.incident || '').trim();

      let reportedAt = new Date();
      const rawDate = t.reportedAt || t.REPORTED_DATE;
      if (rawDate) {
        if (rawDate instanceof Date) {
          reportedAt = rawDate;
        } else {
          const parsed = new Date(rawDate);
          if (!isNaN(parsed.getTime())) {
            reportedAt = parsed;
          }
        }
      }

      const status = String(t.status || t.status_update || 'OPEN')
        .trim()
        .toLowerCase();
      if (status === 'close' || status === 'closed') continue;

      mapped.push({
        idTicket,
        ticketId: ticketId || `TICKET_${idTicket}`,
        customerType: String(t.customerType || t.CUSTOMER_TYPE || 'HVC_DIAMOND'),
        status: String(t.status || t.status_update || 'OPEN'),
        reportedAt,
        technicianName: t.technicianName || null,
        teknisiUserId: t.teknisiUserId || t.teknisi_user_id || null,
        workzone: t.workzone || null,
        contactName: t.contactName || t.CONTACT_NAME || null,
        serviceNo: t.serviceNo || t.SERVICE_NO || null,
      });
    }

    mapped.sort((a, b) => a.reportedAt.getTime() - b.reportedAt.getTime());
    return mapped;
  }, [data]);

  return {
    tickets,
    loading: isLoading,
    error: queryError ? (queryError as Error).message : null,
    refresh: () => { refetch(); },
  };
}
