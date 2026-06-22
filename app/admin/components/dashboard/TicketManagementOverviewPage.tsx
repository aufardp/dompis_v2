'use client';

import Link from 'next/link';
import clsx from 'clsx';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import AdminLayout from '@/app/components/layout/AdminLayout';
import { useTicketManagementOverview } from '@/app/hooks/useTicketManagementOverview';
import { useTechnicianTickets } from '@/app/hooks/useTechnicianTickets';
import { useSyncStatus } from '@/app/hooks/useSyncStatus';
import { useOperationsSummary } from '@/app/hooks/useOperationsSummary';
import { useTicketEvents } from '@/app/hooks/useTicketEvents';
import { queryKeys } from '@/app/libs/query-keys';
import {
  TICKET_MANAGEMENT_BUCKET_ITEMS,
  TICKET_MANAGEMENT_OVERVIEW_ITEMS,
} from '@/app/config/ticket-management-nav';
import AssignTechnicianModal from './assign/AssignTechnicianModal';
import HourlyChart from './HourlyChart';
import SymptomChart from './SymptomChart';
import TechnicianSummaryTable from '@/app/admin/components/technician/TechnicianSummaryTable';

const BUCKET_OPTIONS = [
  { value: 'all', label: 'All' },
  ...TICKET_MANAGEMENT_BUCKET_ITEMS.map((item) => ({
    value: item.key,
    label: item.label,
  })),
];

const CARD_TONES: Record<string, string> = {
  overview:
    'bg-sky-50 border-sky-200 text-sky-900 dark:bg-sky-500/10 dark:border-sky-500/20 dark:text-sky-100',
  'kpi-customer':
    'bg-blue-50 border-blue-200 text-blue-900 dark:bg-blue-500/10 dark:border-blue-500/20 dark:text-blue-100',
  'kpi-proactive':
    'bg-emerald-50 border-emerald-200 text-emerald-900 dark:bg-emerald-500/10 dark:border-emerald-500/20 dark:text-emerald-100',
  'non-kpi-unspec':
    'bg-amber-50 border-amber-200 text-amber-900 dark:bg-amber-500/10 dark:border-amber-500/20 dark:text-amber-100',
  'non-technical':
    'bg-purple-50 border-purple-200 text-purple-900 dark:bg-purple-500/10 dark:border-purple-500/20 dark:text-purple-100',
  'sqm-update':
    'bg-violet-50 border-violet-200 text-violet-900 dark:bg-violet-500/10 dark:border-violet-500/20 dark:text-violet-100',
  obsolete:
    'bg-rose-50 border-rose-200 text-rose-900 dark:bg-rose-500/10 dark:border-rose-500/20 dark:text-rose-100',
};

type FlaggingCounts = {
  p1Count?: number;
  pPlusCount?: number;
  ffgCount?: number;
  gamasCount?: number;
};

type HeroTone = 'blue' | 'emerald' | 'amber' | 'slate' | 'violet' | 'red';

type PriorityItem = {
  key: string;
  label: string;
  count: number;
  sub: string;
};

type BucketSummaryLike = {
  total: number;
  open: number;
  assigned: number;
  close: number;
  p1Count?: number;
  pPlusCount?: number;
  ffgCount?: number;
  gamasCount?: number;
};

