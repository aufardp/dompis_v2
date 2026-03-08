import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchWithAuth } from '@/app/libs/fetcher';

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

const SLA_HOURS: Record<string, number> = {
  REGULER: 24,
  HVC_GOLD: 12,
  HVC_PLATINUM: 6,
  HVC_DIAMOND: 3,
};

function toOverdueHours(customerType: string, reportedAt: Date) {
  const sla = SLA_HOURS[customerType] ?? 24;
  const diffHours = (Date.now() - reportedAt.getTime()) / (1000 * 60 * 60);
  return Math.max(0, Math.floor(diffHours - sla));
}

export function useExpiredTickets(
  workzoneId?: string,
  opts?: { dept?: string; ticketType?: string; statusUpdate?: string },
) {
  const [rows, setRows] = useState<ExpiredTicketApiRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchExpired = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
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
      if (!res) return;

      const json = await res.json();
      if (!json?.success) {
        setError(json?.message || 'Failed to load expired tickets');
        setRows([]);
        return;
      }

      setRows((json.data || []) as ExpiredTicketApiRow[]);
    } catch (e: any) {
      setError(e?.message || 'Failed to load expired tickets');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [opts?.dept, opts?.statusUpdate, opts?.ticketType, workzoneId]);

  useEffect(() => {
    fetchExpired();
  }, [fetchExpired]);

  const tickets = useMemo(() => {
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
  }, [rows]);

  return {
    tickets,
    loading,
    error,
    refresh: fetchExpired,
  };
}
