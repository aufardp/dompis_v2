'use client';

import { useCallback, useMemo, useState, useRef, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  format,
  endOfDay,
  differenceInCalendarDays,
  startOfDay,
  subDays,
} from 'date-fns';
import type { DateRange } from 'react-day-picker';
import AdminLayout from '@/app/components/layout/AdminLayout';
import { useSemestaTickets } from '@/app/hooks/useSemestaTickets';
import { TicketCtype } from '@/app/types/ticket';
import { cn } from '@/app/libs/utils';
import { SlidersHorizontal, X, ChevronDown } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useTicketAnalytics } from './hooks/useTicketAnalytics';
import { useSemestaAnalyticsV2 } from './hooks/useSemestaAnalyticsV2';
import type { SemestaAnalyticsV2Filters } from './hooks/useSemestaAnalyticsV2';
import SearchToast from '@/app/admin/components/dashboard/SearchToast';
import { useUrlSearchQuery } from '@/app/hooks/useUrlSearchQuery';
import { usePersistentWorkzoneScope } from '@/app/hooks/usePersistentWorkzoneScope';

const StatsCards = dynamic(() => import('./components/dashboard/StatsCards'), {
  ssr: false,
  loading: () => (
    <phantom-ui suppressHydrationWarning fallback-radius={8} loading animation='shimmer' reveal={0.12} loading-label='Loading stats cards'>
      <div className='grid grid-cols-2 gap-4 md:grid-cols-4'>
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className='h-24 rounded-xl border border-(--border) bg-(--surface)' />
        ))}
      </div>
    </phantom-ui>
  ),
});

const TicketTypeChart = dynamic(
  () => import('./components/dashboard/TicketTypeChart'),
  {
    ssr: false,
    loading: () => (
      <phantom-ui suppressHydrationWarning fallback-radius={8} loading animation='shimmer' reveal={0.12} loading-label='Loading ticket type chart'>
        <div className='h-80 rounded-xl border border-(--border) bg-(--surface)' />
      </phantom-ui>
    ),
  },
);

const WorkzoneChart = dynamic(
  () => import('./components/dashboard/WorkzoneChart'),
  {
    ssr: false,
    loading: () => (
      <phantom-ui suppressHydrationWarning fallback-radius={8} loading animation='shimmer' reveal={0.12} loading-label='Loading workzone chart'>
        <div className='h-80 rounded-xl border border-(--border) bg-(--surface)' />
      </phantom-ui>
    ),
  },
);

const TicketTrendChart = dynamic(
  () => import('./components/dashboard/TicketTrendChart'),
  {
    ssr: false,
    loading: () => (
      <phantom-ui suppressHydrationWarning fallback-radius={8} loading animation='shimmer' reveal={0.12} loading-label='Loading ticket trend chart'>
        <div className='h-80 rounded-xl border border-(--border) bg-(--surface)' />
      </phantom-ui>
    ),
  },
);

const DashboardSkeleton = dynamic(
  () => import('./components/dashboard/DashboardSkeleton'),
  { ssr: false },
);

const TicketTableSemesta = dynamic(
  () => import('@/app/admin/components/dashboard/TicketTableSemesta'),
  {
    ssr: false,
    loading: () => (
      <phantom-ui suppressHydrationWarning fallback-radius={8} loading animation='shimmer' reveal={0.12} loading-label='Loading semesta tickets'>
        <div className='h-[420px] rounded-xl border border-(--border) bg-(--surface)' />
      </phantom-ui>
    ),
  },
);

const DateRangePicker = dynamic(
  () => import('./components/filters/DateRangePicker'),
  {
    ssr: false,
    loading: () => (
      <phantom-ui suppressHydrationWarning fallback-radius={8} loading animation='shimmer' reveal={0.12} loading-label='Loading date range picker'>
        <div className='h-10 w-[220px] rounded-lg border border-(--border) bg-(--surface)' />
      </phantom-ui>
    ),
  },
);

// --- New V2 analytics components ---
const KpiStrip = dynamic(
  () => import('./components/analytics/KpiStrip'),
  {
    ssr: false,
    loading: () => (
      <phantom-ui suppressHydrationWarning fallback-radius={8} loading animation='shimmer' reveal={0.12} loading-label='Loading KPI strip'>
        <div className='flex gap-3 overflow-x-auto pb-2'>
          {Array.from({ length: 8 }, (_, i) => (
            <div
              key={i}
              className='h-[104px] w-[180px] shrink-0 rounded-xl border border-(--border) bg-(--surface)'
            />
          ))}
        </div>
      </phantom-ui>
    ),
  },
);

