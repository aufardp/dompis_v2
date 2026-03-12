'use client';

import { useCallback, useMemo, useState } from 'react';
import {
  format,
  startOfDay,
  endOfDay,
  differenceInCalendarDays,
  startOfMonth,
} from 'date-fns';
import type { DateRange } from 'react-day-picker';
import AdminLayout from '@/app/components/layout/AdminLayout';
import TicketTableSemesta from '@/app/admin/components/dashboard/TicketTableSemesta';
import { useSemestaTickets } from '@/app/hooks/useSemestaTickets';
import { TicketCtype } from '@/app/types/ticket';
import { cn } from '@/app/libs/utils';
import { SlidersHorizontal, X, ChevronDown } from 'lucide-react';
import StatsCards from './components/dashboard/StatsCards';
import TicketTypeChart from './components/dashboard/TicketTypeChart';
import WorkzoneChart from './components/dashboard/WorkzoneChart';
import TicketTrendChart from './components/dashboard/TicketTrendChart';
import DashboardSkeleton from './components/dashboard/DashboardSkeleton';
import DateRangePicker from './components/filters/DateRangePicker';
import { useTickets } from '@/app/hooks/useTickets';
import type { Ticket } from '@/app/types/ticket';
import { isTicketClosed } from '@/app/libs/ticket-utils';
import {
  classifyTicket,
  normalizeJenis,
  JENIS_LABELS,
  type JenisKey,
} from '@/app/libs/tickets/jenis';

type Dept = 'all' | 'b2b' | 'b2c';
type TicketType = 'all' | 'reguler' | 'sqm' | 'unspec';
type StatusFilter =
  | 'all'
  | 'open'
  | 'assigned'
  | 'on_progress'
  | 'pending'
  | 'escalated'
  | 'closed';

const DEPT_OPTIONS = [
  { key: 'all', label: 'Semua' },
  { key: 'b2b', label: 'B2B' },
  { key: 'b2c', label: 'B2C' },
];

const CTYPE_OPTIONS = [
  { key: 'all', label: 'Semua' },
  { key: 'REGULER', label: 'Reguler' },
  { key: 'HVC_GOLD', label: 'HVC Gold' },
  { key: 'HVC_PLATINUM', label: 'HVC Platinum' },
  { key: 'HVC_DIAMOND', label: 'HVC Diamond' },
  { key: 'datin_k1', label: 'DATIN K1' },
  { key: 'datin_k1k2', label: 'DATIN K1K2' },
  { key: 'datin_k3', label: 'DATIN K3' },
  { key: 'indibiz_4', label: 'Indibiz 4' },
  { key: 'indibiz_24', label: 'Indibiz 24' },
  { key: 'reseller_6', label: 'Reseller 6' },
  { key: 'reseller_36', label: 'Reseller 36' },
  { key: 'wifi_24', label: 'WiFi 24' },
];

const TYPE_OPTIONS = [
  { key: 'all', label: 'Semua' },
  { key: 'reguler', label: 'Reguler' },
  { key: 'sqm', label: 'SQM' },
  { key: 'unspec', label: 'Unspec' },
];

const STATUS_OPTIONS = [
  { key: 'all', label: 'Semua Status' },
  { key: 'OPEN', label: 'Open' },
  { key: 'ASSIGNED', label: 'Assigned' },
  { key: 'ON_PROGRESS', label: 'On Progress' },
  { key: 'PENDING', label: 'Pending' },
  { key: 'ESCALATED', label: 'Escalated' },
  { key: 'CANCELLED', label: 'Cancelled' },
  { key: 'CLOSE', label: 'Closed' },
];

