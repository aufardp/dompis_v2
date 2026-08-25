'use client';

import Link from 'next/link';
import clsx from 'clsx';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { RefreshCw, Gem, Flame, Flag, Network, CalendarClock, AlertTriangle } from 'lucide-react';
import AdminLayout from '@/app/components/layout/AdminLayout';
import { useTechnicianTickets } from '@/app/hooks/useTechnicianTickets';
import { useSyncStatus } from '@/app/hooks/useSyncStatus';
import {
  useOperationsSummary,
  type OperationsSummary,
} from '@/app/hooks/useOperationsSummary';
import { useTicketEvents } from '@/app/hooks/useTicketEvents';
import { useTicketManagementOverview } from '@/app/hooks/useTicketManagementOverview';
import { queryKeys } from '@/app/libs/query-keys';
import { usePersistentWorkzoneScope } from '@/app/hooks/usePersistentWorkzoneScope';
import { usePersistentBranchScope } from '@/app/hooks/usePersistentBranchScope';
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

function pctDelta(current: number, h1?: number | null): number | null {
  if (h1 === null || h1 === undefined) return null;
  if (h1 === 0) return current > 0 ? null : 0;
  return ((current - h1) / h1) * 100;
}

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
        <p className='mt-2 text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-50'>
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
        <p className='mt-2 text-2xl font-semibold tracking-tight text-blue-700 dark:text-blue-200'>
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
        <p className='mt-2 text-2xl font-semibold tracking-tight text-orange-700 dark:text-orange-200'>
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
        <p className='mt-2 text-2xl font-semibold tracking-tight text-amber-700 dark:text-amber-200'>
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
        <p className='mt-2 text-2xl font-semibold tracking-tight text-emerald-700 dark:text-emerald-200'>
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
          <span className='font-semibold text-(--text-primary)'>
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
          <p className='mt-1 truncate text-[0.95rem] font-semibold tracking-tight'>
            {label}
          </p>
        </div>
        <div>
          <p className='text-[10px] font-bold tracking-[0.18em] uppercase opacity-70'>
            Total
          </p>
          <p className='mt-1 text-[1.4rem] font-semibold tracking-tight'>
            {isLoading ? '...' : total.toLocaleString('id-ID')}
          </p>
        </div>
        <div className='rounded-2xl bg-white/45 px-3 py-2 text-right shadow-sm dark:bg-black/10'>
          <p className='text-[10px] font-bold tracking-[0.18em] uppercase opacity-70'>
            Open / Close
          </p>
          <p className='mt-1 text-[0.85rem] font-semibold'>
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
  trendPct,
  trendPositiveIsGood = true,
  h1Label = 'vs kemarin',
}: {
  label: string;
  value: number | string;
  helper: string;
  tone: HeroTone;
  trendPct?: number | null;
  trendPositiveIsGood?: boolean;
  h1Label?: string;
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

  const showTrend =
    typeof trendPct === 'number' && Number.isFinite(trendPct);
  const neutral = showTrend && Math.abs(trendPct) < 0.05;
  let trendTone: string;
  let trendIcon: string;
  if (neutral) {
    trendTone = 'text-slate-400 bg-slate-100 dark:bg-slate-800';
    trendIcon = '→';
  } else {
    const up = (trendPct ?? 0) > 0;
    const isGood = trendPositiveIsGood ? up : !up;
    trendTone = isGood
      ? 'text-emerald-700 bg-emerald-100 dark:text-emerald-300 dark:bg-emerald-500/10'
      : 'text-red-700 bg-red-100 dark:text-red-300 dark:bg-red-500/10';
    trendIcon = up ? '▲' : '▼';
  }

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
        <div className='flex shrink-0 flex-col items-end gap-1'>
          <p className='text-[1.15rem] leading-none font-semibold text-(--text-primary) md:text-[1.25rem]'>
            {typeof value === 'number' ? value.toLocaleString('id-ID') : value}
          </p>
          {showTrend && (
            <span
              className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-px text-[9px] font-bold ${trendTone}`}
              title={h1Label}
            >
              {trendIcon} {Math.abs(trendPct).toFixed(0)}% {h1Label}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

const PRIORITY_META: Record<
  string,
  {
    icon: typeof Gem;
    chip: string;
    accentBorder: string;
    accentText: string;
    dot: string;
  }
> = {
  diamond: {
    icon: Gem,
    chip: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
    accentBorder: 'hover:border-blue-300 dark:hover:border-blue-500/40',
    accentText: 'text-blue-600 dark:text-blue-400',
    dot: 'bg-blue-500',
  },
  p1: {
    icon: Flame,
    chip: 'bg-red-500/10 text-red-600 dark:text-red-400',
    accentBorder: 'hover:border-red-300 dark:hover:border-red-500/40',
    accentText: 'text-red-600 dark:text-red-400',
    dot: 'bg-red-500',
  },
  pplus: {
    icon: AlertTriangle,
    chip: 'bg-orange-500/10 text-orange-600 dark:text-orange-400',
    accentBorder: 'hover:border-orange-300 dark:hover:border-orange-500/40',
    accentText: 'text-orange-600 dark:text-orange-400',
    dot: 'bg-orange-500',
  },
  gamas: {
    icon: Network,
    chip: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
    accentBorder: 'hover:border-violet-300 dark:hover:border-violet-500/40',
    accentText: 'text-violet-600 dark:text-violet-400',
    dot: 'bg-violet-500',
  },
  ffg: {
    icon: Flag,
    chip: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    accentBorder: 'hover:border-amber-300 dark:hover:border-amber-500/40',
    accentText: 'text-amber-600 dark:text-amber-400',
    dot: 'bg-amber-500',
  },
  'carry-over': {
    icon: CalendarClock,
    chip: 'bg-slate-500/10 text-slate-600 dark:text-slate-400',
    accentBorder: 'hover:border-slate-300 dark:hover:border-slate-500/40',
    accentText: 'text-slate-600 dark:text-slate-400',
    dot: 'bg-slate-500',
  },
  default: {
    icon: Flag,
    chip: 'bg-(--surface-2) text-(--text-secondary)',
    accentBorder: 'hover:border-(--border)',
    accentText: 'text-(--text-primary)',
    dot: 'bg-(--text-muted)',
  },
};

function PriorityTodayPanel({
  items,
  mode,
  bucketLabel,
  bucketSummary,
  h1Flags,
}: {
  items: PriorityItem[];
  mode: 'all' | 'bucket';
  bucketLabel?: string;
  bucketSummary?: BucketSummaryLike;
  h1Flags?: { p1Count: number; pPlusCount: number; ffgCount: number; gamasCount: number } | null;
}) {
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

  const h1ThresholdFor = (key: string): number | null => {
    if (!h1Flags) return null;
    switch (key) {
      case 'p1':
        return h1Flags.p1Count;
      case 'pplus':
        return h1Flags.pPlusCount;
      case 'ffg':
        return h1Flags.ffgCount;
      case 'gamas':
        return h1Flags.gamasCount;
      default:
        return null;
    }
  };

  return (
    <div className='rounded-3xl border border-(--border) bg-(--surface) p-4 shadow-sm'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <div>
          <p className='text-[10px] font-bold tracking-[0.22em] text-(--text-secondary) uppercase'>
            {mode === 'all'
              ? 'Priority Today'
              : `Priority Today · ${bucketLabel ?? 'Bucket'}`}
          </p>
          <p className='mt-1 text-[11px] font-semibold text-(--text-primary)'>
            {mode === 'all'
              ? 'Ringkasan prioritas dan fokus harian'
              : 'Ringkasan prioritas bucket terpilih'}
          </p>
        </div>
      </div>

      <div className='mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-2'>
        {displayItems.map((item) => {
          const threshold = h1ThresholdFor(item.key);
          const overThreshold =
            threshold !== null && threshold > 0 && item.count > threshold;
          const meta = PRIORITY_META[item.key] ?? PRIORITY_META.default;
          const Icon = meta.icon;
          const isZero = item.count === 0;

          return (
            <div
              key={item.key}
              className={clsx(
                'flex flex-col gap-2.5 rounded-2xl border p-3 transition-colors',
                overThreshold
                  ? 'border-red-300 bg-red-50/80 dark:border-red-500/30 dark:bg-red-500/10'
                  : 'border-(--border) bg-(--surface-2)',
                !overThreshold && meta.accentBorder,
              )}
            >
              <div className='flex items-center justify-between gap-2'>
                <div className='flex min-w-0 items-center gap-2'>
                  <span
                    className={clsx(
                      'flex h-8 w-8 shrink-0 items-center justify-center rounded-xl',
                      meta.chip,
                    )}
                  >
                    <Icon size={15} />
                  </span>
                  <p className='truncate text-[11px] font-bold tracking-wide text-(--text-secondary) uppercase'>
                    {item.label}
                  </p>
                </div>
                <span
                  className={clsx(
                    'inline-flex min-w-6 items-center justify-center rounded-full px-1.5 py-0.5 text-[11px] font-bold tabular-nums',
                    isZero
                      ? 'bg-(--surface) text-(--text-muted)'
                      : overThreshold
                        ? 'bg-red-500/15 text-red-600 dark:text-red-400'
                        : clsx('bg-white/70 dark:bg-white/5', meta.accentText),
                  )}
                >
                  {item.count.toLocaleString('id-ID')}
                </span>
              </div>

              <div className='flex min-w-0 items-center gap-1.5'>
                <span className={clsx('h-1.5 w-1.5 shrink-0 rounded-full', isZero ? 'bg-(--text-muted)' : meta.dot)} />
                <p className='truncate text-[11px] font-medium text-(--text-secondary)'>
                  {overThreshold
                    ? `Melebihi ${threshold.toLocaleString('id-ID')} (kemarin)`
                    : item.sub}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TopWorkloadPanel({
  areas,
  onSelect,
  activeWorkzone,
}: {
  areas: OperationsSummary['serviceAreas'];
  onSelect?: (name: string) => void;
  activeWorkzone?: string;
}) {
  const top3 = useMemo(
    () =>
      [...areas]
        .sort((a, b) => b.total - a.total)
        .slice(0, 3),
    [areas],
  );

  const max = top3[0]?.total || 1;

  return (
    <div className='rounded-3xl border border-(--border) bg-(--surface) p-3.5 shadow-sm'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <div>
          <p className='text-[10px] font-bold tracking-[0.22em] text-(--text-secondary) uppercase'>
            Beban Per Area
          </p>
          <p className='mt-1 text-[11px] font-semibold text-(--text-primary)'>
            Top 3 Workzone Terpadat
          </p>
        </div>
        <span className='bg-surface-2 rounded-full border border-(--border) px-2.5 py-1 text-[10px] font-semibold text-(--text-secondary)'>
          {areas.length} area
        </span>
      </div>

      <div className='mt-3 grid gap-2'>
        {top3.map((area) => {
          const pct = Math.round((area.total / max) * 100);
          const isActive = activeWorkzone === area.name;
          return (
            <button
              key={area.name}
              onClick={() => onSelect?.(area.name)}
              className={clsx(
                'w-full rounded-2xl border px-3 py-2 text-left transition-all',
                isActive
                  ? 'border-blue-400 bg-blue-50/60 dark:border-blue-500/40 dark:bg-blue-500/10'
                  : 'border-(--border) bg-(--surface-2) hover:bg-(--surface-hover)',
              )}
              title='Klik untuk memfilter workzone ini'
            >
              <div className='flex items-center justify-between gap-2'>
                <p className='truncate text-[11px] font-semibold text-(--text-primary)'>
                  {area.name}
                </p>
                <p className='shrink-0 text-[11px] font-bold text-(--text-secondary)'>
                  {area.total.toLocaleString('id-ID')}
                  <span className='ml-1 font-medium text-(--text-muted)'>
                    · {area.unassigned} unassign
                  </span>
                </p>
              </div>
              <div className='mt-1.5 h-1.5 overflow-hidden rounded-full bg-(--border)'>
                <div
                  className={clsx(
                    'h-full rounded-full transition-all',
                    isActive
                      ? 'bg-blue-500'
                      : area.unassigned > 0 && area.unassigned / area.total > 0.5
                        ? 'bg-red-400'
                        : 'bg-amber-400',
                  )}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </button>
          );
        })}
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

export default function TicketManagementOverviewPage({
  initialWorkzone = '',
  initialBranch = '',
}: {
  initialWorkzone?: string;
  initialBranch?: string;
}) {
  const { workzone, setWorkzone } =
    usePersistentWorkzoneScope(initialWorkzone);
  const { branch } = usePersistentBranchScope(initialBranch);
  const [selectedBucket, setSelectedBucket] = useState('all');
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [showSecondaryPanels, setShowSecondaryPanels] = useState(false);
  const [assignTarget, setAssignTarget] = useState<{
    ticketId: string;
    idTicket?: number;
  } | null>(null);

  const queryClient = useQueryClient();

  const overview = useTicketManagementOverview({
    workzone: workzone || undefined,
    branch: branch || undefined,
  });
  const overviewData = overview.data;
  const isLoading = overview.isLoading;
  const h1 = overviewData?.h1 ?? null;

  const bucketSummaries = useMemo(
    () => overviewData?.cards ?? null,
    [overviewData],
  );

  const {
    technicians: overviewTechnicians,
    summary: technicianSummary,
    loading: techniciansLoading,
  } = useTechnicianTickets(
    { search: '', workzone: workzone || '', status: 'all', branch: branch || '' },
    180,
    true,
    {
      includeClosedToday: true,
      closedTodayLimit: 20,
      enabled: showSecondaryPanels,
    },
  );
  const { data: opsSummary } = useOperationsSummary({
    workzone: workzone || undefined,
    branch: branch || undefined,
    enabled: showSecondaryPanels,
  });
  const { isInProgress, triggerSync } = useSyncStatus(30_000);

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

  const allCardData = useMemo(() => {
    const summaryMap: Record<string, BucketSummaryLike | undefined> = {
      'kpi-customer': bucketSummaries?.kpiCustomer,
      'kpi-proactive': bucketSummaries?.kpiProactive,
      'non-kpi-unspec': bucketSummaries?.nonKpiUnspec,
      'non-technical': bucketSummaries?.nonTechnical,
      'sqm-update': bucketSummaries?.sqmUpdate,
      obsolete: bucketSummaries?.obsolete,
    };

    return TICKET_MANAGEMENT_BUCKET_ITEMS.map((item) => ({
      ...item,
      summary: summaryMap[item.key] as BucketSummaryLike | undefined,
    }));
  }, [bucketSummaries]);

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

  const totalWorkboardDelta = useMemo(
    () => pctDelta(totalWorkboard, h1?.total),
    [totalWorkboard, h1],
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
        sub: 'open harian',
      },
      {
        key: 'p1',
        label: 'Manja HI',
        count: opsSummary?.focusCounts?.p1 ?? 0,
        sub: 'open harian',
      },
      {
        key: 'gamas',
        label: 'Gamas',
        count: opsSummary?.focusCounts?.gamas ?? 0,
        sub: 'open harian',
      },
      {
        key: 'ffg',
        label: 'FFG',
        count: opsSummary?.focusCounts?.ffg ?? 0,
        sub: 'open harian',
      },
      {
        key: 'carry-over',
        label: 'Carry Over',
        count: opsSummary?.focusCounts?.carryOver ?? 0,
        sub: 'open + pending harian',
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
                  <h1 className='mt-2 text-3xl font-semibold tracking-tight text-(--text-primary) md:text-4xl'>
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

                      <p className='mt-2 text-4xl leading-none font-semibold tracking-tight text-(--text-primary)'>
                        {isLoading
                          ? '...'
                          : totalWorkboard.toLocaleString('id-ID')}
                      </p>

                      <p className='mt-2 text-xs text-(--text-secondary)'>
                        Seluruh bucket operasional aktif
                      </p>

                      {h1 && (
                        <p className='mt-1.5 text-[11px] font-semibold text-(--text-muted)'>
                          {h1.total.toLocaleString('id-ID')} hari kemarin
                          {totalWorkboardDelta !== null &&
                            ` · ${totalWorkboardDelta.toFixed(0)}% ${
                              totalWorkboardDelta > 0 ? '▲' : '▼'
                            }`}
                        </p>
                      )}
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

                  {isInProgress && (
                    <div className='mt-4 flex items-center gap-3 rounded-2xl bg-(--bg)/60 px-3 py-2'>
                      <p className='truncate text-[11px] text-(--text-secondary)'>
                        Sinkronisasi berjalan...
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <div className='grid gap-2 sm:grid-cols-2 xl:grid-cols-5'>
                <HeroMetricCard
                  label='Open Workload'
                  value={bucketOverviewTotals.open}
                  helper='Aktif'
                  tone='blue'
                  trendPct={pctDelta(bucketOverviewTotals.open, h1?.open)}
                  trendPositiveIsGood={false}
                />
                <HeroMetricCard
                  label='Close'
                  value={bucketOverviewTotals.close}
                  helper='Hari Ini'
                  tone='emerald'
                  trendPct={pctDelta(bucketOverviewTotals.close, h1?.close)}
                />
                <HeroMetricCard
                  label='Assigned'
                  value={bucketOverviewTotals.assigned}
                  helper='On Progress'
                  tone='amber'
                  trendPct={pctDelta(bucketOverviewTotals.assigned, h1?.assigned)}
                  trendPositiveIsGood={false}
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

              <div className='grid gap-4 xl:grid-cols-[0.9fr_1.1fr_1fr]'>
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

                  <div className='mt-3 flex flex-wrap gap-1.5'>
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
                  items={focusItems}
                  mode={selectedBucket === 'all' ? 'all' : 'bucket'}
                  bucketLabel={selectedBucketCard?.label}
                  bucketSummary={selectedBucketSummary}
                  h1Flags={h1}
                />

                <TopWorkloadPanel
                  areas={opsSummary?.serviceAreas ?? []}
                  activeWorkzone={workzone || undefined}
                  onSelect={(name) =>
                    handleWorkzoneChange(workzone === name ? '' : name)
                  }
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
                    branch={branch || undefined}
                    bucket={selectedBucket}
                  />

                  <SymptomChart
                    workzone={workzone || undefined}
                    branch={branch || undefined}
                    bucket={selectedBucket}
                  />

                  <div className='rounded-3xl border border-(--border) bg-(--surface) p-5 shadow-sm'>
                    <div className='flex flex-wrap items-center justify-between gap-3'>
                      <div>
                        <p className='text-xs font-bold tracking-[1.4px] text-(--text-secondary) uppercase'>
                          Quick Access
                        </p>
                        <h2 className='mt-1 text-lg font-semibold text-(--text-primary)'>
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
                  <div className='h-85 rounded-3xl border border-(--border) bg-(--surface-2)' />
                  <div className='h-85 rounded-3xl border border-(--border) bg-(--surface-2)' />
                  <div className='h-80 rounded-3xl border border-(--border) bg-(--surface-2) xl:col-span-2' />
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