const TrendByJenisChart = dynamic(
  () => import('./components/analytics/TrendByJenisChart'),
  {
    ssr: false,
    loading: () => (
      <phantom-ui suppressHydrationWarning fallback-radius={8} loading animation='shimmer' reveal={0.12} loading-label='Loading trend by jenis chart'>
        <div className='h-[340px] rounded-xl border border-(--border) bg-(--surface)' />
      </phantom-ui>
    ),
  },
);

const B2cB2bTrendChart = dynamic(
  () => import('./components/analytics/B2cB2bTrendChart'),
  {
    ssr: false,
    loading: () => (
      <phantom-ui suppressHydrationWarning fallback-radius={8} loading animation='shimmer' reveal={0.12} loading-label='Loading B2C B2B trend chart'>
        <div className='h-[340px] rounded-xl border border-(--border) bg-(--surface)' />
      </phantom-ui>
    ),
  },
);

const WorkzoneAnalysisTable = dynamic(
  () => import('./components/analytics/WorkzoneAnalysisTable'),
  {
    ssr: false,
    loading: () => (
      <phantom-ui suppressHydrationWarning fallback-radius={8} loading animation='shimmer' reveal={0.12} loading-label='Loading workzone analysis table'>
        <div className='h-[320px] rounded-xl border border-(--border) bg-(--surface)' />
      </phantom-ui>
    ),
  },
);

const TopGaulList = dynamic(
  () => import('./components/analytics/TopGaulList'),
  {
    ssr: false,
    loading: () => (
      <phantom-ui suppressHydrationWarning fallback-radius={8} loading animation='shimmer' reveal={0.12} loading-label='Loading top GAUL list'>
        <div className='h-[260px] rounded-xl border border-(--border) bg-(--surface)' />
      </phantom-ui>
    ),
  },
);

const TopLapulList = dynamic(
  () => import('./components/analytics/TopLapulList'),
  {
    ssr: false,
    loading: () => (
      <phantom-ui suppressHydrationWarning fallback-radius={8} loading animation='shimmer' reveal={0.12} loading-label='Loading top LAPUL list'>
        <div className='h-[260px] rounded-xl border border-(--border) bg-(--surface)' />
      </phantom-ui>
    ),
  },
);

const AnalyticsSkeleton = dynamic(
  () => import('./components/analytics/AnalyticsSkeleton'),
  { ssr: false },
);

// --- Old analytics (keep for backward compat with ticket table) ---
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

const TYPE_OPTIONS = [
  { key: 'all', label: 'Semua' },
  { key: 'reguler', label: 'Customer' },
  { key: 'sqm', label: 'SQM' },
  { key: 'unspec', label: 'Unspec' },
];

const PRESET_OPTIONS = [
  { key: '7d', label: '7 Hari' },
  { key: '30d', label: '30 Hari' },
  { key: 'month', label: 'Bulan Ini' },
] as const;

// --- Legacy types kept for ticket table ---
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

function toYmd(date: Date) {
  return format(date, 'yyyy-MM-dd');
}

