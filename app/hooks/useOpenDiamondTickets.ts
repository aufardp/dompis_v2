import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchWithAuth } from '@/app/libs/fetcher';

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
  const [rows, setRows] = useState<AlertDiamondTicketApi[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOpenDiamond = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (workzoneId) params.set('workzone', workzoneId);
      if (opts?.dept && opts.dept !== 'all') params.set('dept', opts.dept);
      if (opts?.ticketType && opts.ticketType !== 'all') {
        params.set('ticketType', opts.ticketType);
      }
      params.set('limit', '100');

      console.log(
        '🔍 Fetching Alert Diamond tickets from /api/tickets/alert/diamond',
        params.toString(),
      );

      // Use the new alert-specific API that filters by today's sync_date only
      const res = await fetchWithAuth(
        `/api/tickets/alert/diamond?${params.toString()}`,
      );
      if (!res) return;

      const json = await res.json();
      console.log('📦 Alert Diamond API response:', json);

      if (!json?.success) {
        setError(json?.message || 'Failed to load open Diamond tickets');
        setRows([]);
        return;
      }

      const apiData = json.data;
      const ticketsData = Array.isArray(apiData) ? apiData : [];
      console.log('🎫 Alert Diamond tickets found:', ticketsData.length);

      setRows(ticketsData as AlertDiamondTicketApi[]);
    } catch (e: any) {
      console.error('❌ Alert Diamond fetch error:', e);
      setError(e?.message || 'Failed to load open Diamond tickets');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [opts?.dept, opts?.ticketType, workzoneId]);

  useEffect(() => {
    fetchOpenDiamond();
  }, [fetchOpenDiamond]);

  const tickets = useMemo(() => {
    const mapped: OpenDiamondTicket[] = [];

    for (const t of rows) {
      const idTicket = t.idTicket || t.id_ticket || 0;
      const ticketId = String(t.incident || t.incident || t.ticketId || '').trim();

      // Handle reportedDate
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
      // Skip tickets that are already closed
      if (status === 'close' || status === 'closed') continue;

      mapped.push({
        idTicket,
        ticketId: ticketId || `TICKET_${idTicket}`,
        customerType: String(t.customerType || t.CUSTOMER_TYPE || 'HVC_DIAMOND'),
        status: String(t.status || t.status_update || 'OPEN'),
        reportedAt,
        technicianName: t.technicianName || null,
        teknisiUserId: t.teknisiUserId || t.teknisi_user_id || null,
        workzone: t.workzone || t.workzone || null,
        contactName: t.contactName || t.CONTACT_NAME || null,
        serviceNo: t.serviceNo || t.SERVICE_NO || null,
      });
    }

    // Sort by reported date (oldest first - most urgent)
    mapped.sort((a, b) => a.reportedAt.getTime() - b.reportedAt.getTime());
    return mapped;
  }, [rows]);

  return {
    tickets,
    loading,
    error,
    refresh: fetchOpenDiamond,
  };
}
