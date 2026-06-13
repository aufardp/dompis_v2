'use client';

import Link from 'next/link';
import clsx from 'clsx';
import { useCallback, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import AdminLayout from '@/app/components/layout/AdminLayout';
import { useTicketManagementOverview } from '@/app/hooks/useTicketManagementOverview';
import { useSyncStatus } from '@/app/hooks/useSyncStatus';
import { useOpenDiamondTickets } from '@/app/hooks/useOpenDiamondTickets';
import { useOperationsSummary } from '@/app/hooks/useOperationsSummary';
import { useTicketEvents } from '@/app/hooks/useTicketEvents';
import {
  TICKET_MANAGEMENT_BUCKET_ITEMS,
  TICKET_MANAGEMENT_OVERVIEW_ITEMS,
} from '@/app/config/ticket-management-nav';
import StatCard from './StatCard';
import { DiamondAlertBanner } from './AlertBanner';
import OperationalFocusQueue, {
  buildOperationalFocusItems,
} from './OperationalFocusQueue';
import AssignTechnicianModal from './assign/AssignTechnicianModal';
import HourlyChart from './HourlyChart';
import SymptomChart from './SymptomChart';
import ServiceAreaTable from './ServiceAreaTable';
import AdminAccordion from '@/app/components/ui/AdminAccordion';

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

function FlaggingMiniGrid({ counts }: { counts?: FlaggingCounts }) {
  const items = [
    ['P1', counts?.p1Count ?? 0],
    ['P+', counts?.pPlusCount ?? 0],
    ['FFG', counts?.ffgCount ?? 0],
    ['GAMAS', counts?.gamasCount ?? 0],
  ] as const;

  return (
    <div className='grid grid-cols-4 gap-2 text-center'>
      {items.map(([label, value]) => (
        <div
          key={label}
          className='rounded-xl bg-white/55 px-2 py-2 dark:bg-black/10'
        >
          <p className='text-[9px] font-bold tracking-[1px] uppercase opacity-70'>
            {label}
          </p>
          <p className='mt-1 text-sm font-black'>
            {Number(value).toLocaleString('id-ID')}
          </p>
        </div>
      ))}
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
  const [assignTarget, setAssignTarget] = useState<{
    ticketId: string;
    idTicket?: number;
  } | null>(null);

  const queryClient = useQueryClient();

  const { data, isLoading } = useTicketManagementOverview(
    true,
    workzone || undefined,
  );
  const { data: opsSummary } = useOperationsSummary({
    workzone: workzone || undefined,
  });
  const {
    lastSyncLabel,
    nextSyncLabel,
    isSyncOverdue,
    isInProgress,
    triggerSync,
  } = useSyncStatus(30_000);
  const { tickets: diamondTickets, loading: diamondLoading } =
    useOpenDiamondTickets(workzone || undefined);

  const handleWorkzoneChange = useCallback((value: string) => {
    setWorkzone(value);
  }, []);

  const handleInvalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    queryClient.invalidateQueries({ queryKey: ['tickets'] });
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

  const totalWorkboard = useMemo(
    () =>
      visibleCardData.reduce(
        (sum, card) => sum + (card.summary?.total ?? 0),
        0,
      ),
    [visibleCardData],
  );

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

  const focusItems = useMemo(
    () =>
      buildOperationalFocusItems(
        opsSummary?.focusCounts ?? {
          diamond: 0,
          p1: 0,
          gamas: 0,
          ffg: 0,
          carryOver: 0,
        },
      ),
    [opsSummary?.focusCounts],
  );

  const expiredTickets = useMemo<ExpiredTicket[]>(() => {
    if (!diamondTickets) return [];
    return diamondTickets.map((t) => ({
      ticketId: t.ticketId,
      customerType: t.customerType,
      reportedAt: t.reportedAt,
      status: t.status,
      overdueHours: Math.max(
        0,
        (Date.now() - t.reportedAt.getTime()) / 3600000,
      ),
      workzone: t.workzone,
      idTicket: t.idTicket,
    }));
  }, [diamondTickets]);

  return (
    <AdminLayout
      onWorkzoneChange={handleWorkzoneChange}
      selectedWorkzone={workzone}
    >
      <div className='space-y-6'>
        {/* ─── HEADER ─── */}
        <div className='overflow-hidden rounded-[28px] border border-(--border) bg-(--surface) shadow-sm'>
          <div className='bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.16),transparent_36%),radial-gradient(circle_at_top_right,rgba(16,185,129,0.12),transparent_28%)] p-6'>
            {/* Row: Title + Sync + Total Workboard */}
            <div className='flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between'>
              <div className='flex-1'>
                <p className='text-xs font-bold tracking-[1.6px] text-(--text-secondary) uppercase'>
                  Ticket Management
                </p>
                <h1 className='mt-2 text-3xl font-black text-(--text-primary)'>
                  Operational Overview
                </h1>
                <p className='mt-3 max-w-3xl text-sm leading-6 text-(--text-muted)'>
                  Halaman ini menjadi pintu masuk Ticket Management. Fokusnya
                  bukan sekadar total ticket, tetapi pemisahan workload
                  berdasarkan bucket operasional yang mudah dibaca.
                </p>
              </div>

              {/* Sync status bar */}
              <div className='flex shrink-0 items-center gap-3 self-start rounded-2xl border border-(--border) bg-(--surface) px-4 py-3 shadow-sm'>
                <div
                  className={clsx(
                    'h-2 w-2 shrink-0 rounded-full',
                    isConnected ? 'bg-emerald-500' : 'bg-red-500',
                  )}
                />
                <div className='min-w-0 text-xs text-(--text-secondary)'>
                  <span>{lastSyncLabel}</span>
                  {nextSyncLabel && (
                    <span className='block text-[10px] text-(--text-muted)'>
                      {nextSyncLabel}
                    </span>
                  )}
                </div>
                <button
                  onClick={triggerSync}
                  disabled={isInProgress}
                  className='ml-1 rounded-lg border border-(--border) p-1.5 text-(--text-secondary) transition-colors hover:bg-(--surface-hover) disabled:opacity-50'
                  title='Trigger sync'
                >
                  <RefreshCw
                    size={14}
                    className={isInProgress ? 'animate-spin' : ''}
                  />
                </button>
              </div>

              {/* Total Workboard pill */}
              <div className='rounded-2xl border border-(--border) bg-(--surface) px-5 py-4 text-right shadow-sm'>
                <p className='text-[11px] font-bold tracking-[1.4px] text-(--text-secondary) uppercase'>
                  Total Workboard
                </p>
                <p className='mt-1 text-3xl font-black text-(--text-primary)'>
                  {isLoading ? '...' : totalWorkboard}
                </p>
              </div>
            </div>

            {/* KPI Filter + bucket label */}
            <div className='mt-5 flex flex-wrap items-center justify-between gap-3'>
              <div className='flex items-center gap-3'>
                <label className='text-[11px] font-bold tracking-[1.4px] text-(--text-secondary) uppercase'>
                  Filter
                </label>
                <select
                  value={selectedBucket}
                  onChange={(e) => setSelectedBucket(e.target.value)}
                  className='rounded-md border border-(--border) bg-(--surface) px-3 py-1.5 text-xs font-semibold text-(--text-primary) shadow-sm'
                >
                  {BUCKET_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <span className='text-[11px] font-semibold text-(--text-muted)'>
                {bucketSuffix}
              </span>
            </div>

            {/* Priority Flag Overview */}
            <div className='mt-4 rounded-2xl border border-(--border) bg-(--surface) p-3 shadow-sm'>
              <div className='mb-2 flex flex-wrap items-center justify-between gap-2'>
                <p className='text-[11px] font-bold tracking-[1.4px] text-(--text-secondary) uppercase'>
                  Priority Flag Overview
                </p>
                <span className='text-[11px] font-semibold text-(--text-muted)'>
                  Total seluruh bucket
                </span>
              </div>
              <FlaggingMiniGrid counts={flaggingTotals} />
            </div>

            {/* 6-bucket summary bar */}
            <div
              className='mt-4 grid gap-px border-t border-(--border) bg-(--border)'
              style={
                selectedBucket === 'all'
                  ? { gridTemplateColumns: 'repeat(6, minmax(0, 1fr))' }
                  : {}
              }
            >
              {visibleCardData.map((card) => (
                <div key={card.key} className='bg-(--surface) p-4'>
                  <p className='text-[11px] font-bold tracking-[1.4px] text-(--text-secondary) uppercase'>
                    {card.label}
                  </p>
                  <p className='mt-2 text-3xl font-black text-(--text-primary)'>
                    {isLoading ? '...' : (card.summary?.total ?? 0)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ─── STAT CARDS ─── */}
        <div className='grid grid-cols-2 gap-4 lg:grid-cols-4'>
          <StatCard
            label='Total'
            value={opsSummary?.stats.total ?? 0}
            subInfo='Semua tiket'
            variant='total'
          />
          <StatCard
            label='Unassigned'
            value={opsSummary?.stats.unassigned ?? 0}
            subInfo='Butuh assign'
            variant='unassigned'
          />
          <StatCard
            label='Assigned'
            value={opsSummary?.stats.assigned ?? 0}
            subInfo='Sedang dikerjakan'
            variant='assigned'
          />
          <StatCard
            label='Close'
            value={opsSummary?.stats.close ?? 0}
            subInfo='Selesai hari ini'
            variant='close'
          />
        </div>

        {/* ─── FOCUS QUEUE ─── */}
        <OperationalFocusQueue items={focusItems} />

        {/* ─── DIAMOND ALERT ─── */}
        {expiredTickets.length > 0 && (
          <DiamondAlertBanner
            tickets={expiredTickets}
            onAssign={handleAssign}
          />
        )}

        {/* ─── HOURLY CHART ─── */}
        <HourlyChart workzone={workzone || undefined} bucket={selectedBucket} />

        {/* ─── SYMPTOM CHART ─── */}
        <SymptomChart
          workzone={workzone || undefined}
          bucket={selectedBucket}
        />

        {/* ─── SERVICE AREA PERFORMANCE ─── */}
        <AdminAccordion
          items={[
            {
              id: 'service-area-performance',
              title: 'Service Area Performance',
              defaultOpen: false,
              children: (
                <ServiceAreaTable areas={opsSummary?.serviceAreas ?? []} />
              ),
            },
          ]}
        />

        {/* ─── BUCKET CARDS ─── */}
        <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3'>
          {visibleCardData.map((card) => (
            <Link
              key={card.key}
              href={card.path}
              className={clsx(
                'group rounded-3xl border p-5 shadow-sm transition-transform duration-200 hover:-translate-y-0.5',
                CARD_TONES[card.key],
              )}
            >
              <div className='flex items-start justify-between gap-4'>
                <div className='min-w-0 flex-1'>
                  <p className='text-2xl'>{card.icon}</p>
                  <h2 className='mt-3 text-xl font-black'>{card.label}</h2>
                  <p className='mt-2 text-sm leading-6 opacity-80'>
                    {card.description}
                  </p>
                </div>
                <div className='shrink-0 rounded-2xl bg-white/60 px-3 py-2 text-right shadow-sm dark:bg-black/10'>
                  <p className='text-[11px] font-bold tracking-[1.2px] uppercase opacity-70'>
                    Total
                  </p>
                  <p className='text-2xl font-black'>
                    {card.summary?.total ?? 0}
                  </p>
                </div>
              </div>

              <div className='mt-5 grid grid-cols-3 gap-2 text-center'>
                {(
                  [
                    ['Open', card.summary?.open ?? 0],
                    ['Assigned', card.summary?.assigned ?? 0],
                    ['Close', card.summary?.close ?? 0],
                  ] as const
                ).map(([label, value]) => (
                  <div
                    key={label}
                    className='rounded-2xl bg-white/55 px-3 py-2 dark:bg-black/10'
                  >
                    <p className='text-[10px] font-bold tracking-[1.2px] uppercase opacity-70'>
                      {label}
                    </p>
                    <p className='mt-1 text-lg font-black'>{value}</p>
                  </div>
                ))}
              </div>

              <div className='mt-2'>
                <FlaggingMiniGrid counts={card.summary} />
              </div>
            </Link>
          ))}
        </div>

        {/* ─── QUICK ACCESS ─── */}
        <div className='rounded-3xl border border-(--border) bg-(--surface) p-5 shadow-sm'>
          <div className='flex flex-wrap items-center justify-between gap-3'>
            <div>
              <p className='text-xs font-bold tracking-[1.4px] text-(--text-secondary) uppercase'>
                Quick Access
              </p>
              <h2 className='mt-1 text-xl font-black text-(--text-primary)'>
                Shortcut ke Area Kerja
              </h2>
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