function TechnicianSummaryCards({
  totalTechnicians,
  idleCount,
  assigned,
  onProgress,
  pending,
  closedToday,
}: {
  totalTechnicians: number;
  idleCount: number;
  assigned: number;
  onProgress: number;
  pending: number;
  closedToday: number;
}) {
  const activeTechnicians = Math.max(totalTechnicians - idleCount, 0);

  return (
    <div className='grid gap-2 sm:grid-cols-2 xl:grid-cols-5'>
      <div className='rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-700 dark:bg-slate-900/70'>
        <p className='text-[10px] font-bold tracking-[0.22em] text-slate-400 uppercase'>
          Total Teknisi
        </p>
        <p className='mt-2 text-2xl font-black tracking-tight text-slate-900 dark:text-slate-50'>
          {totalTechnicians.toLocaleString('id-ID')}
        </p>
        <p className='mt-1 text-xs text-slate-500 dark:text-slate-400'>
          {idleCount.toLocaleString('id-ID')} idle •{' '}
          {activeTechnicians.toLocaleString('id-ID')} aktif
        </p>
      </div>

      <div className='rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 shadow-sm dark:border-blue-500/20 dark:bg-blue-500/10'>
        <p className='text-[10px] font-bold tracking-[0.22em] text-blue-700 uppercase dark:text-blue-200'>
          Menunggu
        </p>
        <p className='mt-2 text-2xl font-black tracking-tight text-blue-700 dark:text-blue-200'>
          {assigned.toLocaleString('id-ID')}
        </p>
        <p className='mt-1 text-xs text-blue-600/80 dark:text-blue-200/70'>
          assigned
        </p>
      </div>

      <div className='rounded-2xl border border-orange-200 bg-orange-50 px-4 py-3 shadow-sm dark:border-orange-500/20 dark:bg-orange-500/10'>
        <p className='text-[10px] font-bold tracking-[0.22em] text-orange-700 uppercase dark:text-orange-200'>
          Pending
        </p>
        <p className='mt-2 text-2xl font-black tracking-tight text-orange-700 dark:text-orange-200'>
          {pending.toLocaleString('id-ID')}
        </p>
        <p className='mt-1 text-xs text-orange-600/80 dark:text-orange-200/70'>
          pending
        </p>
      </div>

      <div className='rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 shadow-sm dark:border-amber-500/20 dark:bg-amber-500/10'>
        <p className='text-[10px] font-bold tracking-[0.22em] text-amber-700 uppercase dark:text-amber-200'>
          Dikerjakan
        </p>
        <p className='mt-2 text-2xl font-black tracking-tight text-amber-700 dark:text-amber-200'>
          {onProgress.toLocaleString('id-ID')}
        </p>
        <p className='mt-1 text-xs text-amber-600/80 dark:text-amber-200/70'>
          on_progress
        </p>
      </div>

      <div className='rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 shadow-sm dark:border-emerald-500/20 dark:bg-emerald-500/10'>
        <p className='text-[10px] font-bold tracking-[0.22em] text-emerald-700 uppercase dark:text-emerald-200'>
          Selesai Hari Ini
        </p>
        <p className='mt-2 text-2xl font-black tracking-tight text-emerald-700 dark:text-emerald-200'>
          {closedToday.toLocaleString('id-ID')}
        </p>
        <p className='mt-1 text-xs text-emerald-600/80 dark:text-emerald-200/70'>
          closed
        </p>
      </div>
    </div>
  );
}

function PriorityPills({ counts }: { counts?: FlaggingCounts }) {
  const items = [
    ['Manja HI', counts?.p1Count ?? 0],
    ['Manja H+', counts?.pPlusCount ?? 0],
    ['FFG', counts?.ffgCount ?? 0],
    ['GAMAS', counts?.gamasCount ?? 0],
  ] as const;

  return (
    <div className='flex flex-wrap gap-2'>
      {items.map(([label, value]) => (
        <div
          key={label}
          className='rounded-full border border-(--border) bg-(--surface-2) px-3 py-1.5 text-xs font-semibold text-(--text-secondary)'
        >
          <span className='mr-1.5 text-[10px] font-bold tracking-[0.22em] uppercase'>
            {label}
          </span>
          <span className='font-black text-(--text-primary)'>
            {Number(value).toLocaleString('id-ID')}
          </span>
        </div>
      ))}
    </div>
  );
}