function Dropdown({
  label,
  value,
  options,
  onChange,
  className = '',
}: {
  label: string;
  value: string;
  options: { key: string; label: string }[];
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <span className='w-16 shrink-0 text-[10px] font-bold tracking-[1.2px] text-(--text-secondary) uppercase'>
        {label}
      </span>
      <div className='relative'>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            'bg-surface-2 appearance-none rounded-lg border border-(--border) px-4 py-2 pr-8 text-xs font-semibold text-(--text-primary)',
            'cursor-pointer transition-all duration-150',
            'hover:border-blue-400/40 focus:border-blue-400/60 focus:ring-1 focus:ring-blue-400/20 focus:outline-none',
          )}
        >
          {options.map((opt) => (
            <option key={opt.key} value={opt.key}>
              {opt.label}
            </option>
          ))}
        </select>
        <ChevronDown className='pointer-events-none absolute top-1/2 right-2 h-3.5 w-3.5 -translate-y-1/2 text-(--text-secondary)' />
      </div>
    </div>
  );
}

function toISODateInput(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function toYmd(date: Date) {
  return format(date, 'yyyy-MM-dd');
}

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

function formatDayLabel(isoDay: string) {
  const d = new Date(`${isoDay}T00:00:00`);
  if (Number.isNaN(d.getTime())) return isoDay;
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return days[d.getDay()] ?? isoDay;
}

function formatMonthLabel(ym: string) {
  const d = new Date(`${ym}-01T00:00:00`);
  if (Number.isNaN(d.getTime())) return ym;
  return format(d, 'MMM yyyy');
}

function getMonthKey(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function buildTrendKeys(from: Date, to: Date, granularity: 'day' | 'month') {
  if (granularity === 'month') {
    const keys: string[] = [];
    const cursor = startOfMonth(from);
    const endMonth = startOfMonth(to);
    while (cursor <= endMonth) {
      keys.push(getMonthKey(cursor));
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return keys;
  }

  const keys: string[] = [];
  const cursor = new Date(from);
  cursor.setHours(0, 0, 0, 0);
  const endDay = new Date(to);
  endDay.setHours(0, 0, 0, 0);
  while (cursor <= endDay) {
    keys.push(toISODateInput(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return keys;
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

export default function SemestaPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [workzoneFilter, setWorkzoneFilter] = useState('');
  const [ctypeFilter, setCtypeFilter] = useState<TicketCtype | 'all'>('all');
  const [deptFilter, setDeptFilter] = useState<'all' | 'b2b' | 'b2c'>('all');
  const [ticketTypeFilter, setTicketTypeFilter] = useState<
    | 'all'
    | 'reguler'
    | 'sqm'
    | 'hvc'
    | 'unspec'
    | 'sqm-ccan'
    | 'indibiz'
    | 'datin'
    | 'reseller'
    | 'wifi-id'
  >('all');
  const [hasilVisitFilter, setHasilVisitFilter] = useState<
    | 'all'
    | 'open'
    | 'assigned'
    | 'on_progress'
    | 'pending'
    | 'escalated'
    | 'closed'
  >('all');
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [showMobileFilters, setShowMobileFilters] = useState(false);

  const dateFilterActive = Boolean(dateRange?.from && dateRange?.to);
  const startDate =
    dateFilterActive && dateRange?.from ? toYmd(dateRange.from) : undefined;
  const endDate =
    dateFilterActive && dateRange?.to ? toYmd(dateRange.to) : undefined;

  const {
    tickets,
    loading: ticketsLoading,
    pagination,
  } = useSemestaTickets(
    searchQuery,
    currentPage,
    workzoneFilter || undefined,
    ctypeFilter !== 'all' ? ctypeFilter : undefined,
    hasilVisitFilter !== 'all' ? hasilVisitFilter : undefined,
    deptFilter !== 'all' ? deptFilter : undefined,
    ticketTypeFilter !== 'all' ? ticketTypeFilter : undefined,
    startDate,
    endDate,
  );

  const {
    tickets: ticketsForAnalytics,
    loading: analyticsLoading,
    error: analyticsError,
    truncated: analyticsTruncated,
  } = useTickets({
    search: searchQuery || undefined,
    workzone: workzoneFilter || undefined,
    ctype: ctypeFilter !== 'all' ? ctypeFilter : undefined,
    dept: deptFilter !== 'all' ? deptFilter : undefined,
    ticketType: ticketTypeFilter !== 'all' ? ticketTypeFilter : undefined,
    statusUpdate: hasilVisitFilter !== 'all' ? hasilVisitFilter : undefined,
    startDate,
    endDate,
  });

  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query);
    setCurrentPage(1);
  }, []);

  const handleWorkzoneChange = useCallback((value: string) => {
    setWorkzoneFilter(value);
    setCurrentPage(1);
  }, []);

  const handleDeptChange = (dept: string) => {
    setDeptFilter(dept as 'all' | 'b2b' | 'b2c');
    setCurrentPage(1);
  };

  const handleTicketTypeChange = (type: string) => {
    setTicketTypeFilter(
      type as
        | 'all'
        | 'reguler'
        | 'sqm'
        | 'hvc'
        | 'unspec'
        | 'sqm-ccan'
        | 'indibiz'
        | 'datin'
        | 'reseller'
        | 'wifi-id',
    );
    setCurrentPage(1);
  };

  const handleHasilVisitChange = (status: string) => {
    setHasilVisitFilter(status as StatusFilter);
    setCurrentPage(1);
  };

  const handleCtypeChange = (ctype: string) => {
    setCtypeFilter(ctype as TicketCtype | 'all');
    setCurrentPage(1);
  };

  const resetAllFilters = () => {
    setSearchQuery('');
    setWorkzoneFilter('');
    setCtypeFilter('all');
    setDeptFilter('all');
    setTicketTypeFilter('all');
    setHasilVisitFilter('all');
    setDateRange(undefined);
    setCurrentPage(1);
  };

  const activeFilterCount =
    (deptFilter !== 'all' ? 1 : 0) +
    (ticketTypeFilter !== 'all' ? 1 : 0) +
    (hasilVisitFilter !== 'all' ? 1 : 0) +
    (ctypeFilter !== 'all' ? 1 : 0) +
    (workzoneFilter ? 1 : 0) +
    (dateFilterActive ? 1 : 0);

  const metrics = useMemo(() => {
    const m = { total: 0, open: 0, onProgress: 0, closed: 0 };
    const list = ticketsForAnalytics;
    m.total = list.length;
    for (const t of list) {
      const su = t.STATUS_UPDATE as any as string | null | undefined;
      if (isTicketClosed(su)) m.closed += 1;
      else if (isOpenLike(su)) m.open += 1;
      else if (isInProgressLike(su)) m.onProgress += 1;
      else m.onProgress += 1;
    }
    return m;
  }, [ticketsForAnalytics]);

  const byType = useMemo(() => {
    const map = new Map<
      string,
      { key: string; label: string; count: number }
    >();
    for (const t of ticketsForAnalytics) {
      const b = bucketType(t);
      const prev = map.get(b.key);
      if (prev) prev.count += 1;
      else map.set(b.key, { key: b.key, label: b.label, count: 1 });
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [ticketsForAnalytics]);

  const byWorkzone = useMemo(() => {
    const wzMap = new Map<string, number>();
    for (const t of ticketsForAnalytics) {
      const wz = String(t.workzone ?? '').trim() || 'Unknown';
      wzMap.set(wz, (wzMap.get(wz) ?? 0) + 1);
    }
    const rows = Array.from(wzMap.entries())
      .map(([workzone, count]) => ({ workzone, count }))
      .sort((a, b) => b.count - a.count);

    const topN = 8;
    const top = rows.slice(0, topN);
    const rest = rows.slice(topN);
    const restCount = rest.reduce((acc, r) => acc + r.count, 0);
    return restCount > 0
      ? [...top, { workzone: 'Others', count: restCount }]
      : top;
  }, [ticketsForAnalytics]);

  const trend = useMemo(() => {
    const now = new Date();
    const rangeFrom =
      dateFilterActive && dateRange?.from && dateRange?.to
        ? startOfDay(dateRange.from)
        : startOfDay(addDays(now, -6));
    const rangeTo =
      dateFilterActive && dateRange?.from && dateRange?.to
        ? endOfDay(dateRange.to)
        : endOfDay(now);

    const spanDays = Math.max(
      1,
      differenceInCalendarDays(rangeTo, rangeFrom) + 1,
    );
    const granularity: 'day' | 'month' =
      dateFilterActive && spanDays > 31 ? 'month' : 'day';

    const keys = buildTrendKeys(rangeFrom, rangeTo, granularity);
    const counts = new Map<string, number>(keys.map((k) => [k, 0]));

    for (const t of ticketsForAnalytics) {
      const raw = t.reportedDate;
      if (!raw) continue;
      const d = new Date(raw);
      if (Number.isNaN(d.getTime())) continue;

      if (d < rangeFrom || d > rangeTo) continue;
      const k = granularity === 'month' ? getMonthKey(d) : toISODateInput(d);
      if (!counts.has(k)) continue;
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }

    return keys.map((k) => ({
      key: k,
      label:
        granularity === 'month'
          ? formatMonthLabel(k)
          : dateFilterActive
            ? format(new Date(`${k}T00:00:00`), 'MMM dd')
            : formatDayLabel(k),
      count: counts.get(k) ?? 0,
    }));
  }, [ticketsForAnalytics, dateFilterActive, dateRange?.from, dateRange?.to]);

  const ticketTableData = tickets.map((t) => ({
    idTicket: t.idTicket,
    ticket: t.ticket,
    serviceNo: t.serviceNo,
    contactName: t.contactName,
    contactPhone: t.contactPhone,
    alamat: t.alamat,
    bookingDate: t.bookingDate,
    ctype: t.ctype,
    customerType: t.customerType,
    summary: t.summary,
    jenisTiket: t.jenisTiket,
    workzone: t.workzone,
    technicianName: t.technicianName,
    teknisiUserId: t.teknisiUserId,
    STATUS_UPDATE: t.STATUS_UPDATE,
    hasilVisit: t.hasilVisit,
    closedAt: t.closedAt,
    reportedDate: t.reportedDate,
    status: t.status,
    maxTtrReguler: t.maxTtrReguler,
    maxTtrGold: t.maxTtrGold,
    maxTtrPlatinum: t.maxTtrPlatinum,
    maxTtrDiamond: t.maxTtrDiamond,
  }));

  const trendSubtitle = useMemo(() => {
    if (!dateFilterActive || !dateRange?.from || !dateRange?.to) {
      return 'Last 7 days';
    }
    const days =
      differenceInCalendarDays(
        endOfDay(dateRange.to),
        startOfDay(dateRange.from),
      ) + 1;
    const suffix = days > 31 ? ' (monthly)' : '';
    return `${format(dateRange.from, 'MMM dd, yyyy')} - ${format(
      dateRange.to,
      'MMM dd, yyyy',
    )}${suffix}`;
  }, [dateFilterActive, dateRange?.from, dateRange?.to]);

  return (
    <AdminLayout
      onSearch={handleSearch}
      onWorkzoneChange={handleWorkzoneChange}
      selectedWorkzone={workzoneFilter}
    >
      <div className='flex flex-col gap-6'>
        <div className='bg-surface overflow-hidden rounded-2xl border border-(--border)'>
          <div className='bg-surface-2 px-4 py-4 md:px-5'>
            <div className='flex flex-col gap-3 md:flex-row md:items-end md:justify-between'>
              <div>
                <div className='font-syne text-xl font-extrabold tracking-tight text-(--text-primary) md:text-2xl'>
                  Dompis Analytics
                </div>
                <div className='mt-1 text-xs text-(--text-muted)'>
                  Unified view of tickets, workload, and trend.
                </div>
              </div>
              <div className='flex items-center gap-2'>
                {analyticsTruncated && (
                  <div className='rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200'>
                    Analytics truncated (showing first 5,000 tickets). Refine
                    filters for full accuracy.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className='space-y-2'>
          <div className='flex items-center justify-between lg:hidden'>
            <button
              onClick={() => setShowMobileFilters((v) => !v)}
              className='bg-surface flex items-center gap-2 rounded-xl border border-(--border) px-3 py-2 text-sm font-semibold text-(--text-secondary) transition hover:border-blue-400/40 hover:text-blue-400'
            >
              <SlidersHorizontal size={14} />
              Filters
              {activeFilterCount > 0 && (
                <span className='rounded-full bg-blue-500 px-2 py-0.5 text-[10px] font-bold text-white'>
                  {activeFilterCount}
                </span>
              )}
            </button>
            {activeFilterCount > 0 && (
              <button
                onClick={resetAllFilters}
                className='flex items-center gap-1 text-xs font-semibold text-red-400 hover:text-red-500'
              >
                <X size={12} /> Reset
              </button>
            )}
          </div>

          <div
            className={cn(
              'flex-col gap-3',
              showMobileFilters ? 'flex' : 'hidden lg:flex',
              'bg-surface overflow-hidden rounded-xl border border-(--border) p-4 shadow-sm',
            )}
          >
            <div className='flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center'>
              <div className='flex items-center gap-2'>
                <span className='w-16 shrink-0 text-[10px] font-bold tracking-[1.2px] text-(--text-secondary) uppercase'>
                  Tanggal
                </span>
                <DateRangePicker
                  value={dateRange}
                  onChange={(r) => {
                    setDateRange(r);
                    setCurrentPage(1);
                  }}
                  onClear={() => {
                    setDateRange(undefined);
                    setCurrentPage(1);
                  }}
                />
              </div>

              <Dropdown
                label='Dept'
                value={deptFilter}
                options={DEPT_OPTIONS}
                onChange={handleDeptChange}
              />

              <Dropdown
                label='Jenis'
                value={ticketTypeFilter}
                options={TYPE_OPTIONS}
                onChange={handleTicketTypeChange}
              />

              <Dropdown
                label='Status'
                value={hasilVisitFilter}
                options={STATUS_OPTIONS}
                onChange={handleHasilVisitChange}
              />

              <Dropdown
                label='Customer'
                value={ctypeFilter}
                options={CTYPE_OPTIONS}
                onChange={handleCtypeChange}
              />

              {activeFilterCount > 0 && (
                <button
                  onClick={resetAllFilters}
                  className={cn(
                    'flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-semibold text-red-400 transition hover:bg-red-400/10',
                    'lg:ml-auto',
                  )}
                >
                  <X size={12} />
                  Reset
                  <span className='rounded-full bg-red-400/20 px-1.5 py-0.5 text-[9px] font-bold'>
                    {activeFilterCount}
                  </span>
                </button>
              )}
            </div>
          </div>
        </div>

        {analyticsLoading ? (
          <DashboardSkeleton />
        ) : (
          <>
            {analyticsError && (
              <div className='rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200'>
                {analyticsError}
              </div>
            )}

            {!analyticsError && ticketsForAnalytics.length === 0 && (
              <div className='bg-surface rounded-xl border border-slate-400/20 px-4 py-3 text-sm text-(--text-secondary)'>
                {dateFilterActive
                  ? 'No tickets found for the selected date range and filters.'
                  : 'No tickets found.'}
              </div>
            )}

            <StatsCards metrics={metrics} loading={analyticsLoading} />

            <div className='grid gap-6 lg:grid-cols-2'>
              <TicketTypeChart data={byType} loading={analyticsLoading} />
              <WorkzoneChart data={byWorkzone} loading={analyticsLoading} />
            </div>

            <TicketTrendChart
              data={trend}
              loading={analyticsLoading}
              subtitle={trendSubtitle}
            />
          </>
        )}

        <TicketTableSemesta
          tickets={ticketTableData}
          loading={ticketsLoading}
          pagination={{
            currentPage: pagination.currentPage,
            totalPages: pagination.totalPages,
            total: pagination.total,
            limit: pagination.limit,
            onPageChange: setCurrentPage,
          }}
        />
      </div>
    </AdminLayout>
  );
}
