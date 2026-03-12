'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchWithAuth } from '@/app/libs/fetcher';
import { Ticket, TicketCtype } from '@/app/types/ticket';
import { isTicketClosed } from '@/app/libs/ticket-utils';
import {
  classifyTicket,
  normalizeJenis,
  JENIS_LABELS,
  type JenisKey,
} from '@/app/libs/tickets/jenis';

export type DatePreset = '7d' | '30d' | 'ytd' | 'custom';

export type TicketAnalyticsFilters = {
  search?: string;
  workzone?: string;
  ctype?: TicketCtype | string;
  dept?: string;
  ticketType?: string;
  statusUpdate?: string;
  startDate?: string; // YYYY-MM-DD
  endDate?: string; // YYYY-MM-DD
  preset: DatePreset;
};

type ApiTicketsResult = {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  data: Ticket[];
};

export type StatMetrics = {
  total: number;
  open: number;
  onProgress: number;
  closed: number;
};

export type TicketTypeDatum = {
  key: string;
  label: string;
  count: number;
};

export type WorkzoneDatum = {
  workzone: string;
  count: number;
};

export type TrendDatum = {
  key: string; // ISO day (YYYY-MM-DD) or month key (YYYY-MM)
  label: string;
  count: number;
};

export type TicketAnalytics = {
  metrics: StatMetrics;
  byType: TicketTypeDatum[];
  byWorkzone: WorkzoneDatum[];
  trend: TrendDatum[];
  truncated: boolean;
};

function toLower(value: unknown) {
  return String(value ?? '')
    .trim()
    .toLowerCase();
}

function isOpenLike(statusUpdate: string | null | undefined) {
  const s = toLower(statusUpdate);
  return s === '' || s === 'open';
}

function isInProgressLike(statusUpdate: string | null | undefined) {
  const s = toLower(statusUpdate);
  return (
    s === 'assigned' ||
    s === 'on_progress' ||
    s === 'pending' ||
    s === 'escalated'
  );
}

function formatMonthLabel(ym: string) {
  // ym = YYYY-MM
  const [y, m] = ym.split('-').map((n) => Number(n));
  if (!y || !m) return ym;
  const monthNames = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  return `${monthNames[m - 1] ?? m} ${y}`;
}