function BucketSummaryRow({
  label,
  total,
  open,
  close,
  flags,
  toneClass,
  isLoading,
}: {
  label: string;
  total: number;
  open: number;
  close: number;
  flags?: FlaggingCounts;
  toneClass: string;
  isLoading?: boolean;
}) {
  return (
    <div
      className={clsx('rounded-2xl border px-3.5 py-2.5 shadow-sm', toneClass)}
    >
      <div className='grid gap-3 md:grid-cols-[minmax(0,1.25fr)_auto_auto] md:items-center'>
        <div className='min-w-0'>
          <p className='text-[10px] font-bold tracking-[0.22em] uppercase opacity-70'>
            Bucket
          </p>
          <p className='mt-1 truncate text-[0.95rem] font-black tracking-tight'>
            {label}
          </p>
        </div>
        <div>
          <p className='text-[10px] font-bold tracking-[0.18em] uppercase opacity-70'>
            Total
          </p>
          <p className='mt-1 text-[1.4rem] font-black tracking-tight'>
            {isLoading ? '...' : total.toLocaleString('id-ID')}
          </p>
        </div>
        <div className='rounded-2xl bg-white/45 px-3 py-2 text-right shadow-sm dark:bg-black/10'>
          <p className='text-[10px] font-bold tracking-[0.18em] uppercase opacity-70'>
            Open / Close
          </p>
          <p className='mt-1 text-[0.85rem] font-black'>
            {open.toLocaleString('id-ID')} / {close.toLocaleString('id-ID')}
          </p>
        </div>
      </div>
    </div>
  );
}

function HeroMetricCard({
  label,
  value,
  helper,
  tone,
}: {
  label: string;
  value: number | string;
  helper: string;
  tone: HeroTone;
}) {
  const toneStyles: Record<HeroTone, string> = {
    blue: 'border-blue-500/15 bg-blue-500/[0.06] text-blue-700 dark:text-blue-200',
    emerald:
      'border-emerald-500/15 bg-emerald-500/[0.06] text-emerald-700 dark:text-emerald-200',
    amber:
      'border-amber-500/15 bg-amber-500/[0.06] text-amber-700 dark:text-amber-200',
    red: 'border-red-500/15 bg-red-500/[0.06] text-red-700 dark:text-red-200',
    slate:
      'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-950/30 dark:text-slate-200',
    violet:
      'border-violet-500/15 bg-violet-500/[0.06] text-violet-700 dark:text-violet-200',
  };

  return (
    <div
      className={`rounded-2xl border px-3 py-1.5 shadow-sm ${toneStyles[tone]}`}
    >
      <div className='flex items-center justify-between gap-3'>
        <div className='min-w-0'>
          <p className='truncate text-[9px] font-bold tracking-[0.22em] text-(--text-muted) uppercase'>
            {label}
          </p>
          <p className='mt-1 truncate text-[10px] text-(--text-secondary)'>
            {helper}
          </p>
        </div>
        <p className='shrink-0 text-right text-[1.15rem] leading-none font-black text-(--text-primary) md:text-[1.25rem]'>
          {typeof value === 'number' ? value.toLocaleString('id-ID') : value}
        </p>
      </div>
    </div>
  );
}

