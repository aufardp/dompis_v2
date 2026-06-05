'use client';

import { useCallback, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import clsx from 'clsx';
import { format } from 'date-fns';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import AdminLayout from '@/app/components/layout/AdminLayout';
import { useDailyTicketPage } from '@/app/hooks/useDailyTicketPage';
import { queryKeys } from '@/app/libs/query-keys';
import { fetchWithAuth } from '@/app/libs/fetcher';
import type { DateRange } from 'react-day-picker';
import DateRangePicker from '@/app/admin/semesta/components/filters/DateRangePicker';
import TicketTable from './TicketTable';
import TicketTableB2B from './TicketTableB2B';
import TicketTableTabs from './TicketTableTabs';
import { FilterBarB2B } from './filterbarb2b';
import { FilterBarB2C } from './filterbarb2c';
import B2CSection from './B2CSection';

const AssignTechnicianModal = dynamic(
  () => import('@/app/admin/components/dashboard/assign/AssignTechnicianModal'),
  { ssr: false, loading: () => null },
);

type AssignResult = {
  technicianId: number | null;
  technicianName: string | null;
};

type TicketData = {
  idTicket: number;
  ticketCode?: string;
  workzone?: string | null;
  technicianName?: string | null;
  teknisiUserId?: number;
};

type TicketTypeBreakdown = {
  key: string;
  label: string;
  total?: number;
  open?: number;
  assigned?: number;
  close?: number;
};

type FlaggingCounts = {
  ffgCount?: number;
  gamasCount?: number;
  p1Count?: number;
  pPlusCount?: number;
};

type BucketPageProps = {
  title: string;
  description: string;
  icon: string;
  tone: 'blue' | 'emerald' | 'amber' | 'slate' | 'purple';
  operationalBucket?: string[];
  regulerOnly?: boolean;
  anomalyBucket?: string[];
  showDateFilter?: boolean;
  extraWorkboard?: {
    title: string;
    description: string;
    tableLabel: string;
    symptom: string;
    dept?: 'all' | 'b2b' | 'b2c';
  };
};

function patchTicketAssignmentInCache(
  previous: any,
  ticketId: number,
  assignment: AssignResult,
) {
  const matchesTicket = (value: unknown) =>
    String(value ?? '') === String(ticketId);
  const patchTicket = (ticket: any) =>
    matchesTicket(ticket?.idTicket) || matchesTicket(ticket?.id_ticket)
      ? {
          ...ticket,
          teknisiUserId: assignment.technicianId,
          teknisi_user_id: assignment.technicianId,
          technicianName: assignment.technicianName,
          technician_name: assignment.technicianName,
          users: ticket?.users
            ? { ...ticket.users, nama: assignment.technicianName }
            : ticket?.users,
        }
      : ticket;

  if (Array.isArray(previous)) return previous.map(patchTicket);
  if (!previous || typeof previous !== 'object') return previous;

  const next = { ...previous };
  if (matchesTicket(next.idTicket) || matchesTicket(next.id_ticket)) {
    next.teknisiUserId = assignment.technicianId;
    next.teknisi_user_id = assignment.technicianId;
    next.technicianName = assignment.technicianName;
    next.technician_name = assignment.technicianName;
    if (next.users)
      next.users = { ...next.users, nama: assignment.technicianName };
  }
  if (Array.isArray(next.data)) next.data = next.data.map(patchTicket);
  if (Array.isArray(next.tickets)) next.tickets = next.tickets.map(patchTicket);
  if (Array.isArray(next.validasiTickets))
    next.validasiTickets = next.validasiTickets.map(patchTicket);
  return next;
}

const TONE_CLASSES: Record<BucketPageProps['tone'], string> = {
  blue: 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300',
  emerald:
    'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300',
  amber: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300',
  slate: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  purple:
    'bg-purple-50 text-purple-700 dark:bg-purple-500/10 dark:text-purple-300',
};

function FlaggingSummaryRow({
  counts,
  compact = false,
}: {
  counts: FlaggingCounts;
  compact?: boolean;
}) {
  const items = [
    ['P1', counts.p1Count, 'text-red-600 dark:text-red-300'],
    ['P+', counts.pPlusCount, 'text-amber-600 dark:text-amber-300'],
    ['FFG', counts.ffgCount, 'text-violet-600 dark:text-violet-300'],
    ['GAMAS', counts.gamasCount, 'text-sky-600 dark:text-sky-300'],
  ] as const;

  return (
    <div
      className={clsx(
        'grid gap-2',
        compact ? 'grid-cols-4' : 'grid-cols-2 sm:grid-cols-4',
      )}
    >
      {items.map(([label, value, color]) => (
        <div
          key={label}
          className='rounded-lg border border-slate-100 bg-slate-50 px-2 py-2 text-center dark:border-slate-800 dark:bg-slate-900'
        >
          <p className='text-[9px] font-bold tracking-[1px] text-slate-400 uppercase dark:text-slate-500'>
            {label}
          </p>
          <p className={clsx('mt-0.5 text-sm font-black', color)}>
            {Number(value ?? 0).toLocaleString('id-ID')}
          </p>
        </div>
      ))}
    </div>
  );
}

function TicketTypeBreakdownStrip({
  title,
  items,
  activeKeys,
}: {
  title: string;
  items: TicketTypeBreakdown[];
  activeKeys: string[];
}) {
  const visibleItems = items.filter((item) => Number(item.total ?? 0) > 0);

  return (
    <div className='rounded-xl border border-slate-100 bg-white p-3 shadow-xs dark:border-slate-800/80 dark:bg-slate-950'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <p className='text-[11px] font-bold tracking-[1.3px] text-slate-400 uppercase dark:text-slate-500'>
          {title}
        </p>
        <span className='text-[11px] font-semibold text-slate-400'>
          {visibleItems.length} jenis
        </span>
      </div>

      {visibleItems.length > 0 ? (
        <div className='mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3'>
          {visibleItems.map((item) => {
            const active = activeKeys.includes(item.key);
            return (
              <div
                key={item.key}
                className={clsx(
                  'rounded-lg border px-3 py-2 transition-colors',
                  active
                    ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-500/40 dark:bg-emerald-500/10'
                    : 'border-slate-100 bg-slate-50 dark:border-slate-800 dark:bg-slate-900',
                )}
              >
                <div className='flex items-start justify-between gap-3'>
                  <p className='min-w-0 truncate text-xs font-black text-slate-800 dark:text-slate-100'>
                    {item.label}
                  </p>
                  <span className='shrink-0 text-sm font-black text-slate-900 dark:text-slate-100'>
                    {Number(item.total ?? 0).toLocaleString('id-ID')}
                  </span>
                </div>
                <div className='mt-2 grid grid-cols-3 gap-1 text-center'>
                  {[
                    ['Open', item.open],
                    ['Assigned', item.assigned],
                    ['Close', item.close],
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      className='rounded bg-white px-1.5 py-1 dark:bg-slate-950'
                    >
                      <p className='text-[9px] font-bold tracking-[0.8px] text-slate-400 uppercase'>
                        {label}
                      </p>
                      <p className='text-xs font-black text-slate-700 dark:text-slate-200'>
                        {Number(value ?? 0).toLocaleString('id-ID')}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className='mt-2 text-xs font-semibold text-slate-400'>
          Belum ada jenis_tiket_2 untuk kombinasi filter ini.
        </p>
      )}
    </div>
  );
}

export default function TicketManagementBucketPage({
  title,
  description,
  icon,
  tone,
  operationalBucket = [],
  regulerOnly,
  anomalyBucket = [],
  showDateFilter,
  extraWorkboard,
}: BucketPageProps) {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [workzoneFilter, setWorkzoneFilter] = useState('');
  const [dateRange, setDateRange] = useState<DateRange>();
  const [deptView, setDeptView] = useState<'all' | 'b2b' | 'b2c'>('all');
  const [extraWorkboardPage, setExtraWorkboardPage] = useState(1);
  const [b2cPage, setB2cPage] = useState(1);
  const [b2bPage, setB2bPage] = useState(1);
  const [b2cValidasiPage, setB2cValidasiPage] = useState(1);
  const [b2bValidasiPage, setB2bValidasiPage] = useState(1);
  const [b2cTicketTypeFilter, setB2cTicketTypeFilter] = useState<string[]>([]);
  const [b2cHasilVisitFilter, setB2cHasilVisitFilter] = useState<string[]>([]);
  const [b2cTicketStatusFilter, setB2cTicketStatusFilter] = useState<string[]>(
    [],
  );
  const [b2cFlaggingFilter, setB2cFlaggingFilter] = useState<string[]>([]);
  const [b2bTicketTypeFilter, setB2bTicketTypeFilter] = useState<string[]>([]);
  const [b2bHasilVisitFilter, setB2bHasilVisitFilter] = useState<string[]>([]);
  const [b2bTicketStatusFilter, setB2bTicketStatusFilter] = useState<string[]>(
    [],
  );
  const [b2bFlaggingFilter, setB2bFlaggingFilter] = useState<string[]>([]);
  const [assignModalTicket, setAssignModalTicket] = useState<TicketData | null>(
    null,
  );
  const [b2cActiveType, setB2cActiveType] = useState<
    'all' | 'REGULER' | 'HVC_GOLD' | 'HVC_PLATINUM' | 'HVC_DIAMOND'
  >('all');

  const b2cBreakdownKey = [
    'b2c-breakdown',
    operationalBucket?.join(','),
    workzoneFilter,
  ];
  const { data: b2cBreakdownData } = useQuery({
    queryKey: b2cBreakdownKey,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (workzoneFilter) params.set('workzone', workzoneFilter);
      if (operationalBucket?.length) params.set('bucket', operationalBucket[0]);
      const url = `/api/dashboard/b2c-breakdown?${params.toString()}`;
      const res = await fetchWithAuth(url);
      if (!res) throw new Error('No response');
      const json = await res.json();
      if (!json?.success) throw new Error(json?.message || 'Failed');
      return json.data;
    },
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const startDateStr = dateRange?.from
    ? format(dateRange.from, 'yyyy-MM-dd')
    : undefined;
  const endDateStr = dateRange?.to
    ? format(dateRange.to, 'yyyy-MM-dd')
    : undefined;

  const sharedFilters = {
    search: searchQuery,
    workzone: workzoneFilter || undefined,
    operationalBucket,
    regulerOnly,
    anomalyBucket,
    excludeSymptom: extraWorkboard?.symptom,
    includeValidasi: true,
    startDate: startDateStr,
    endDate: endDateStr,
  } as const;

  const b2cPageData = useDailyTicketPage({
    ...sharedFilters,
    dept: 'b2c',
    ticketType: b2cTicketTypeFilter,
    statusUpdate: b2cHasilVisitFilter,
    ticketStatus: b2cTicketStatusFilter,
    flagging: b2cFlaggingFilter,
    page: b2cPage,
    limit: 10,
    validasiPage: b2cValidasiPage,
    enabled: deptView !== 'b2b',
  });

  const b2bPageData = useDailyTicketPage({
    ...sharedFilters,
    dept: 'b2b',
    ticketType: b2bTicketTypeFilter,
    statusUpdate: b2bHasilVisitFilter,
    ticketStatus: b2bTicketStatusFilter,
    flagging: b2bFlaggingFilter,
    page: b2bPage,
    limit: 10,
    validasiPage: b2bValidasiPage,
    enabled: deptView !== 'b2c',
  });

  const extraWorkboardPageData = useDailyTicketPage({
    search: '',
    symptom: extraWorkboard?.symptom,
    workzone: workzoneFilter || undefined,
    dept: extraWorkboard?.dept ?? 'all',
    operationalBucket,
    regulerOnly,
    anomalyBucket,
    includeValidasi: false,
    startDate: startDateStr,
    endDate: endDateStr,
    page: extraWorkboardPage,
    limit: 10,
    enabled: Boolean(extraWorkboard),
  });

  const totals = useMemo(() => {
    const b2c = b2cPageData.summary;
    const b2b = b2bPageData.summary;
    const extra = extraWorkboardPageData.summary;
    return {
      total: (b2c.total ?? 0) + (b2b.total ?? 0) + (extra.total ?? 0),
      open: (b2c.open ?? 0) + (b2b.open ?? 0) + (extra.open ?? 0),
      assigned:
        (b2c.assigned ?? 0) + (b2b.assigned ?? 0) + (extra.assigned ?? 0),
      close: (b2c.close ?? 0) + (b2b.close ?? 0) + (extra.close ?? 0),
      ffgCount:
        (b2c.ffgCount ?? 0) + (b2b.ffgCount ?? 0) + (extra.ffgCount ?? 0),
      gamasCount:
        (b2c.gamasCount ?? 0) + (b2b.gamasCount ?? 0) + (extra.gamasCount ?? 0),
      p1Count: (b2c.p1Count ?? 0) + (b2b.p1Count ?? 0) + (extra.p1Count ?? 0),
      pPlusCount:
        (b2c.pPlusCount ?? 0) + (b2b.pPlusCount ?? 0) + (extra.pPlusCount ?? 0),
    };
  }, [
    b2bPageData.summary,
    b2cPageData.summary,
    extraWorkboardPageData.summary,
  ]);

  const activeRuleBadges = useMemo(() => {
    const badges: string[] = [];
    if (operationalBucket.includes('kpi_customer'))
      badges.push('Source CUSTOMER');
    if (operationalBucket.includes('kpi_proactive'))
      badges.push('Source PROACTIVE');
    if (operationalBucket.includes('non_kpi_unspec'))
      badges.push('Jenis Unspec / Non KPI');
    if (regulerOnly) badges.push('Jenis Tiket 1 = Reguler');
    if (anomalyBucket.includes('unknown')) badges.push('Unknown');
    if (anomalyBucket.includes('blank')) badges.push('Blank');
    return badges;
  }, [anomalyBucket, operationalBucket, regulerOnly]);

  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query);
    setB2bPage(1);
    setB2cPage(1);
  }, []);

  const handleWorkzoneChange = useCallback((value: string) => {
    setWorkzoneFilter(value);
    setExtraWorkboardPage(1);
    setB2bPage(1);
    setB2cPage(1);
  }, []);

  const handleB2cTicketTypeChange = useCallback((types: string[]) => {
    setB2cTicketTypeFilter(types);
    setB2cPage(1);
  }, []);

  const handleB2cHasilVisitChange = useCallback((statuses: string[]) => {
    setB2cHasilVisitFilter(statuses);
    setB2cPage(1);
  }, []);

  const handleB2cTicketStatusChange = useCallback((statuses: string[]) => {
    setB2cTicketStatusFilter(statuses);
    setB2cPage(1);
  }, []);

  const handleB2cFlaggingChange = useCallback((flags: string[]) => {
    setB2cFlaggingFilter(flags);
    setB2cPage(1);
  }, []);

  const handleB2bTicketTypeChange = useCallback((types: string[]) => {
    setB2bTicketTypeFilter(types);
    setB2bPage(1);
  }, []);

  const handleB2bHasilVisitChange = useCallback((statuses: string[]) => {
    setB2bHasilVisitFilter(statuses);
    setB2bPage(1);
  }, []);

  const handleB2bTicketStatusChange = useCallback((statuses: string[]) => {
    setB2bTicketStatusFilter(statuses);
    setB2bPage(1);
  }, []);

  const handleB2bFlaggingChange = useCallback((flags: string[]) => {
    setB2bFlaggingFilter(flags);
    setB2bPage(1);
  }, []);

  const invalidateQueries = useCallback(() => {
    queryClient.invalidateQueries({
      predicate: (query) =>
        Array.isArray(query.queryKey) &&
        (query.queryKey[0] === queryKeys.tickets.all[0] ||
          query.queryKey[0] === queryKeys.dashboard.all[0]),
      refetchType: 'active',
    });
  }, [queryClient]);

  const onAssign = useCallback(
    (ticketId: number | string, source: 'b2b' | 'b2c') => {
      const pageData = source === 'b2b' ? b2bPageData : b2cPageData;
      const ticket = pageData.tickets.find(
        (t) => String(t.idTicket) === String(ticketId),
      );
      setAssignModalTicket({
        idTicket: Number(ticketId),
        ticketCode: ticket?.ticket,
        workzone: ticket?.workzone ?? null,
        technicianName: ticket?.technicianName ?? null,
        teknisiUserId: ticket?.teknisiUserId ?? undefined,
      });
    },
    [b2bPageData, b2cPageData],
  );

  const onExtraAssign = useCallback(
    (ticketId: number | string) => {
      const ticket = extraWorkboardPageData.tickets.find(
        (t) => String(t.idTicket) === String(ticketId),
      );
      setAssignModalTicket({
        idTicket: Number(ticketId),
        ticketCode: ticket?.ticket,
        workzone: ticket?.workzone ?? null,
        technicianName: ticket?.technicianName ?? null,
        teknisiUserId: ticket?.teknisiUserId ?? undefined,
      });
    },
    [extraWorkboardPageData.tickets],
  );

  return (
    <>
      <AdminLayout
        onSearch={handleSearch}
        onWorkzoneChange={handleWorkzoneChange}
        selectedWorkzone={workzoneFilter}
      >
        <div className='space-y-5'>
          <div className='overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950'>
            <div className='bg-[radial-gradient(circle_at_top_left,rgba(15,23,42,0.04),transparent_40%),radial-gradient(circle_at_top_right,rgba(59,130,246,0.08),transparent_30%)] p-5 dark:bg-[radial-gradient(circle_at_top_left,rgba(148,163,184,0.08),transparent_35%),radial-gradient(circle_at_top_right,rgba(59,130,246,0.12),transparent_25%)]'>
              <div className='flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between'>
                <div className='flex items-start gap-4'>
                  <div
                    className={clsx(
                      'grid h-12 w-12 place-items-center rounded-2xl text-xl',
                      TONE_CLASSES[tone],
                    )}
                  >
                    {icon}
                  </div>
                  <div className='min-w-0 flex-1'>
                    <p className='text-xs font-bold tracking-[1.5px] text-slate-400 uppercase dark:text-slate-500'>
                      Ticket Management
                    </p>
                    <h1 className='mt-1 text-2xl font-black text-slate-900 dark:text-slate-100'>
                      {title}
                    </h1>
                    <p className='mt-2 max-w-3xl text-sm text-slate-500 dark:text-slate-400'>
                      {description}
                    </p>
                    <div className='mt-3 flex flex-wrap gap-2'>
                      {activeRuleBadges.map((badge) => (
                        <span
                          key={badge}
                          className='rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-[11px] font-bold tracking-[1px] text-slate-600 uppercase backdrop-blur dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-300'
                        >
                          {badge}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                {showDateFilter && (
                  <DateRangePicker
                    value={dateRange}
                    onChange={(range) => {
                      setDateRange(range);
                      setB2cPage(1);
                      setB2bPage(1);
                    }}
                    onClear={() => {
                      setDateRange(undefined);
                      setB2cPage(1);
                      setB2bPage(1);
                    }}
                    className='mt-4 lg:mt-0'
                  />
                )}

                <div className='grid grid-cols-2 gap-3 lg:min-w-[320px] lg:grid-cols-4'>
                  {[
                    ['Total', totals.total],
                    ['Open', totals.open],
                    ['Assigned', totals.assigned],
                    ['Close', totals.close],
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      className='rounded-2xl border border-slate-200 bg-white/85 p-3 text-center dark:border-slate-800 dark:bg-slate-900/80'
                    >
                      <p className='text-[11px] font-bold tracking-[1.3px] text-slate-400 uppercase dark:text-slate-500'>
                        {label}
                      </p>
                      <p className='mt-1 text-xl font-black text-slate-900 dark:text-slate-100'>
                        {value}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <div className='mt-4 rounded-2xl border border-slate-200 bg-white/85 p-3 dark:border-slate-800 dark:bg-slate-900/80'>
                <p className='mb-2 text-[11px] font-bold tracking-[1.3px] text-slate-400 uppercase dark:text-slate-500'>
                  Flagging Summary
                </p>
                <FlaggingSummaryRow counts={totals} />
              </div>
            </div>

            <div
              className={clsx(
                'grid gap-px border-t border-slate-200 bg-slate-200 dark:border-slate-800 dark:bg-slate-800',
                extraWorkboard ? 'md:grid-cols-3' : 'md:grid-cols-2',
              )}
            >
              {extraWorkboard && (
                <div className='bg-white p-4 dark:bg-slate-950'>
                  <p className='text-[11px] font-bold tracking-[1.3px] text-slate-400 uppercase dark:text-slate-500'>
                    {extraWorkboard.tableLabel} Split
                  </p>
                  <div className='mt-3 grid grid-cols-4 gap-2 text-center'>
                    {[
                      ['Total', extraWorkboardPageData.summary.total],
                      ['Open', extraWorkboardPageData.summary.open],
                      ['Assigned', extraWorkboardPageData.summary.assigned],
                      ['Close', extraWorkboardPageData.summary.close],
                    ].map(([label, value]) => (
                      <div
                        key={label}
                        className='rounded-2xl bg-slate-50 px-2 py-3 dark:bg-slate-900'
                      >
                        <p className='text-[10px] font-bold tracking-[1px] text-slate-400 uppercase dark:text-slate-500'>
                          {label}
                        </p>
                        <p className='mt-1 text-lg font-black text-slate-900 dark:text-slate-100'>
                          {value}
                        </p>
                      </div>
                    ))}
                  </div>
                  <div className='mt-3'>
                    <FlaggingSummaryRow
                      counts={extraWorkboardPageData.summary}
                      compact
                    />
                  </div>
                </div>
              )}

              <div className='bg-white p-4 dark:bg-slate-950'>
                <p className='text-[11px] font-bold tracking-[1.3px] text-slate-400 uppercase dark:text-slate-500'>
                  B2C Split
                </p>
                <div className='mt-3 grid grid-cols-4 gap-2 text-center'>
                  {[
                    ['Total', b2cPageData.summary.total],
                    ['Open', b2cPageData.summary.open],
                    ['Assigned', b2cPageData.summary.assigned],
                    ['Close', b2cPageData.summary.close],
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      className='rounded-2xl bg-slate-50 px-2 py-3 dark:bg-slate-900'
                    >
                      <p className='text-[10px] font-bold tracking-[1px] text-slate-400 uppercase dark:text-slate-500'>
                        {label}
                      </p>
                      <p className='mt-1 text-lg font-black text-slate-900 dark:text-slate-100'>
                        {value}
                      </p>
                    </div>
                  ))}
                </div>
                <div className='mt-3'>
                  <FlaggingSummaryRow counts={b2cPageData.summary} compact />
                </div>
              </div>

              <div className='bg-white p-4 dark:bg-slate-950'>
                <p className='text-[11px] font-bold tracking-[1.3px] text-slate-400 uppercase dark:text-slate-500'>
                  B2B Split
                </p>
                <div className='mt-3 grid grid-cols-4 gap-2 text-center'>
                  {[
                    ['Total', b2bPageData.summary.total],
                    ['Open', b2bPageData.summary.open],
                    ['Assigned', b2bPageData.summary.assigned],
                    ['Close', b2bPageData.summary.close],
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      className='rounded-2xl bg-slate-50 px-2 py-3 dark:bg-slate-900'
                    >
                      <p className='text-[10px] font-bold tracking-[1px] text-slate-400 uppercase dark:text-slate-500'>
                        {label}
                      </p>
                      <p className='mt-1 text-lg font-black text-slate-900 dark:text-slate-100'>
                        {value}
                      </p>
                    </div>
                  ))}
                </div>
                <div className='mt-3'>
                  <FlaggingSummaryRow counts={b2bPageData.summary} compact />
                </div>
              </div>
            </div>

            <div className='border-t border-slate-200 p-5 dark:border-slate-800'>
              <div className='flex flex-wrap gap-2'>
                {[
                  ['all', 'All'],
                  ['b2c', 'B2C'],
                  ['b2b', 'B2B'],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type='button'
                    onClick={() => setDeptView(value as 'all' | 'b2b' | 'b2c')}
                    className={clsx(
                      'rounded-full px-3 py-1.5 text-xs font-bold tracking-[1px] uppercase transition-colors',
                      deptView === value
                        ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700',
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {extraWorkboard && deptView !== 'b2b' && (
            <div className='space-y-3'>
              <div className='flex items-center justify-between'>
                <h2 className='text-lg font-black text-slate-900 dark:text-slate-100'>
                  {extraWorkboard.title}
                </h2>
                <span className='rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300'>
                  {extraWorkboardPageData.pagination.total} ticket
                </span>
              </div>
              <p className='text-sm text-slate-500 dark:text-slate-400'>
                {extraWorkboard.description}
              </p>
              <TicketTable
                tickets={extraWorkboardPageData.tickets}
                tableLabel={extraWorkboard.tableLabel}
                tableSummary={extraWorkboardPageData.summary}
                loading={extraWorkboardPageData.loading}
                isRefreshing={extraWorkboardPageData.isRefreshing}
                onAssign={onExtraAssign}
                pagination={{
                  currentPage: extraWorkboardPageData.pagination.currentPage,
                  totalPages: extraWorkboardPageData.pagination.totalPages,
                  total: extraWorkboardPageData.pagination.total,
                  limit: extraWorkboardPageData.pagination.limit,
                  onPageChange: setExtraWorkboardPage,
                }}
                downloadFilters={{
                  dept: extraWorkboard?.dept ?? 'all',
                  operationalBucket,
                  regulerOnly,
                  anomalyBucket,
                }}
              />
            </div>
          )}

          {deptView !== 'b2b' && (
            <div className='space-y-3'>
              <div className='flex items-center justify-between'>
                <h2 className='text-lg font-black text-slate-900 dark:text-slate-100'>
                  B2C Workboard
                </h2>
                <span className='rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300'>
                  {b2cPageData.pagination.total} ticket
                </span>
              </div>

              {b2cBreakdownData && (
                <div className='rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950'>
                  <B2CSection
                    data={b2cBreakdownData}
                    activeType={b2cActiveType}
                    onSelectType={(type) =>
                      setB2cActiveType(type as typeof b2cActiveType)
                    }
                    isDailyScope
                  />
                </div>
              )}

              <FilterBarB2C
                ticketType={b2cTicketTypeFilter}
                ticketTypeOptions={b2cPageData.ticketTypeOptions}
                statusUpdate={b2cHasilVisitFilter}
                ticketStatus={b2cTicketStatusFilter}
                ticketStatusOptions={b2cPageData.statusOptions}
                flagging={b2cFlaggingFilter}
                onTypeChange={handleB2cTicketTypeChange}
                onStatusChange={handleB2cHasilVisitChange}
                onTicketStatusChange={handleB2cTicketStatusChange}
                onFlaggingChange={handleB2cFlaggingChange}
              />
              {/* <FlaggingSummaryRow counts={b2cPageData.summary} /> */}
              <TicketTypeBreakdownStrip
                title='Perhitungan jenis tiket B2C'
                items={b2cPageData.ticketTypeOptions}
                activeKeys={b2cTicketTypeFilter}
              />
              <TicketTableTabs
                section='b2c'
                accentColor='#10b981'
                mainTable={
                  <TicketTable
                    tickets={b2cPageData.tickets}
                    tableSummary={b2cPageData.summary}
                    loading={b2cPageData.loading}
                    isRefreshing={b2cPageData.isRefreshing}
                    onAssign={(ticketId) => onAssign(ticketId, 'b2c')}
                    pagination={{
                      currentPage: b2cPageData.pagination.currentPage,
                      totalPages: b2cPageData.pagination.totalPages,
                      total: b2cPageData.pagination.total,
                      limit: b2cPageData.pagination.limit,
                      onPageChange: setB2cPage,
                    }}
                    downloadFilters={{
                      dept: 'b2c',
                      ticketType: b2cTicketTypeFilter,
                      statusUpdate: b2cHasilVisitFilter,
                      ticketStatus: b2cTicketStatusFilter,
                      flagging: b2cFlaggingFilter,
                      operationalBucket,
                      regulerOnly,
                      anomalyBucket,
                      excludeSymptom: extraWorkboard?.symptom,
                    }}
                  />
                }
                tickets={b2cPageData.tickets}
                validasiTickets={b2cPageData.validasiTickets}
                totalCount={b2cPageData.pagination.total}
                validasiTotalCount={b2cPageData.validasiCount}
                validasiPagination={{
                  currentPage: b2cPageData.validasiPagination.currentPage,
                  totalPages: b2cPageData.validasiPagination.totalPages,
                  total: b2cPageData.validasiPagination.total,
                  limit: b2cPageData.validasiPagination.limit,
                  onPageChange: setB2cValidasiPage,
                }}
                loading={b2cPageData.loading}
                isRefreshing={b2cPageData.isRefreshing}
                onAssign={(ticketId) => onAssign(ticketId, 'b2c')}
              />
            </div>
          )}

          {deptView !== 'b2c' && (
            <div className='space-y-3'>
              <div className='flex items-center justify-between'>
                <h2 className='text-lg font-black text-slate-900 dark:text-slate-100'>
                  B2B Workboard
                </h2>
                <span className='rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300'>
                  {b2bPageData.pagination.total} ticket
                </span>
              </div>
              <FilterBarB2B
                ticketType={b2bTicketTypeFilter}
                ticketTypeOptions={b2bPageData.ticketTypeOptions}
                statusUpdate={b2bHasilVisitFilter}
                ticketStatus={b2bTicketStatusFilter}
                ticketStatusOptions={b2bPageData.statusOptions}
                flagging={b2bFlaggingFilter}
                onTypeChange={handleB2bTicketTypeChange}
                onStatusChange={handleB2bHasilVisitChange}
                onTicketStatusChange={handleB2bTicketStatusChange}
                onFlaggingChange={handleB2bFlaggingChange}
              />
              <FlaggingSummaryRow counts={b2bPageData.summary} />
              <TicketTypeBreakdownStrip
                title='Perhitungan jenis tiket B2B'
                items={b2bPageData.ticketTypeOptions}
                activeKeys={b2bTicketTypeFilter}
              />
              <TicketTableTabs
                section='b2b'
                accentColor='#3b82f6'
                mainTable={
                  <TicketTableB2B
                    tickets={b2bPageData.tickets}
                    tableSummary={b2bPageData.summary}
                    loading={b2bPageData.loading}
                    isRefreshing={b2bPageData.isRefreshing}
                    onAssign={(ticketId) => onAssign(ticketId, 'b2b')}
                    pagination={{
                      currentPage: b2bPageData.pagination.currentPage,
                      totalPages: b2bPageData.pagination.totalPages,
                      total: b2bPageData.pagination.total,
                      limit: b2bPageData.pagination.limit,
                      onPageChange: setB2bPage,
                    }}
                    downloadFilters={{
                      dept: 'b2b',
                      ticketType: b2bTicketTypeFilter,
                      statusUpdate: b2bHasilVisitFilter,
                      ticketStatus: b2bTicketStatusFilter,
                      flagging: b2bFlaggingFilter,
                      operationalBucket,
                      regulerOnly,
                      anomalyBucket,
                      excludeSymptom: extraWorkboard?.symptom,
                    }}
                  />
                }
                tickets={b2bPageData.tickets}
                validasiTickets={b2bPageData.validasiTickets}
                totalCount={b2bPageData.pagination.total}
                validasiTotalCount={b2bPageData.validasiCount}
                validasiPagination={{
                  currentPage: b2bPageData.validasiPagination.currentPage,
                  totalPages: b2bPageData.validasiPagination.totalPages,
                  total: b2bPageData.validasiPagination.total,
                  limit: b2bPageData.validasiPagination.limit,
                  onPageChange: setB2bValidasiPage,
                }}
                loading={b2bPageData.loading}
                isRefreshing={b2bPageData.isRefreshing}
                onAssign={(ticketId) => onAssign(ticketId, 'b2b')}
              />
            </div>
          )}
        </div>
      </AdminLayout>

      {assignModalTicket && (
        <AssignTechnicianModal
          ticketId={assignModalTicket.idTicket}
          ticketCode={assignModalTicket.ticketCode}
          ticketWorkzone={assignModalTicket.workzone}
          currentTechnicianId={assignModalTicket.teknisiUserId}
          currentTechnicianName={assignModalTicket.technicianName}
          isOpen
          onClose={() => setAssignModalTicket(null)}
          onAssign={async (assignment) => {
            await new Promise((resolve) => setTimeout(resolve, 300));
            if (assignment) {
              queryClient.setQueriesData(
                {
                  predicate: (query) =>
                    Array.isArray(query.queryKey) &&
                    query.queryKey[0] === queryKeys.tickets.all[0],
                },
                (previous) =>
                  patchTicketAssignmentInCache(
                    previous,
                    assignModalTicket.idTicket,
                    assignment,
                  ),
              );
            }
            setAssignModalTicket(null);
            invalidateQueries();
          }}
        />
      )}
    </>
  );
}
