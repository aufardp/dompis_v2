import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchWithAuth } from '@/app/libs/fetcher';

function parseDate(dateStr: string): Date | null {
  if (!dateStr) return null;

  // Try parsing DD/MM/YYYY HH:mm format
  const ddMmYyyyMatch = dateStr.match(
    /^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})$/,
  );
  if (ddMmYyyyMatch) {
    const [, day, month, year, hour, minute] = ddMmYyyyMatch;
    return new Date(
      parseInt(year),
      parseInt(month) - 1,
      parseInt(day),
      parseInt(hour),
      parseInt(minute),
    );
  }

  // Try standard Date parsing
  const date = new Date(dateStr);
  if (!isNaN(date.getTime())) {
    return date;
  }

  return null;
}

type OpenDiamondTicketApi = {
  idTicket?: number;
  id_ticket?: number;
  ticket?: string;
  INCIDENT?: string;
  summary?: string;
  SUMMARY?: string;
  reportedDate?: string | null;
  REPORTED_DATE?: string | null;
  contactName?: string | null;
  CONTACT_NAME?: string | null;
  serviceNo?: string | null;
  SERVICE_NO?: string | null;
  ctype?: string | null;
  CUSTOMER_TYPE?: string | null;
  customerType?: string | null;
  hasilVisit?: string | null;
  HASIL_VISIT?: string | null;
  status?: string | null;
  teknisiUserId?: number | null;
  teknisi_user_id?: number | null;
  workzone?: string | null;
  WORKZONE?: string | null;
  users?: {
    nama?: string;
  } | null;
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
  const [rows, setRows] = useState<OpenDiamondTicketApi[]>([]);
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
      // Always filter for Diamond and OPEN
      params.set('ctype', 'HVC_DIAMOND');
      params.set('statusUpdate', 'open');
      params.set('limit', '100'); // Get more tickets

      console.log(
        '🔍 Fetching Diamond tickets with params:',
        params.toString(),
      );

      const res = await fetchWithAuth(`/api/tickets?${params.toString()}`);
      if (!res) return;

      const json = await res.json();
      console.log('📦 Diamond API response:', json);

      if (!json?.success) {
        setError(json?.message || 'Failed to load open Diamond tickets');
        setRows([]);
        return;
      }

      // Extract tickets from paginated response
      // API returns: { success: true, data: { data: [...], total, page, limit } }
      const apiData = json.data;
      const ticketsData = Array.isArray(apiData)
        ? apiData
        : apiData?.data || [];

      console.log('🎫 Diamond tickets found:', ticketsData.length);
      console.log('🎫 Sample ticket:', ticketsData[0]);
      setRows(ticketsData as OpenDiamondTicketApi[]);
    } catch (e: any) {
      console.error('❌ Diamond fetch error:', e);
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
      const ticketId = String(t.ticket || t.INCIDENT || '').trim();
      const customerType = String(
        t.ctype || t.CUSTOMER_TYPE || t.customerType || 'HVC_DIAMOND',
      );

      // Handle reportedDate with format "DD/MM/YYYY HH:mm"
      let reportedAt = new Date();
      const rawDate = t.reportedDate || t.REPORTED_DATE;
      if (rawDate) {
        const parsed = parseDate(rawDate);
        if (parsed && !isNaN(parsed.getTime())) {
          reportedAt = parsed;
        }
      }

      const status = String(t.hasilVisit || t.status || 'OPEN');

      // Extract customer name and service number from summary/SUMMARY if not available directly
      let contactName = t.contactName || t.CONTACT_NAME || '';
      let serviceNo = t.serviceNo || t.SERVICE_NO || '';
      const summary = t.summary || t.SUMMARY || '';

      if (!contactName && summary) {
        const nameMatch = summary.match(/Nama Pelanggan\s*[-_]\s*([^_\n]+)/i);
        if (nameMatch) {
          contactName = nameMatch[1].trim();
        }
      }

      if (!serviceNo && summary) {
        const serviceMatch = summary.match(/(\d{9,})/);
        if (serviceMatch) {
          serviceNo = serviceMatch[1];
        }
      }

      mapped.push({
        idTicket,
        ticketId: ticketId || `TICKET_${idTicket}`,
        customerType,
        status,
        reportedAt,
        technicianName: t.users?.nama || null,
        teknisiUserId: t.teknisiUserId || t.teknisi_user_id || null,
        workzone: t.workzone || t.WORKZONE || null,
        contactName: contactName || null,
        serviceNo: serviceNo || null,
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