function PriorityTodayPanel({
  counts,
  items,
  mode,
  bucketLabel,
  bucketSummary,
}: {
  counts?: FlaggingCounts;
  items: PriorityItem[];
  mode: 'all' | 'bucket';
  bucketLabel?: string;
  bucketSummary?: BucketSummaryLike;
}) {
  const summary =
    mode === 'all'
      ? ([
          ['Manja HI', counts?.p1Count ?? 0],
          ['Manja H+', counts?.pPlusCount ?? 0],
          ['FFG', counts?.ffgCount ?? 0],
          ['GAMAS', counts?.gamasCount ?? 0],
        ] as const)
      : ([
          ['Manja HI', bucketSummary?.p1Count ?? 0],
          ['Manja H+', bucketSummary?.pPlusCount ?? 0],
          ['FFG', bucketSummary?.ffgCount ?? 0],
          ['GAMAS', bucketSummary?.gamasCount ?? 0],
        ] as const);

  const displayItems =
    mode === 'all'
      ? items
      : ([
          {
            key: 'p1',
            label: 'Manja HI',
            count: bucketSummary?.p1Count ?? 0,
            sub: 'bucket terpilih',
          },
          {
            key: 'pplus',
            label: 'Manja H+',
            count: bucketSummary?.pPlusCount ?? 0,
            sub: 'bucket terpilih',
          },
          {
            key: 'ffg',
            label: 'FFG',
            count: bucketSummary?.ffgCount ?? 0,
            sub: 'bucket terpilih',
          },
          {
            key: 'gamas',
            label: 'GAMAS',
            count: bucketSummary?.gamasCount ?? 0,
            sub: 'bucket terpilih',
          },
        ] satisfies PriorityItem[]);

  return (
    <div className='rounded-3xl border border-(--border) bg-(--surface) p-3 shadow-sm'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <div>
          <p className='text-[9px] font-bold tracking-[0.22em] text-(--text-secondary) uppercase'>
            {mode === 'all'
              ? 'Priority Today'
              : `Priority Today · ${bucketLabel ?? 'Bucket'}`}
          </p>
          <p className='mt-1 text-[10px] font-semibold text-(--text-primary)'>
            {mode === 'all'
              ? 'Ringkasan prioritas dan fokus harian'
              : 'Ringkasan prioritas bucket terpilih'}
          </p>
        </div>
      </div>

      <div className='mt-2.5 grid gap-2 sm:grid-cols-2 xl:grid-cols-5'>
        {displayItems.map((item) => (
          <div
            key={item.key}
            className='rounded-2xl border border-(--border) bg-(--surface-2) px-3 py-1.5'
          >
            <div className='flex items-center justify-between gap-2'>
              <p className='truncate text-[8px] font-bold tracking-[0.2em] text-(--text-secondary) uppercase'>
                {item.label}
              </p>
              <p className='shrink-0 text-right text-[1rem] leading-none font-black text-(--text-primary)'>
                {item.count.toLocaleString('id-ID')}
              </p>
            </div>
            <p className='mt-1 text-[8px] text-(--text-muted)'>{item.sub}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

type ExpiredTicket = {
  ticketId: string;
  customerType: string;
  reportedAt: Date;
  status: string;
  overdueHours: number;
  workzone?: string | null;
  idTicket?: number;
};

export default function TicketManagementOverviewPage() {
  const [workzone, setWorkzone] = useState('');
  const [selectedBucket, setSelectedBucket] = useState('all');
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [showSecondaryPanels, setShowSecondaryPanels] = useState(false);
  const [assignTarget, setAssignTarget] = useState<{
    ticketId: string;
    idTicket?: number;
  } | null>(null);

  const queryClient = useQueryClient();

  const { data, isLoading } = useTicketManagementOverview(
    true,
    workzone || undefined,
  );
  const {
    technicians: overviewTechnicians,
    summary: technicianSummary,
    loading: techniciansLoading,
  } = useTechnicianTickets(
    { search: '', workzone: workzone || '', status: 'all' },
    180,
    true,
    { includeClosedToday: true, closedTodayLimit: 20, enabled: showSecondaryPanels },
  );
  const { data: opsSummary } = useOperationsSummary({
    workzone: workzone || undefined,
    enabled: showSecondaryPanels,
  });
  const {
    lastSyncLabel,
    nextSyncLabel,
    isSyncOverdue,
    isInProgress,
    triggerSync,
  } = useSyncStatus(30_000);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setShowSecondaryPanels(true);
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, []);
  const handleWorkzoneChange = useCallback((value: string) => {
    setWorkzone(value);
  }, []);

  const handleInvalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    queryClient.invalidateQueries({ queryKey: queryKeys.technicians.all });
  }, [queryClient]);

  const { isConnected } = useTicketEvents({
    onInvalidate: handleInvalidate,
    onSyncStart: () => {},
    onSyncComplete: () => {},
    onSyncError: () => {},
    enabled: true,
    debounceMs: 300,
  });

  const handleAssign = useCallback((ticketId: string, idTicket?: number) => {
    setAssignTarget({ ticketId, idTicket });
    setAssignModalOpen(true);
  }, []);

  const handleAssignComplete = useCallback(async () => {
    handleInvalidate();
    setAssignModalOpen(false);
    setAssignTarget(null);
  }, [handleInvalidate]);

  const handleAssignModalClose = useCallback(() => {
    setAssignModalOpen(false);
    setAssignTarget(null);
  }, []);

  const allCardData = useMemo(
    () => [
      {
        ...TICKET_MANAGEMENT_BUCKET_ITEMS[0],
        summary: data?.cards.kpiCustomer,
      },
      {
        ...TICKET_MANAGEMENT_BUCKET_ITEMS[1],
        summary: data?.cards.kpiProactive,
      },
      {
        ...TICKET_MANAGEMENT_BUCKET_ITEMS[2],
        summary: data?.cards.nonKpiUnspec,
      },
      {
        ...TICKET_MANAGEMENT_BUCKET_ITEMS[3],
        summary: data?.cards.nonTechnical,
      },
      {
        ...TICKET_MANAGEMENT_BUCKET_ITEMS[4],
        summary: data?.cards.sqmUpdate,
      },
      {
        ...TICKET_MANAGEMENT_BUCKET_ITEMS[5],
        summary: data?.cards.obsolete,
      },
    ],
    [data],
  );

  const visibleCardData = useMemo(
    () =>
      selectedBucket === 'all'
        ? allCardData
        : allCardData.filter((c) => c.key === selectedBucket),
    [allCardData, selectedBucket],
  );

  const selectedBucketCard = visibleCardData[0];
  const selectedBucketSummary = selectedBucketCard?.summary;

  const bucketOverviewTotals = useMemo(
    () =>
      visibleCardData.reduce(
        (acc, card) => {
          const summary = card.summary;
          if (!summary) return acc;

          acc.total += summary.total ?? 0;
          acc.open += summary.open ?? 0;
          acc.assigned += summary.assigned ?? 0;
          acc.close += summary.close ?? 0;
          return acc;
        },
        {
          total: 0,
          open: 0,
          assigned: 0,
          close: 0,
        },
      ),
    [visibleCardData],
  );

  const totalWorkboard = useMemo(
    () =>
      visibleCardData.reduce(
        (sum, card) => sum + (card.summary?.total ?? 0),
        0,
      ),
    [visibleCardData],
  );

  const technicianOrderStats = useMemo(() => {
    return overviewTechnicians.reduce(
      (acc, tech) => ({
        assigned: acc.assigned + (tech.order_counts?.assigned ?? 0),
        onProgress: acc.onProgress + (tech.order_counts?.on_progress ?? 0),
        pending: acc.pending + (tech.order_counts?.pending ?? 0),
        closedToday: acc.closedToday + (tech.total_closed_today ?? 0),
      }),
      {
        assigned: 0,
        onProgress: 0,
        pending: 0,
        closedToday: 0,
      },
    );
  }, [overviewTechnicians]);

  const flaggingTotals = useMemo(() => {
    if (selectedBucket === 'all') return data?.totals;
    const s = visibleCardData[0]?.summary;
    if (!s) return undefined;
    return {
      total: s.total,
      b2c: 0,
      b2b: 0,
      unassigned: 0,
      assigned: s.assigned,
      close: s.close,
      p1Count: s.p1Count,
      pPlusCount: s.pPlusCount,
      ffgCount: s.ffgCount,
      gamasCount: s.gamasCount,
    };
  }, [data, selectedBucket, visibleCardData]);

  const bucketSuffix =
    selectedBucket === 'all'
      ? 'seluruh bucket'
      : (allCardData.find((c) => c.key === selectedBucket)?.label ??
        selectedBucket);

  const focusItems = useMemo<PriorityItem[]>(
    () => [
      {
        key: 'diamond',
        label: 'Diamond',
        count: opsSummary?.focusCounts?.diamond ?? 0,
        sub: 'total B2C+B2B harian',
      },
      {
        key: 'p1',
        label: 'Manja HI',
        count: opsSummary?.focusCounts?.p1 ?? 0,
        sub: 'total B2C+B2B harian',
      },
      {
        key: 'gamas',
        label: 'Gamas',
        count: opsSummary?.focusCounts?.gamas ?? 0,
        sub: 'total B2C+B2B harian',
      },
      {
        key: 'ffg',
        label: 'FFG',
        count: opsSummary?.focusCounts?.ffg ?? 0,
        sub: 'total B2C+B2B harian',
      },
      {
        key: 'carry-over',
        label: 'Carry Over',
        count: opsSummary?.focusCounts?.carryOver ?? 0,
        sub: 'total pending harian',
      },
    ],
    [opsSummary?.focusCounts],
  );

  return (
    <AdminLayout
      onWorkzoneChange={handleWorkzoneChange}
      selectedWorkzone={workzone}
    >
      <div className='space-y-6'>
        <section className='overflow-hidden rounded-4xl border border-(--border) bg-(--surface) shadow-sm'>
          <div className='bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.16),transparent_34%),radial-gradient(circle_at_top_right,rgba(16,185,129,0.11),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.02),transparent)] p-6 md:p-7'>
            <div className='flex flex-col gap-6'>
              <div className='flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between'>
                <div className='max-w-4xl'>
                  <p className='text-[10px] font-bold tracking-[0.32em] text-(--text-secondary) uppercase'>
                    Ticket Management
                  </p>
                  <h1 className='mt-2 text-3xl font-black tracking-tight text-(--text-primary) md:text-4xl'>
                    Operational Overview
                  </h1>
                  <p className='mt-3 max-w-3xl text-sm leading-6 text-(--text-muted)'>
                    Ringkasan operasional utama untuk membaca total workboard,
                    melihat distribusi bucket, dan masuk ke area yang butuh
                    tindakan cepat.
                  </p>
                </div>

                <div className='rounded-3xl border border-(--border) bg-linear-to-br from-(--surface) to-(--surface-2) p-4 shadow-sm'>
                  <div className='flex items-start justify-between gap-4'>
                    <div>
                      <p className='text-[10px] font-bold tracking-[0.24em] text-(--text-muted) uppercase'>
                        Total Workboard
                      </p>

                      <p className='mt-2 text-4xl leading-none font-black tracking-tight text-(--text-primary)'>
                        {isLoading
                          ? '...'
                          : totalWorkboard.toLocaleString('id-ID')}
                      </p>

                      <p className='mt-2 text-xs text-(--text-secondary)'>
                        Seluruh bucket operasional aktif
                      </p>
                    </div>

                    <button
                      onClick={triggerSync}
                      disabled={isInProgress}
                      className='inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-(--border) bg-(--surface) text-(--text-secondary) shadow-sm transition hover:bg-(--surface-hover) hover:text-(--text-primary) disabled:cursor-not-allowed disabled:opacity-50'
                      title='Trigger sync'
                    >
                      <RefreshCw
                        size={15}
                        className={isInProgress ? 'animate-spin' : ''}
                      />
                    </button>
                  </div>

                  <div className='mt-4 flex items-center justify-between gap-3 rounded-2xl bg-(--bg)/60 px-3 py-2'>
                    <div className='flex min-w-0 items-center gap-2'>
                      <span
                        className={`h-2 w-2 shrink-0 rounded-full ${
                          isInProgress
                            ? 'animate-pulse bg-amber-500'
                            : 'bg-emerald-500'
                        }`}
                      />

                      <p className='truncate text-[11px] text-(--text-secondary)'>
                        {isInProgress
                          ? 'Sinkronisasi berjalan...'
                          : lastSyncLabel}
                      </p>
                    </div>

                    {nextSyncLabel && (
                      <p className='hidden shrink-0 text-[11px] text-(--text-muted) sm:block'>
                        {nextSyncLabel}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div className='grid gap-2 sm:grid-cols-2 xl:grid-cols-5'>
                <HeroMetricCard
                  label='Open Workload'
                  value={bucketOverviewTotals.open}
                  helper='Aktif'
                  tone='blue'
                />
                <HeroMetricCard
                  label='Close'
                  value={bucketOverviewTotals.close}
                  helper='Hari Ini'
                  tone='emerald'
                />
                <HeroMetricCard
                  label='Assigned'
                  value={bucketOverviewTotals.assigned}
                  helper='On Progress'
                  tone='amber'
                />
                <HeroMetricCard
                  label='Unassigned'
                  value={bucketOverviewTotals.open}
                  helper='Butuh Assign'
                  tone='slate'
                />
                <HeroMetricCard
                  label='Close Rate'
                  value={`${
                    bucketOverviewTotals.total + bucketOverviewTotals.close > 0
                      ? Math.round(
                          (bucketOverviewTotals.close /
                            (bucketOverviewTotals.total +
                              bucketOverviewTotals.close)) *
                            100,
                        )
                      : 0
                  }%`}
                  helper='Dari Total + Close'
                  tone='violet'
                />
              </div>

              <div className='grid gap-4 xl:grid-cols-[0.9fr_1.1fr]'>
                <div className='rounded-3xl border border-(--border) bg-(--surface) p-3.5 shadow-sm'>
                  <div className='flex flex-wrap items-center justify-between gap-2'>
                    <div>
                      <p className='text-[10px] font-bold tracking-[0.22em] text-(--text-secondary) uppercase'>
                        Filter
                      </p>
                      <p className='mt-1 text-[11px] font-semibold text-(--text-primary)'>
                        Bucket mode
                      </p>
                    </div>
                    <span className='bg-surface-2 rounded-full border border-(--border) px-2.5 py-1 text-[10px] font-semibold text-(--text-secondary)'>
                      {bucketSuffix}
                    </span>
                  </div>

                  <div className='mt-3 flex flex-nowrap gap-1.5 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'>
                    {BUCKET_OPTIONS.map((opt) => {
                      const active = opt.value === selectedBucket;
                      return (
                        <button
                          key={opt.value}
                          onClick={() => setSelectedBucket(opt.value)}
                          className={clsx(
                            'shrink-0 rounded-full px-3 py-1.5 text-[11px] font-semibold transition-all',
                            active
                              ? 'bg-blue-500 text-white shadow-sm'
                              : 'bg-surface-2 border border-(--border) text-(--text-secondary) hover:bg-(--surface-hover) hover:text-(--text-primary)',
                          )}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <PriorityTodayPanel
                  counts={flaggingTotals}
                  items={focusItems}
                  mode={selectedBucket === 'all' ? 'all' : 'bucket'}
                  bucketLabel={selectedBucketCard?.label}
                  bucketSummary={selectedBucketSummary}
                />
              </div>

              <div className='rounded-3xl border border-(--border) bg-(--surface) p-4 shadow-sm'>
                <div className='mb-3 flex flex-wrap items-center justify-between gap-2'>
                  <div>
                    <p className='text-[11px] font-bold tracking-[0.22em] text-(--text-secondary) uppercase'>
                      Bucket Summary
                    </p>
                    <p className='mt-1 text-sm font-semibold text-(--text-primary)'>
                      Distribusi seluruh bucket operasional
                    </p>
                  </div>
                  <span className='text-[11px] font-semibold text-(--text-muted)'>
                    Total seluruh bucket
                  </span>
                </div>

                <div className='grid gap-2'>
                  {visibleCardData.map((card) => (
                    <BucketSummaryRow
                      key={card.key}
                      label={card.label}
                      total={card.summary?.total ?? 0}
                      open={card.summary?.open ?? 0}
                      close={card.summary?.close ?? 0}
                      flags={card.summary}
                      toneClass={CARD_TONES[card.key]}
                      isLoading={isLoading}
                    />
                  ))}
                </div>
              </div>

              {showSecondaryPanels ? (
                <>
                  <div className='rounded-3xl border border-(--border) bg-(--surface) p-4 shadow-sm'>
                    <div className='mb-3 flex flex-wrap items-end justify-between gap-2'>
                      <div>
                        <p className='text-[11px] font-bold tracking-[0.22em] text-(--text-secondary) uppercase'>
                          Summary Teknisi
                        </p>
                        <p className='mt-1 text-sm font-semibold text-(--text-primary)'>
                          Snapshot teknisi aktif pada workzone terpilih
                        </p>
                      </div>
                      <p className='text-[11px] text-(--text-muted)'>
                        {technicianSummary.idle_count.toLocaleString('id-ID')}{' '}
                        idle
                      </p>
                    </div>

                    <TechnicianSummaryCards
                      totalTechnicians={
                        technicianSummary.total_active +
                        technicianSummary.idle_count
                      }
                      idleCount={technicianSummary.idle_count}
                      assigned={technicianOrderStats.assigned}
                      onProgress={technicianOrderStats.onProgress}
                      pending={technicianOrderStats.pending}
                      closedToday={technicianOrderStats.closedToday}
                    />

                    <div className='mt-4'>
                      {techniciansLoading && (
                        <p className='mb-2 text-[11px] text-(--text-muted)'>
                          Memuat summary teknisi...
                        </p>
                      )}
                      <TechnicianSummaryTable
                        technicians={overviewTechnicians}
                        onFilterByTech={(_techId, _filterType) => {}}
                      />
                    </div>
                  </div>

                  <HourlyChart
                    workzone={workzone || undefined}
                    bucket={selectedBucket}
                  />

                  <SymptomChart
                    workzone={workzone || undefined}
                    bucket={selectedBucket}
                  />

                  <div className='rounded-3xl border border-(--border) bg-(--surface) p-5 shadow-sm'>
                    <div className='flex flex-wrap items-center justify-between gap-3'>
                      <div>
                        <p className='text-xs font-bold tracking-[1.4px] text-(--text-secondary) uppercase'>
                          Quick Access
                        </p>
                        <h2 className='mt-1 text-lg font-black text-(--text-primary)'>
                          Shortcut ke Area Kerja
                        </h2>
                        <p className='mt-1 text-sm text-(--text-muted)'>
                          Masuk langsung ke bucket yang sedang dipantau.
                        </p>
                      </div>
                      <div className='flex flex-wrap gap-2'>
                        {TICKET_MANAGEMENT_BUCKET_ITEMS.map((item) => (
                          <Link
                            key={item.key}
                            href={item.path}
                            className='rounded-full border border-(--border) bg-(--surface) px-3 py-1.5 text-xs font-bold tracking-[1px] text-(--text-secondary) uppercase transition-colors hover:bg-(--surface-hover)'
                          >
                            {item.label}
                          </Link>
                        ))}
                        <Link
                          key={TICKET_MANAGEMENT_OVERVIEW_ITEMS[0].key}
                          href={TICKET_MANAGEMENT_OVERVIEW_ITEMS[0].path}
                          className='rounded-full border border-(--border) bg-(--surface) px-3 py-1.5 text-xs font-bold tracking-[1px] text-(--text-secondary) uppercase transition-colors hover:bg-(--surface-hover)'
                        >
                          {TICKET_MANAGEMENT_OVERVIEW_ITEMS[0].label}
                        </Link>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className='grid gap-4 xl:grid-cols-2'>
                  <div className='h-[340px] rounded-3xl border border-(--border) bg-(--surface-2)' />
                  <div className='h-[340px] rounded-3xl border border-(--border) bg-(--surface-2)' />
                  <div className='xl:col-span-2 h-[320px] rounded-3xl border border-(--border) bg-(--surface-2)' />
                  <div className='rounded-3xl border border-(--border) bg-(--surface-2) px-5 py-4 xl:col-span-2'>
                    <div className='h-6 w-48 rounded-full bg-(--border)' />
                    <div className='mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-5'>
                      {Array.from({ length: 5 }, (_, i) => (
                        <div
                          key={i}
                          className='h-16 rounded-2xl border border-(--border) bg-(--surface)'
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>

      {/* ─── ASSIGN MODAL ─── */}
      <AssignTechnicianModal
        isOpen={assignModalOpen}
        onClose={handleAssignModalClose}
        ticketId={assignTarget?.idTicket ?? 0}
        ticketCode={assignTarget?.ticketId ?? ''}
        onAssign={handleAssignComplete}
      />
    </AdminLayout>
  );
}
