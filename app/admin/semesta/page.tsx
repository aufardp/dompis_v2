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

import { cn } from '@/app/libs/utils';
import { SlidersHorizontal, X, ChevronDown } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useSemestaAnalyticsV2 } from './hooks/useSemestaAnalyticsV2';
import type { SemestaAnalyticsV2Filters } from './hooks/useSemestaAnalyticsV2';
import SearchToast from '@/app/admin/components/dashboard/SearchToast';
import { useUrlSearchQuery } from '@/app/hooks/useUrlSearchQuery';
import { usePersistentWorkzoneScope } from '@/app/hooks/usePersistentWorkzoneScope';
import { JENIS_TIKET_LIST } from '@/app/config/jenis-tiket';
import {
  CLOSE_STATUS_VALUES,
  OPEN_STATUS_VALUES,
} from '@/app/libs/ticket-utils';

const StatsCards = dynamic(() => import('./components/dashboard/StatsCards'), {
  ssr: false,
  loading: () => (
    <phantom-ui
      suppressHydrationWarning
      fallback-radius={8}
      loading
      animation='shimmer'
      reveal={0.12}
      loading-label='Loading stats cards'
    >
      <div className='grid grid-cols-2 gap-4 md:grid-cols-4'>
        {Array.from({ length: 4 }, (_, i) => (
          <div
            key={i}
            className='h-24 rounded-xl border border-(--border) bg-(--surface)'
          />
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
      <phantom-ui
        suppressHydrationWarning
        fallback-radius={8}
        loading
        animation='shimmer'
        reveal={0.12}
        loading-label='Loading ticket type chart'
      >
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
      <phantom-ui
        suppressHydrationWarning
        fallback-radius={8}
        loading
        animation='shimmer'
        reveal={0.12}
        loading-label='Loading workzone chart'
      >
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
      <phantom-ui
        suppressHydrationWarning
        fallback-radius={8}
        loading
        animation='shimmer'
        reveal={0.12}
        loading-label='Loading ticket trend chart'
      >
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
      <phantom-ui
        suppressHydrationWarning
        fallback-radius={8}
        loading
        animation='shimmer'
        reveal={0.12}
        loading-label='Loading semesta tickets'
      >
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
      <phantom-ui
        suppressHydrationWarning
        fallback-radius={8}
        loading
        animation='shimmer'
        reveal={0.12}
        loading-label='Loading date range picker'
      >
        <div className='h-10 w-[220px] rounded-lg border border-(--border) bg-(--surface)' />
      </phantom-ui>
    ),
  },
);

// --- New V2 analytics components ---
const KpiStrip = dynamic(() => import('./components/analytics/KpiStrip'), {
  ssr: false,
  loading: () => (
    <phantom-ui
      suppressHydrationWarning
      fallback-radius={8}
      loading
      animation='shimmer'
      reveal={0.12}
      loading-label='Loading KPI strip'
    >
      <div className='flex gap-3 overflow-x-auto pb-2'>
        {Array.from({ length: 3 }, (_, i) => (
          <div
            key={i}
            className='h-[80px] w-[180px] shrink-0 rounded-xl border border-(--border) bg-(--surface)'
          />
        ))}
      </div>
    </phantom-ui>
  ),
});

const TrendByJenisChart = dynamic(
  () => import('./components/analytics/TrendByJenisChart'),
  {
    ssr: false,
    loading: () => (
      <phantom-ui
        suppressHydrationWarning
        fallback-radius={8}
        loading
        animation='shimmer'
        reveal={0.12}
        loading-label='Loading trend by jenis chart'
      >
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
      <phantom-ui
        suppressHydrationWarning
        fallback-radius={8}
        loading
        animation='shimmer'
        reveal={0.12}
        loading-label='Loading B2C B2B trend chart'
      >
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
      <phantom-ui
        suppressHydrationWarning
        fallback-radius={8}
        loading
        animation='shimmer'
        reveal={0.12}
        loading-label='Loading workzone analysis table'
      >
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
      <phantom-ui
        suppressHydrationWarning
        fallback-radius={8}
        loading
        animation='shimmer'
        reveal={0.12}
        loading-label='Loading top GAUL list'
      >
        <div className='h-[260px] rounded-xl border border-(--border) bg-(--surface)' />
      </phantom-ui>
    ),
  },
);


const AnalyticsSkeleton = dynamic(
  () => import('./components/analytics/AnalyticsSkeleton'),
  { ssr: false },
);

const PRESET_OPTIONS = [
  { key: 'today', label: 'Hari Ini' },
  { key: '7d', label: '7 Hari' },
  { key: '30d', label: '30 Hari' },
  { key: 'month', label: 'Bulan Ini' },
] as const;

const JENIS_TIKET_OPTIONS = [
  { key: 'all', label: 'Semua' },
  ...JENIS_TIKET_LIST.map((j) => ({ key: j.key, label: j.label })),
];

const INSERA_STATUS_OPTIONS = [
  { key: 'all', label: 'Semua Status' },
  ...OPEN_STATUS_VALUES.map((s) => ({ key: s, label: s })),
  ...CLOSE_STATUS_VALUES.map((s) => ({ key: s, label: s })),
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
  const [jenisTicket1Filter, setJenisTicket1Filter] = useState<string>('all');
  const [ticketStatusFilter, setTicketStatusFilter] = useState<string>('all');
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: startOfDay(
      new Date(new Date().getFullYear(), new Date().getMonth(), 1),
    ),
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

  // --- V2 analytics filters ---
  const analyticsFilters: SemestaAnalyticsV2Filters = useMemo(
    () => ({
      startDate,
      endDate,
      workzone: workzoneFilter || undefined,
      ticketType: jenisTicket1Filter !== 'all' ? jenisTicket1Filter : undefined,
    }),
    [startDate, endDate, workzoneFilter, jenisTicket1Filter],
  );

  // --- Ticket table ---
  const {
    tickets,
    loading: ticketsLoading,
    isRefreshing: ticketsRefreshing,
    pagination,
  } = useSemestaTickets(
    searchQuery,
    currentPage,
    workzoneFilter || undefined,
    ticketStatusFilter !== 'all' ? ticketStatusFilter : undefined,
    jenisTicket1Filter !== 'all' ? jenisTicket1Filter : undefined,
    startDate,
    endDate,
  );

  // --- V2 analytics hook ---
  const { data: analyticsV2, loading: analyticsV2Loading } =
    useSemestaAnalyticsV2(analyticsFilters);

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
        tableRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        });
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

  const handleJenisTicket1Change = (jenis: string) => {
    setJenisTicket1Filter(jenis);
    setCurrentPage(1);
  };

  const handleTicketStatusChange = (status: string) => {
    setTicketStatusFilter(status);
    setCurrentPage(1);
  };

  const handlePreset = (presetKey: 'today' | '7d' | '30d' | 'month') => {
    const now = new Date();
    let newDateRange: DateRange | undefined;

    if (presetKey === 'today') {
      newDateRange = { from: startOfDay(now), to: endOfDay(now) };
    } else if (presetKey === '7d') {
      newDateRange = { from: startOfDay(subDays(now, 6)), to: endOfDay(now) };
    } else if (presetKey === '30d') {
      newDateRange = { from: startOfDay(subDays(now, 29)), to: endOfDay(now) };
    } else if (presetKey === 'month') {
      newDateRange = {
        from: startOfDay(new Date(now.getFullYear(), now.getMonth(), 1)),
        to: endOfDay(now),
      };
    }

    setDateRange(newDateRange);
    setCurrentPage(1);
  };

  const resetAllFilters = () => {
    setSearchQuery('');
    setWorkzoneFilter('');
    setJenisTicket1Filter('all');
    setTicketStatusFilter('all');
    setDateRange({
      // Reset to default: start of this month to today
      from: startOfDay(
        new Date(new Date().getFullYear(), new Date().getMonth(), 1),
      ),
      to: endOfDay(new Date()),
    });
    setCurrentPage(1);
  };

  const activeFilterCount =
    (jenisTicket1Filter !== 'all' ? 1 : 0) +
    (ticketStatusFilter !== 'all' ? 1 : 0) +
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
      return 'Hari Ini';
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
      <div className='font-dm-sans flex flex-col gap-8 text-[13px] leading-5'>
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
              <div className='grid gap-3 sm:grid-cols-3 lg:min-w-90'>
                <div className='rounded-2xl border border-(--border) bg-(--surface) px-4 py-3'>
                  <p className='text-[10px] font-bold tracking-[0.18em] text-(--text-muted) uppercase'>
                    Scope
                  </p>
                  <p className='mt-1 text-sm font-semibold text-(--text-primary)'>
                    {workzoneFilter
                      ? `Workzone ${workzoneFilter}`
                      : 'All Workzone'}
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
                className='bg-surface font-dm-sans flex items-center gap-2 rounded-xl border border-(--border) px-3 py-2 text-sm font-semibold text-(--text-secondary) transition hover:border-blue-400/40 hover:text-blue-400'
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
                  className='font-dm-sans flex items-center gap-1 text-xs font-semibold text-red-400 hover:text-red-500'
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
                <div className='flex flex-1 items-center gap-2'>
                  <span className='font-outfit shrink-0 text-[10px] font-bold tracking-[1.2px] text-(--text-secondary) uppercase'>
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

                {/* Filters */}
                <div className='flex flex-wrap items-center gap-3'>
                  <Dropdown
                    label='Jenis'
                    value={jenisTicket1Filter}
                    options={JENIS_TIKET_OPTIONS}
                    onChange={handleJenisTicket1Change}
                  />

                  <Dropdown
                    label='Status'
                    value={ticketStatusFilter}
                    options={INSERA_STATUS_OPTIONS}
                    onChange={handleTicketStatusChange}
                  />
                </div>

                {activeFilterCount > 0 && (
                  <button
                    onClick={resetAllFilters}
                    className={cn(
                      'font-dm-sans flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-semibold text-red-400 transition hover:bg-red-400/10',
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
                    KPI mix, ticket trend, and workzone load from the current
                    filter scope.
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
              <TopGaulList
                data={analyticsV2.topGaulServices}
                loading={false}
              />
            </div>
          </div>
        ) : null}

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
                    The list below follows the same filter scope as the
                    analytics above.
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
                  search: searchQuery.trim() || undefined,
                  workzone: workzoneFilter || undefined,
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
