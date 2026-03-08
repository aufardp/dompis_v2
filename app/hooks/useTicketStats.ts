import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchWithAuth } from '@/app/libs/fetcher';

type TicketStatsRow = {
  total: number;
  unassigned: number;
  open: number;
  assigned: number;
  closed: number;
};

type StatsByServiceAreaRow = TicketStatsRow & {
  id_sa: number;
  nama_sa: string;
};

type StatsByCustomerTypeRow = TicketStatsRow & {
  ctype: 'REGULER' | 'HVC_GOLD' | 'HVC_PLATINUM' | 'HVC_DIAMOND' | string;
  regulerTotal?: number;
  sqmTotal?: number;
  unspecTotal?: number;
  ffg?: number;
  p1?: number;
  pPlus?: number;
};

type StatsByFlaggingB2CRow = {
  P1: number;
  PPlus: number;
};

type StatsByGuaranteeB2CRow = {
  guarantee: number;
};

export type TicketStatsResponse = TicketStatsRow & {
  byServiceArea?: StatsByServiceAreaRow[];
  byCustomerType?: StatsByCustomerTypeRow[];
  byFlaggingB2C?: StatsByFlaggingB2CRow;
  byGuaranteeB2C?: StatsByGuaranteeB2CRow;
};

export function useTicketStats(
  workzoneId?: string,
  opts?: { dept?: string; ticketType?: string; statusUpdate?: string },
) {
  const [data, setData] = useState<TicketStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      params.set('includeBy', 'sa,ctype,flagging,guarantee');
      if (workzoneId) params.set('workzone', workzoneId);
      if (opts?.dept && opts.dept !== 'all') params.set('dept', opts.dept);
      if (opts?.ticketType && opts.ticketType !== 'all') {
        params.set('ticketType', opts.ticketType);
      }
      if (opts?.statusUpdate && opts.statusUpdate !== 'all') {
        params.set('statusUpdate', opts.statusUpdate);
      }

      const res = await fetchWithAuth(
        `/api/tickets/stats?${params.toString()}`,
      );
      if (!res) return;

      const json = await res.json();
      if (!json?.success) {
        setError(json?.message || 'Failed to load stats');
        setData(null);
        return;
      }

      setData(json.data as TicketStatsResponse);
    } catch (e: any) {
      setError(e?.message || 'Failed to load stats');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [opts?.dept, opts?.statusUpdate, opts?.ticketType, workzoneId]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const byServiceArea = useMemo(() => data?.byServiceArea ?? [], [data]);
  const byCustomerType = useMemo(() => data?.byCustomerType ?? [], [data]);
  const byFlaggingB2C = useMemo(
    () => data?.byFlaggingB2C ?? { P1: 0, PPlus: 0 },
    [data],
  );
  const byGuaranteeB2C = useMemo(
    () => data?.byGuaranteeB2C ?? { guarantee: 0 },
    [data],
  );

  return {
    data,
    byServiceArea,
    byCustomerType,
    byFlaggingB2C,
    byGuaranteeB2C,
    loading,
    error,
    refresh: fetchStats,
  };
}