function formatDayLabel(isoDay: string) {
  // isoDay = YYYY-MM-DD
  const d = new Date(`${isoDay}T00:00:00`);
  if (Number.isNaN(d.getTime())) return isoDay;
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return days[d.getDay()] ?? isoDay;
}

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function toISODateInput(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getMonthKey(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function getTrendBuckets(
  preset: DatePreset,
  startDate?: string,
  endDate?: string,
) {
  const now = new Date();
  const end = endDate ? new Date(`${endDate}T23:59:59`) : now;
  const start = startDate
    ? new Date(`${startDate}T00:00:00`)
    : addDays(end, -6);

  if (preset === 'ytd') {
    const y = end.getFullYear();
    const startOfYear = new Date(y, 0, 1);
    const startMonth = new Date(
      startOfYear.getFullYear(),
      startOfYear.getMonth(),
      1,
    );
    const endMonth = new Date(end.getFullYear(), end.getMonth(), 1);

    const keys: string[] = [];
    const cursor = new Date(startMonth);
    while (cursor <= endMonth) {
      keys.push(getMonthKey(cursor));
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return { granularity: 'month' as const, keys };
  }

  // day buckets
  const startDay = new Date(start);
  startDay.setHours(0, 0, 0, 0);
  const endDay = new Date(end);
  endDay.setHours(0, 0, 0, 0);

  const keys: string[] = [];
  const cursor = new Date(startDay);
  while (cursor <= endDay) {
    keys.push(toISODateInput(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return { granularity: 'day' as const, keys };
}

function bucketType(ticket: Ticket): { key: string; label: string } {
  const dept = classifyTicket({
    jenisTiket: ticket.jenisTiket,
    customerSegment: ticket.customerSegment,
    customerType: ticket.customerType,
  });

  if (dept === 'b2b') {
    const normalized = normalizeJenis(ticket.jenisTiket);
    const allowed: JenisKey[] = [
      'sqm-ccan',
      'indibiz',
      'datin',
      'reseller',
      'wifi-id',
    ];
    if (normalized && (allowed as string[]).includes(normalized)) {
      return { key: normalized, label: JENIS_LABELS[normalized] ?? normalized };
    }
    return { key: 'other-b2b', label: 'Other (B2B)' };
  }

  const ctype = (ticket.ctype ?? ticket.customerType ?? '') as
    | TicketCtype
    | string;
  const key = String(ctype).trim().toUpperCase();
  if (key === 'REGULER') return { key: 'REG', label: 'REG' };
  if (key === 'HVC_GOLD') return { key: 'GOLD', label: 'GOLD' };
  if (key === 'HVC_PLATINUM') return { key: 'PLATINUM', label: 'PLATINUM' };
  if (key === 'HVC_DIAMOND') return { key: 'DIAMOND', label: 'DIAMOND' };
  return { key: 'other-b2c', label: 'OTHER' };
}

function computeAnalytics(
  tickets: Ticket[],
  opts: { preset: DatePreset; startDate?: string; endDate?: string },
): Omit<TicketAnalytics, 'truncated'> {
  const metrics: StatMetrics = {
    total: tickets.length,
    open: 0,
    onProgress: 0,
    closed: 0,
  };

  const typeMap = new Map<string, TicketTypeDatum>();
  const wzMap = new Map<string, number>();

  const { granularity, keys } = getTrendBuckets(
    opts.preset,
    opts.startDate,
    opts.endDate,
  );
  const trendMap = new Map<string, number>(keys.map((k) => [k, 0]));

  for (const t of tickets) {
    const su = t.STATUS_UPDATE as any as string | null | undefined;
    const closed = isTicketClosed(su);
    if (closed) metrics.closed += 1;
    else if (isOpenLike(su)) metrics.open += 1;
    else if (isInProgressLike(su)) metrics.onProgress += 1;
    else metrics.onProgress += 1;

    const { key, label } = bucketType(t);
    const prev = typeMap.get(key);
    if (prev) prev.count += 1;
    else typeMap.set(key, { key, label, count: 1 });

    const wz = String(t.workzone ?? '').trim() || 'Unknown';
    wzMap.set(wz, (wzMap.get(wz) ?? 0) + 1);

    const reported = t.reportedDate;
    if (reported) {
      const d = new Date(reported);
      if (!Number.isNaN(d.getTime())) {
        const trendKey =
          granularity === 'month' ? getMonthKey(d) : toISODateInput(d);
        if (trendMap.has(trendKey))
          trendMap.set(trendKey, (trendMap.get(trendKey) ?? 0) + 1);
      }
    }
  }

  const byType = Array.from(typeMap.values()).sort((a, b) => b.count - a.count);

  const workzonesSorted = Array.from(wzMap.entries())
    .map(([workzone, count]) => ({ workzone, count }))
    .sort((a, b) => b.count - a.count);
  const topN = 8;
  const byWorkzoneTop = workzonesSorted.slice(0, topN);
  const rest = workzonesSorted.slice(topN);
  const restCount = rest.reduce((acc, r) => acc + r.count, 0);
  const byWorkzone =
    restCount > 0
      ? [...byWorkzoneTop, { workzone: 'Others', count: restCount }]
      : byWorkzoneTop;

  const trend: TrendDatum[] = keys.map((k) => {
    const label =
      granularity === 'month' ? formatMonthLabel(k) : formatDayLabel(k);
    return { key: k, label, count: trendMap.get(k) ?? 0 };
  });

  return { metrics, byType, byWorkzone, trend };
}

async function fetchTicketsPage(
  query: URLSearchParams,
  page: number,
  limit: number,
): Promise<ApiTicketsResult> {
  const params = new URLSearchParams(query);
  params.set('page', String(page));
  params.set('limit', String(limit));

  const res = await fetchWithAuth(`/api/tickets?${params.toString()}`);
  if (!res) throw new Error('No response');

  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.success) {
    throw new Error(json?.message || 'Failed to load tickets');
  }

  return json.data as ApiTicketsResult;
}

export function useTicketAnalytics(filters: TicketAnalyticsFilters) {
  const [data, setData] = useState<TicketAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const requestIdRef = useRef(0);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (filters.search) params.set('search', filters.search);
    if (filters.workzone) params.set('workzone', filters.workzone);
    if (filters.ctype) params.set('ctype', String(filters.ctype));
    if (filters.dept) params.set('dept', filters.dept);
    if (filters.ticketType) params.set('ticketType', filters.ticketType);
    if (filters.statusUpdate) params.set('statusUpdate', filters.statusUpdate);
    if (filters.startDate) params.set('startDate', filters.startDate);
    if (filters.endDate) params.set('endDate', filters.endDate);
    return params;
  }, [
    filters.search,
    filters.workzone,
    filters.ctype,
    filters.dept,
    filters.ticketType,
    filters.statusUpdate,
    filters.startDate,
    filters.endDate,
  ]);

  const refresh = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);

    const MAX_TICKETS = 5000;
    const LIMIT = 200;
    const CONCURRENCY = 4;

    try {
      const first = await fetchTicketsPage(query, 1, LIMIT);
      if (requestId !== requestIdRef.current) return;

      const totalPages = Math.max(1, Number(first.totalPages || 1));
      let tickets: Ticket[] = [...(first.data ?? [])];
      let truncated = tickets.length >= MAX_TICKETS;

      const pages: number[] = [];
      for (let p = 2; p <= totalPages; p++) pages.push(p);

      if (pages.length > 0 && !truncated) {
        let idx = 0;
        const worker = async () => {
          while (idx < pages.length && !truncated) {
            const p = pages[idx++];
            const r = await fetchTicketsPage(query, p, LIMIT);
            if (requestId !== requestIdRef.current) return;
            tickets = tickets.concat(r.data ?? []);
            if (tickets.length >= MAX_TICKETS) {
              tickets = tickets.slice(0, MAX_TICKETS);
              truncated = true;
              return;
            }
          }
        };

        await Promise.all(
          Array.from({ length: Math.min(CONCURRENCY, pages.length) }, () =>
            worker(),
          ),
        );
      }

      if (requestId !== requestIdRef.current) return;

      const computed = computeAnalytics(tickets, {
        preset: filters.preset,
        startDate: filters.startDate,
        endDate: filters.endDate,
      });

      setData({ ...computed, truncated });
    } catch (e: any) {
      if (requestId !== requestIdRef.current) return;
      setData(null);
      setError(e?.message || 'Failed to load analytics');
    } finally {
      if (requestId !== requestIdRef.current) return;
      setLoading(false);
    }
  }, [query, filters.preset, filters.startDate, filters.endDate]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { data, loading, error, refresh };
}