export default function SemestaPage() {
  const searchParams = useSearchParams();
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const { workzone: workzoneFilter, setWorkzone: setWorkzoneFilter } =
    usePersistentWorkzoneScope();
  const [ctypeFilter, setCtypeFilter] = useState<TicketCtype | 'all'>('all');
  const [deptFilter, setDeptFilter] = useState<'all' | 'b2b' | 'b2c'>('all');
  const [ticketTypeFilter, setTicketTypeFilter] = useState<string>('all');
  const [hasilVisitFilter, setHasilVisitFilter] = useState<string>('all');
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: startOfDay(subDays(new Date(), 29)),
    to: endOfDay(new Date()),
  });
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [searchToast, setSearchToast] = useState<{
    message: string;
    type: 'success' | 'error';
  } | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);

  const dateFilterActive = Boolean(dateRange?.from && dateRange?.to);
  const startDate =
    dateFilterActive && dateRange?.from ? toYmd(dateRange.from) : undefined;
  const endDate =
    dateFilterActive && dateRange?.to ? toYmd(dateRange.to) : undefined;

  // --- V2 analytics filters (simplified: no status/ctype) ---
  const analyticsFilters: SemestaAnalyticsV2Filters = useMemo(
    () => ({
      startDate,
      endDate,
      workzone: workzoneFilter || undefined,
      dept: deptFilter !== 'all' ? deptFilter : undefined,
      ticketType: ticketTypeFilter !== 'all' ? ticketTypeFilter : undefined,
    }),
    [startDate, endDate, workzoneFilter, deptFilter, ticketTypeFilter],
  );

  // --- V1 analytics (kept for backward compat with ticket table filters) ---
  const { data: analyticsData, loading: analyticsLoading } = useTicketAnalytics({
    search: searchQuery || undefined,
    workzone: workzoneFilter || undefined,
    ctype: ctypeFilter !== 'all' ? ctypeFilter : undefined,
    dept: deptFilter !== 'all' ? deptFilter : undefined,
    ticketType: ticketTypeFilter !== 'all' ? ticketTypeFilter : undefined,
    statusUpdate: hasilVisitFilter !== 'all' ? hasilVisitFilter : undefined,
    startDate,
    endDate,
  });

  // --- V2 analytics hook ---
  const { data: analyticsV2, loading: analyticsV2Loading } =
    useSemestaAnalyticsV2(analyticsFilters);

  // --- Ticket table (kept unchanged) ---
  const {
    tickets,
    loading: ticketsLoading,
    isRefreshing: ticketsRefreshing,
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

  const metrics = analyticsData?.metrics;
  const byType = analyticsData?.byType ?? [];
  const byWorkzone = analyticsData?.byWorkzone ?? [];
  const trend = analyticsData?.trend ?? [];

  useUrlSearchQuery({
    searchParams,
    onQuery: useCallback((q: string) => {
      setSearchQuery(q);
      setCurrentPage(1);
    }, []),
    onClear: useCallback(() => {
      setSearchQuery('');
      setCurrentPage(1);
    }, []),
  });

  // Auto-scroll to ticket table when search results load + show toast
  useEffect(() => {
    if (!searchQuery.trim() || ticketsLoading || ticketsRefreshing) {
      if (!searchQuery.trim()) {
        setSearchToast(null);
      }
      return;
    }
    if (pagination.total > 0) {
      setSearchToast({
        message: `${pagination.total} tiket`,
        type: 'success',
      });
      window.requestAnimationFrame(() => {
        tableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    } else {
      setSearchToast({ message: 'Tidak ditemukan', type: 'error' });
    }
  }, [searchQuery, ticketsLoading, ticketsRefreshing, pagination.total]);

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
    setTicketTypeFilter(type);
    setCurrentPage(1);
  };

  const handleHasilVisitChange = (status: string) => {
    setHasilVisitFilter(status);
    setCurrentPage(1);
  };

  const handleCtypeChange = (ctype: string) => {
    setCtypeFilter(ctype as TicketCtype | 'all');
    setCurrentPage(1);
  };

  const handlePreset = (days: number, label: string) => {
    setDateRange({
      from: startOfDay(subDays(new Date(), days - 1)),
      to: endOfDay(new Date()),
    });
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
    status_update: t.status_update,
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
      return 'Last 30 days';
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
      onWorkzoneChange={handleWorkzoneChange}
      selectedWorkzone={workzoneFilter}
    >
      <div className='flex flex-col gap-8 font-dm-sans text-[13px] leading-5'>
        {/* Page Header */}
        <div className='overflow-hidden rounded-3xl border border-(--border) bg-(--surface) shadow-sm'>
          <div className='bg-(--surface-2) px-5 py-5 md:px-6'>
            <div className='flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between'>
              <div className='max-w-3xl space-y-3'>
                <div className='flex flex-wrap items-center gap-2'>
                  <span className='rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-1 text-[10px] font-bold tracking-[0.18em] text-blue-500 uppercase'>
                    Semesta
                  </span>
                  <span className='rounded-full border border-(--border) bg-(--surface) px-3 py-1 text-[10px] font-semibold tracking-[0.16em] text-(--text-muted) uppercase'>
                    Daily Ops Board
                  </span>
                </div>
                <div>
                  <h1 className='font-dm-sans text-2xl font-bold tracking-[-0.3px] text-(--text-primary) md:text-4xl'>
                    Analytics
                  </h1>
                  <p className='mt-2 max-w-2xl text-sm leading-6 text-(--text-muted)'>
                    Ticket health, repeat patterns, and workzone load in one
                    operational lens.{' '}
                    {workzoneFilter
                      ? `Focused on workzone ${workzoneFilter}.`
                      : 'All workzones are visible in the current scope.'}
                  </p>
                </div>
              </div>
              <div className='grid gap-3 sm:grid-cols-3 lg:min-w-[360px]'>
                <div className='rounded-2xl border border-(--border) bg-(--surface) px-4 py-3'>
                  <p className='text-[10px] font-bold tracking-[0.18em] text-(--text-muted) uppercase'>
                    Scope
                  </p>
                  <p className='mt-1 text-sm font-semibold text-(--text-primary)'>
                    {workzoneFilter ? `Workzone ${workzoneFilter}` : 'All Workzone'}
                  </p>
                </div>
                <div className='rounded-2xl border border-(--border) bg-(--surface) px-4 py-3'>
                  <p className='text-[10px] font-bold tracking-[0.18em] text-(--text-muted) uppercase'>
                    Range
                  </p>
                  <p className='mt-1 text-sm font-semibold text-(--text-primary)'>
                    {trendSubtitle}
                  </p>
                </div>
                <div className='rounded-2xl border border-(--border) bg-(--surface) px-4 py-3'>
                  <p className='text-[10px] font-bold tracking-[0.18em] text-(--text-muted) uppercase'>
                    Status
                  </p>
                  <p className='mt-1 text-sm font-semibold text-(--text-primary)'>
                    {dateFilterActive ? 'Filtered view' : 'Default window'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Filter Bar */}
        <div className='overflow-hidden rounded-3xl border border-(--border) bg-(--surface) shadow-sm'>
          <div className='flex items-center justify-between border-b border-(--border) bg-(--surface-2) px-5 py-3 md:px-6'>
            <div>
              <p className='text-[10px] font-bold tracking-[0.18em] text-(--text-muted) uppercase'>
                Filter Workspace
              </p>
              <p className='mt-0.5 text-xs text-(--text-secondary)'>
                Date, department, type, and status filters drive the table and charts below.
              </p>
            </div>
            {activeFilterCount > 0 && (
              <button
                onClick={resetAllFilters}
                className='hidden items-center gap-1 rounded-full border border-red-500/20 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-500 transition hover:bg-red-500/15 lg:inline-flex'
              >
                <X size={12} />
                Reset
                <span className='rounded-full bg-red-500/15 px-1.5 py-0.5 text-[9px] font-bold'>
                  {activeFilterCount}
                </span>
              </button>
            )}
          </div>

          <div className='space-y-2 p-4'>
            <div className='flex items-center justify-between lg:hidden'>
              <button
                onClick={() => setShowMobileFilters((v) => !v)}
                className='bg-surface flex items-center gap-2 rounded-xl border border-(--border) px-3 py-2 font-dm-sans text-sm font-semibold text-(--text-secondary) transition hover:border-blue-400/40 hover:text-blue-400'
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
                  className='flex items-center gap-1 font-dm-sans text-xs font-semibold text-red-400 hover:text-red-500'
                >
                  <X size={12} /> Reset
                </button>
              )}
            </div>

            <div
              className={cn(
                'flex-col gap-3',
                showMobileFilters ? 'flex' : 'hidden lg:flex',
                'rounded-2xl border border-(--border) bg-(--bg) p-4',
              )}
            >
              <div className='flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center'>
                {/* Date */}
                <div className='flex items-center gap-2'>
                  <span className='font-outfit w-16 shrink-0 text-[10px] font-bold tracking-[1.2px] text-(--text-secondary) uppercase'>
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

                {/* Preset chips */}
                <div className='flex items-center gap-1.5'>
                  {PRESET_OPTIONS.map((p) => {
                    const days = p.key === '7d' ? 7 : p.key === '30d' ? 30 : 0;
                    return (
                      <button
                        key={p.key}
                        onClick={() => handlePreset(days || 30, p.label)}
                        className={cn(
                          'rounded-lg px-3 py-1.5 text-[11px] font-semibold transition',
                          'border border-(--border)',
                          'hover:border-blue-400/40 hover:text-blue-400',
                        )}
                      >
                        {p.label}
                      </button>
                    );
                  })}
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

                {/* Status & Customer — moved to table scope, kept for ticket table filter */}
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
                      'flex items-center gap-1 rounded-lg px-3 py-2 font-dm-sans text-xs font-semibold text-red-400 transition hover:bg-red-400/10',
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
        </div>

        {/* V2 Analytics Section */}
        {analyticsV2Loading ? (
          <AnalyticsSkeleton />
        ) : analyticsV2 ? (
          <div className='overflow-hidden rounded-3xl border border-(--border) bg-(--surface) shadow-sm'>
            <div className='border-b border-(--border) bg-(--surface-2) px-5 py-3 md:px-6'>
              <div className='flex items-center justify-between gap-3'>
                <div>
                  <p className='text-[10px] font-bold tracking-[0.18em] text-(--text-muted) uppercase'>
                    Operational Snapshot
                  </p>
                  <p className='mt-0.5 text-xs text-(--text-secondary)'>
                    KPI mix, ticket trend, and workzone load from the current filter scope.
                  </p>
                </div>
                <span className='rounded-full border border-(--border) bg-(--bg) px-3 py-1 text-[10px] font-semibold tracking-[0.14em] text-(--text-muted) uppercase'>
                  V2 Analytics
                </span>
              </div>
            </div>
            <div className='space-y-5 p-4 md:p-5'>
              <KpiStrip kpi={analyticsV2.kpi} loading={false} />
              <div className='grid gap-5 lg:grid-cols-2'>
                <TrendByJenisChart
                  data={analyticsV2.trendByJenis}
                  loading={false}
                />
                <B2cB2bTrendChart
                  data={analyticsV2.trendByDept}
                  loading={false}
                />
              </div>
              <WorkzoneAnalysisTable
                data={analyticsV2.byWorkzone}
                loading={false}
              />
              <div className='grid gap-5 lg:grid-cols-2'>
                <TopGaulList
                  data={analyticsV2.topGaulServices}
                  loading={false}
                />
                <TopLapulList
                  data={analyticsV2.topLapulIncidents}
                  loading={false}
                />
              </div>
            </div>
          </div>
        ) : (
          /* Fallback: show old V1 charts if V2 fails to load */
          <>
            {analyticsLoading ? (
              <DashboardSkeleton />
            ) : (metrics?.total ?? 0) === 0 ? (
              <div className='rounded-2xl border border-(--border) bg-(--surface) px-4 py-3 font-dm-sans text-sm text-(--text-secondary) shadow-sm'>
                {dateFilterActive
                  ? 'No tickets found for the selected date range and filters.'
                  : 'No tickets found.'}
              </div>
            ) : (
              <>
                <div className='overflow-hidden rounded-3xl border border-(--border) bg-(--surface) shadow-sm'>
                  <div className='border-b border-(--border) bg-(--surface-2) px-5 py-3 md:px-6'>
                    <p className='text-[10px] font-bold tracking-[0.18em] text-(--text-muted) uppercase'>
                      Legacy Analytics
                    </p>
                    <p className='mt-0.5 text-xs text-(--text-secondary)'>
                      Shown when the v2 analytics payload is unavailable.
                    </p>
                  </div>
                  <div className='space-y-5 p-4 md:p-5'>
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
                  </div>
                </div>
              </>
            )}
          </>
        )}

        {/* Ticket Table — unchanged, separate hook */}
        <div ref={tableRef} className='scroll-mt-20'>
          <div className='overflow-hidden rounded-3xl border border-(--border) bg-(--surface) shadow-sm'>
            <div className='border-b border-(--border) bg-(--surface-2) px-5 py-3 md:px-6'>
              <div className='flex flex-wrap items-center justify-between gap-3'>
                <div>
                  <p className='text-[10px] font-bold tracking-[0.18em] text-(--text-muted) uppercase'>
                    Ticket Table
                  </p>
                  <p className='mt-0.5 text-xs text-(--text-secondary)'>
                    The list below follows the same filter scope as the analytics above.
                  </p>
                </div>
                <span className='rounded-full border border-(--border) bg-(--bg) px-3 py-1 text-[10px] font-semibold tracking-[0.14em] text-(--text-muted) uppercase'>
                  {pagination.total.toLocaleString()} tickets
                </span>
              </div>
            </div>
            <div>
              <TicketTableSemesta
                tickets={ticketTableData}
                loading={ticketsLoading}
                downloadFilters={{
                  dept: deptFilter,
                  search: searchQuery.trim() || undefined,
                  workzone: workzoneFilter || undefined,
                  ctype: ctypeFilter !== 'all' ? ctypeFilter : undefined,
                  ticketType:
                    ticketTypeFilter !== 'all' ? ticketTypeFilter : undefined,
                  statusUpdate:
                    hasilVisitFilter !== 'all' ? hasilVisitFilter : undefined,
                  startDate,
                  endDate,
                }}
                pagination={{
                  currentPage: pagination.currentPage,
                  totalPages: pagination.totalPages,
                  total: pagination.total,
                  limit: pagination.limit,
                  onPageChange: setCurrentPage,
                }}
              />
            </div>
          </div>
        </div>
      </div>

      <SearchToast
        message={searchToast?.message ?? null}
        type={searchToast?.type ?? 'idle'}
        onDismiss={() => setSearchToast(null)}
      />
    </AdminLayout>
  );
}
