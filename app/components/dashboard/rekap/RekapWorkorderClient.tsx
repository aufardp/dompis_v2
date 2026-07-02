'use client';

import type { ComponentType, ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import { queryKeys } from '@/app/libs/query-keys';
import { Activity, CheckCircle2, Clock3, RefreshCw, Users } from 'lucide-react';
import DataFreshnessBadge from '../DataFreshnessBadge';
import RekapSkeleton from './RekapSkeleton';
import type { CaptureFormat } from './captureElementAsImage';
import { captureElementAsImage } from './captureElementAsImage';
import { usePersistentWorkzoneScope } from '@/app/hooks/usePersistentWorkzoneScope';

const RekapWorkorderHourlyClose = dynamic(
  () => import('./RekapWorkorderHourlyClose'),
  {
    ssr: false,
    loading: () => (
      <div className='h-60 animate-pulse rounded-[28px] border border-(--border) bg-(--surface-2)' />
    ),
  },
) as ComponentType<{ bucket?: string; initialWorkzone?: string }>;

const RekapWorkorderTable = dynamic(() => import('./RekapWorkorderTable'), {
  ssr: false,
  loading: () => (
    <div className='h-105 animate-pulse rounded-[28px] border border-(--border) bg-(--surface-2)' />
  ),
});

const RekapWorkorderCards = dynamic(() => import('./RekapWorkorderCards'), {
  ssr: false,
  loading: () => (
    <div className='h-105 animate-pulse rounded-[28px] border border-(--border) bg-(--surface-2)' />
  ),
});

interface SegCount {
  open: number;
  close: number;
}

interface DetailGroup {
  b2c: Record<string, SegCount>;
  b2b: Record<string, SegCount>;
}

interface BucketRecord {
  kpiCustomer: SegCount;
  kpiProactive: SegCount;
  nonKpiUnspec: SegCount;
  nonTechnical: SegCount;
  sqmUpdate: SegCount;
  obsolete: SegCount;
}

interface WorkzoneRow {
  workzone: string;
  buckets: BucketRecord;
  detail: DetailGroup;
  sqm: { open: number; close: number; update: number };
  totalOpen: number;
  totalClose: number;
}

interface SARow {
  no: number;
  area: string;
  saName: string;
  teknisiMasuk: number;
  woPerTeknisi: string;
  buckets: BucketRecord;
  detail: DetailGroup;
  sqm: { open: number; close: number; update: number };
  workzones: WorkzoneRow[];
  totalOpen: number;
  totalClose: number;
  grandTotal: number;
  jenisTiket: Record<string, SegCount>;
}

interface KpiSummaryCounts {
  total: number;
  kpiCustomer: number;
  kpiProactive: number;
  nonKpiUnspec: number;
  nonTechnical: number;
  sqmUpdate: number;
  obsolete: number;
}

interface BucketSummaryCounts {
  total: number;
  open: number;
  assigned: number;
  close: number;
}

interface BucketBreakdownCounts {
  kpiCustomer: BucketSummaryCounts;
  kpiProactive: BucketSummaryCounts;
  nonKpiUnspec: BucketSummaryCounts;
  nonTechnical: BucketSummaryCounts;
  sqmUpdate: BucketSummaryCounts;
  obsolete: BucketSummaryCounts;
}

interface WorkboardSummaryCounts {
  total: number;
  open: number;
  assigned: number;
  close: number;
}

interface RekapResponse {
  title: string;
  subtitle: string;
  timestamp: string;
  syncDate: string;
  rows: SARow[];
  totals: Record<string, number>;
  kpiSummary?: KpiSummaryCounts;
  bucketSummary?: BucketSummaryCounts;
  bucketBreakdown?: BucketBreakdownCounts;
  workboardSummary?: WorkboardSummaryCounts;
  selectedBucket?: string;
  error?: string;
}

const BUCKET_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'kpi_customer', label: 'Customer' },
  { value: 'kpi_proactive', label: 'Proactive' },
  { value: 'non_kpi_unspec', label: 'Unspec' },
  { value: 'non_technical', label: 'Non Technical' },
  { value: 'sqm_update', label: 'SQM Update' },
  { value: 'obsolete', label: 'Obsolete' },
] as const;

function BucketFilterBar({
  selectedBucket,
  onChange,
}: {
  selectedBucket: string;
  onChange: (bucket: string) => void;
}) {
  return (
    <div className='inline-flex max-w-full flex-wrap items-center gap-1.5 rounded-full border border-(--border) bg-(--surface) p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.45)]'>
      {BUCKET_OPTIONS.map((opt) => {
        const active = opt.value === selectedBucket;
        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={`rounded-full px-2.75 py-1.5 text-[11px] font-semibold transition-all ${
              active
                ? 'bg-blue-500 text-white shadow-sm'
                : 'bg-surface-2 border border-transparent text-(--text-secondary) hover:border-(--border) hover:bg-(--surface-hover) hover:text-(--text-primary)'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function MobileBucketFilterGrid({
  selectedBucket,
  onChange,
}: {
  selectedBucket: string;
  onChange: (bucket: string) => void;
}) {
  return (
    <div className='space-y-2'>
      {BUCKET_OPTIONS.map((opt) => {
        const active = opt.value === selectedBucket;
        const isAll = opt.value === 'all';
        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={`min-h-11 w-full rounded-2xl border px-3 py-2 text-center text-[11px] font-semibold leading-tight transition-all ${
              active
                ? 'border-blue-500/20 bg-blue-500 text-white shadow-sm'
                : 'border-(--border) bg-(--surface-2) text-(--text-secondary) hover:bg-(--surface-hover) hover:text-(--text-primary)'
            } ${isAll ? 'py-2.5 text-[12px]' : ''}`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

const toneStyles: Record<
  string,
  { border: string; text: string; icon: string }
> = {
  slate: {
    border: 'border-(--border)',
    text: 'text-(--text-primary)',
    icon: 'text-(--text-muted)',
  },
  red: {
    border: 'border-red-500/20',
    text: 'text-red-500',
    icon: 'text-red-400',
  },
  green: {
    border: 'border-emerald-500/20',
    text: 'text-emerald-500',
    icon: 'text-emerald-400',
  },
  blue: {
    border: 'border-blue-500/20',
    text: 'text-blue-500',
    icon: 'text-blue-400',
  },
};

const KPI_ACCENT: Record<string, string> = {
  Customer: '#3b82f6',
  Proactive: '#a855f7',
  Unspec: '#64748b',
  'Non Technical': '#e11d48',
};

const BUCKET_CONTEXT: Record<
  string,
  { label: string; description: string; hint: string }
> = {
  all: {
    label: 'All view',
    description:
      'Menampilkan seluruh bucket operasional dalam satu tabel utama.',
    hint: 'Gunakan untuk membaca distribusi total.',
  },
  kpi_customer: {
    label: 'Customer view',
    description: 'Fokus pada B2C, B2B, dan SQM yang masuk bucket Customer.',
    hint: 'Detail utama: REGULER, GOLD, PLATINUM, DIAMOND.',
  },
  kpi_proactive: {
    label: 'Proactive view',
    description:
      'Fokus pada tiket proactive, termasuk keluarga SQM dan SQM-CCAN.',
    hint: 'Detail utama: SQM dan SQM-CCAN.',
  },
  non_kpi_unspec: {
    label: 'Unspec view',
    description: 'Fokus pada tiket unspec untuk B2C dan B2B.',
    hint: 'Detail utama: UNSPEC dan UNSPEC-B2B.',
  },
  non_technical: {
    label: 'Non Technical view',
    description:
      'Menampilkan ticket non-technical yang relevan untuk review operasional.',
    hint: 'Konteks investigasi dan permintaan.',
  },
  sqm_update: {
    label: 'SQM Update view',
    description: 'Menampilkan tiket yang berstatus SQM Update dan turunannya.',
    hint: 'Sesuai header [SQM-UPDATE].',
  },
  obsolete: {
    label: 'Obsolete view',
    description: 'Menampilkan tiket yang sudah masuk kategori obsolete.',
    hint: 'classification_path Z_PERMINTAAN_044.',
  },
};

function formatNumber(value: number): string {
  return new Intl.NumberFormat('id-ID').format(value);
}

function computeSummary(rows: SARow[]) {
  const open = rows.reduce((sum, row) => sum + row.totalOpen, 0);
  const close = rows.reduce((sum, row) => sum + row.totalClose, 0);
  const total = open + close;
  const teknisi = rows.reduce((sum, row) => sum + row.teknisiMasuk, 0);
  const closeRate = total > 0 ? Math.round((close / total) * 100) : 0;
  const woPerTeknisi = teknisi > 0 ? (open / teknisi).toFixed(1) : '0.0';

  return { open, close, total, teknisi, closeRate, woPerTeknisi };
}

function computeOverviewSummary(summary?: WorkboardSummaryCounts) {
  if (!summary) return null;
  const open = summary.open;
  const close = summary.close;
  const total = summary.total;
  const closeRate = total > 0 ? Math.round((close / total) * 100) : 0;
  return { open, close, total, closeRate };
}

function SummaryTile({
  label,
  value,
  sub,
  tone,
  icon,
  closeRate: cr,
}: {
  label: string;
  value: string;
  sub: string;
  tone: 'slate' | 'red' | 'green' | 'blue';
  icon: ReactNode;
  closeRate?: number;
}) {
  const t = toneStyles[tone];

  return (
    <div className={`rounded-xl border bg-(--surface) px-3 py-2 ${t.border}`}>
      <div className='flex items-center justify-between gap-2'>
        <p className='text-[10px] font-semibold tracking-[0.18em] text-(--text-muted) uppercase'>
          {label}
        </p>
        <div className={t.icon}>{icon}</div>
      </div>
      <div className='mt-1.5 flex items-end justify-between gap-2'>
        <p className={`text-[1.45rem] leading-none font-semibold ${t.text}`}>
          {value}
        </p>
        <p className='max-w-24 text-right text-[10px] leading-4 text-(--text-muted)'>
          {sub}
        </p>
      </div>
      {label === 'Close' && cr !== undefined && (
        <div className='mt-1.25 flex items-center gap-2'>
          <div className='h-1.25 flex-1 overflow-hidden rounded-full bg-(--surface-3)'>
            <div
              className='h-full rounded-full transition-all'
              style={{
                width: `${cr}%`,
                background:
                  cr >= 80 ? '#22c55e' : cr >= 50 ? '#f59e0b' : '#ef4444',
              }}
            />
          </div>
          <span className='font-mono text-[9px] font-bold text-(--text-muted)'>
            {cr}%
          </span>
        </div>
      )}
      {label === 'WO/Teknisi' && (
        <div className='mt-1 flex items-center gap-1'>
          <div
            className='h-1.5 w-1.5 rounded-full'
            style={{
              background:
                Number(value) >= 6
                  ? '#ef4444'
                  : Number(value) >= 3
                    ? '#f59e0b'
                    : '#22c55e',
            }}
          />
          <span className='text-[9px] text-(--text-muted)'>
            {Number(value) >= 6
              ? 'Overloaded'
              : Number(value) >= 3
                ? 'Moderate'
                : 'Healthy'}
          </span>
        </div>
      )}
    </div>
  );
}

function StatusPair({
  open,
  close,
  closeRate,
}: {
  open: number;
  close: number;
  closeRate: number;
}) {
  return (
    <div className='grid gap-2 md:grid-cols-2'>
      <div className='rounded-xl border border-red-500/15 bg-red-500/6 px-3 py-2 shadow-sm dark:bg-red-500/9'>
        <div className='flex items-start justify-between gap-2'>
          <div>
            <p className='text-[10px] font-semibold tracking-[0.18em] text-red-600/80 uppercase dark:text-red-300/80'>
              Open
            </p>
            <p className='mt-1 text-[1.55rem] leading-none font-semibold text-red-700 dark:text-red-200'>
              {formatNumber(open)}
            </p>
          </div>
          <div className='rounded-full border border-red-500/15 bg-white px-2 py-0.5 text-[9px] font-bold text-red-600 dark:bg-red-950/40 dark:text-red-200'>
            Need action
          </div>
        </div>
        <p className='mt-1.5 text-[10px] leading-4 text-red-700/70 dark:text-red-200/70'>
          Ticket yang masih berjalan dan perlu diproses.
        </p>
      </div>

      <div className='rounded-xl border border-emerald-500/15 bg-emerald-500/6 px-3 py-2 shadow-sm dark:bg-emerald-500/9'>
        <div className='flex items-start justify-between gap-2'>
          <div>
            <p className='text-[10px] font-semibold tracking-[0.18em] text-emerald-600/80 uppercase dark:text-emerald-300/80'>
              Close
            </p>
            <p className='mt-1 text-[1.55rem] leading-none font-semibold text-emerald-700 dark:text-emerald-200'>
              {formatNumber(close)}
            </p>
          </div>
          <div className='rounded-full border border-emerald-500/15 bg-white px-2 py-0.5 text-[9px] font-bold text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-200'>
            {closeRate}% rate
          </div>
        </div>
        <div className='mt-1.5 h-1.5 overflow-hidden rounded-full bg-emerald-500/10 dark:bg-emerald-500/20'>
          <div
            className='h-full rounded-full transition-all'
            style={{
              width: `${closeRate}%`,
              background:
                closeRate >= 80
                  ? '#22c55e'
                  : closeRate >= 50
                    ? '#f59e0b'
                    : '#ef4444',
            }}
          />
        </div>
        <p className='mt-1.5 text-[10px] leading-4 text-emerald-700/70 dark:text-emerald-200/70'>
          Ticket yang sudah selesai diproses dan terkonfirmasi.
        </p>
      </div>
    </div>
  );
}

export default function RekapWorkorderClient({
  initialWorkzone = '',
}: {
  initialWorkzone?: string;
}) {
  const { workzone } = usePersistentWorkzoneScope(initialWorkzone);
  const [selectedBucket, setSelectedBucket] = useState('all');
  const captureTargetRef = useRef<HTMLTableElement | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [heavySectionsReady, setHeavySectionsReady] = useState({
    hourly: false,
    table: false,
    cards: false,
  });

  const queryParams = useMemo(
    () => {
      const params = new URLSearchParams({ bucket: selectedBucket });
      if (workzone) params.set('workzone', workzone);
      return params;
    },
    [selectedBucket, workzone],
  );

  const { data, isLoading, isError, refetch, isFetching } =
    useQuery<RekapResponse>({
      queryKey: [
        ...queryKeys.dashboard.rekapWorkorder(),
        selectedBucket,
        workzone || 'all',
      ],
      queryFn: async () => {
        const res = await fetch(
          `/api/dashboard/rekap-workorder?${queryParams}`,
          {
            cache: 'no-store',
          },
        );
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Failed to fetch');
        }
        return res.json();
      },
      refetchInterval: 300000,
      staleTime: 120000,
    });

  useEffect(() => {
    if (!data?.rows?.length) return;

    setHeavySectionsReady({
      hourly: false,
      table: false,
      cards: false,
    });

    const timers: number[] = [];
    const schedule = (fn: () => void, delay: number) => {
      timers.push(window.setTimeout(fn, delay));
    };

    schedule(
      () => setHeavySectionsReady((prev) => ({ ...prev, hourly: true })),
      0,
    );
    schedule(
      () => setHeavySectionsReady((prev) => ({ ...prev, table: true })),
      120,
    );
    schedule(
      () => setHeavySectionsReady((prev) => ({ ...prev, cards: true })),
      240,
    );

    return () => {
      for (const timer of timers) window.clearTimeout(timer);
    };
  }, [data?.rows?.length, selectedBucket]);

  if (isLoading) return <RekapSkeleton />;

  if (isError || data?.error) {
    return (
      <div className='flex flex-col items-center justify-center gap-4 py-12'>
        <p className='text-sm text-(--text-secondary)'>
          {data?.error || 'Gagal memuat data. Klik refresh untuk mencoba lagi.'}
        </p>
        <button
          onClick={() => refetch()}
          className='flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700'
        >
          Refresh
        </button>
      </div>
    );
  }

  if (!data?.rows?.length) {
    return (
      <div className='flex flex-col items-center gap-3 py-12'>
        <p className='text-sm text-(--text-muted)'>
          Tidak ada Service Area yang dikonfigurasi untuk akun ini
        </p>
      </div>
    );
  }

  const summary =
    computeOverviewSummary(data.workboardSummary) ?? computeSummary(data.rows);
  const fallbackSummary = computeSummary(data.rows);
  const displaySummary = {
    ...fallbackSummary,
    ...summary,
    teknisi: fallbackSummary.teknisi,
    woPerTeknisi: fallbackSummary.woPerTeknisi,
  };
  const ks = data.kpiSummary;
  const customerPriorityValue =
    selectedBucket === 'kpi_customer'
      ? data.bucketSummary?.open ?? data.kpiSummary?.kpiCustomer ?? 0
      : data.kpiSummary?.kpiCustomer ?? 0;
  const priorityOverviewTotal =
    selectedBucket === 'kpi_customer'
      ? customerPriorityValue
      : data.kpiSummary?.total ?? 0;
  const displayTitle = data.title.replace(/\s*\[[^\]]+\]\s*$/, '').trim();

  const handleCapture = async (format: CaptureFormat) => {
    if (!captureTargetRef.current || isCapturing) return;

    setIsCapturing(true);
    try {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const bucketSlug = selectedBucket.replace(/[^a-z0-9]+/gi, '-');
      const syncSlug = data.syncDate.replace(/[^0-9a-z]+/gi, '-');
      const timestampSlug = new Date()
        .toISOString()
        .replace(/[:.]/g, '-')
        .replace('T', '_')
        .replace('Z', '');

      await captureElementAsImage(captureTargetRef.current, {
        format,
        filename: `rekap-workorder-${bucketSlug}-${syncSlug}-${timestampSlug}`,
        scale: 2,
      });
    } finally {
      setIsCapturing(false);
    }
  };

  return (
    <div className='space-y-4'>
      <section className='overflow-hidden rounded-[28px] border border-(--border) bg-(--surface) shadow-sm'>
        <div className='border-b border-(--border) bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.06),transparent_22%),radial-gradient(circle_at_top_right,rgba(16,185,129,0.05),transparent_20%)] px-4 py-3 md:px-5 md:py-3'>
          <div className='flex flex-col gap-2.5 lg:flex-row lg:items-start lg:justify-between'>
            <div className='max-w-3xl'>
              <div className='flex flex-wrap items-center gap-2'>
                <h2 className='text-[16px] font-semibold tracking-tight text-(--text-primary) md:text-[17px]'>
                  {displayTitle}
                </h2>
                <span className='bg-surface rounded-full border border-(--border) px-2 py-0.5 text-[9px] font-semibold text-(--text-muted)'>
                  {data.syncDate}
                </span>
              </div>
              {data.subtitle && (
                <p className='mt-1.5 max-w-2xl text-[12px] leading-5 text-(--text-secondary)'>
                  {data.subtitle}
                </p>
              )}
              <div className='mt-2 flex flex-wrap items-center gap-2'>
                <span className='rounded-full border border-(--border) bg-(--surface) px-2.5 py-0.5 text-[10px] font-semibold text-(--text-secondary)'>
                  {data.rows.length.toLocaleString('id-ID')} service area
                </span>
              </div>
            </div>

            <div className='flex flex-col gap-2.5 lg:min-w-[18rem]'>
              {data.timestamp && (
                <DataFreshnessBadge
                  generatedAt={data.timestamp}
                  onRefresh={() => refetch()}
                  isRefreshing={isFetching}
                />
              )}
            </div>
          </div>
        </div>

        <div className='border-b border-(--border) px-4 py-3 md:px-5'>
          <div className='grid gap-2 md:grid-cols-2 xl:grid-cols-5'>
            <SummaryTile
              label='Total WO'
              value={formatNumber(displaySummary.total)}
              sub={`${data.rows.length} service area`}
              tone='slate'
              icon={<Activity className='h-4 w-4' />}
            />
            <div className='md:col-span-2 xl:col-span-2'>
              <StatusPair
                open={displaySummary.open}
                close={displaySummary.close}
                closeRate={displaySummary.closeRate}
              />
            </div>
            <SummaryTile
              label='Teknisi'
              value={formatNumber(displaySummary.teknisi)}
              sub='absen hari ini'
              tone='blue'
              icon={<Users className='h-4 w-4' />}
            />
            <SummaryTile
              label='WO/Teknisi'
              value={displaySummary.woPerTeknisi}
              sub='open load'
              tone='slate'
              icon={
                <RefreshCw
                  className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`}
                />
              }
            />
          </div>
        </div>

        {ks && (
          <div className='border-b border-(--border) px-4 py-3 md:px-5'>
            <div className='mb-2.5 flex flex-wrap items-center justify-between gap-2'>
              <div>
                <p className='text-[9px] font-bold tracking-[0.18em] text-(--text-secondary) uppercase'>
                  Priority overview
                </p>
              </div>
            </div>

            <div className='flex flex-wrap items-center gap-1.5'>
              <div className='flex items-center gap-2 rounded-xl border border-blue-500/15 bg-blue-500/8 px-2.5 py-1 text-blue-900 dark:text-blue-100'>
                <span className='text-[9px] font-semibold tracking-[0.16em] text-blue-700/75 uppercase dark:text-blue-200/75'>
                  Total
                </span>
                <span className='text-[1rem] leading-none font-semibold text-blue-800 dark:text-blue-100'>
                  {formatNumber(priorityOverviewTotal)}
                </span>
              </div>
              {[
                {
                  label: 'Customer',
                  value: customerPriorityValue,
                  accent: '#3b82f6',
                },
                {
                  label: 'Proactive',
                  value: ks.kpiProactive,
                  accent: '#a855f7',
                },
                { label: 'Unspec', value: ks.nonKpiUnspec, accent: '#64748b' },
                {
                  label: 'Non Technical',
                  value: ks.nonTechnical,
                  accent: '#e11d48',
                },
                { label: 'SQM Update', value: ks.sqmUpdate, accent: '#7c3aed' },
                { label: 'Obsolete', value: ks.obsolete, accent: '#f43f5e' },
              ].map((item) => (
                <div
                  key={item.label}
                  className='flex items-center gap-2 rounded-xl border border-(--border) bg-(--surface) px-2.5 py-1'
                  style={{
                    borderLeftWidth: '3px',
                    borderLeftColor: item.accent,
                  }}
                >
                  <span className='text-[9px] font-semibold tracking-wide text-(--text-muted) uppercase'>
                    {item.label}
                  </span>
                  <span
                    className='text-[0.95rem] leading-none font-bold'
                    style={{ color: item.accent }}
                  >
                    {formatNumber(item.value)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
      <div className='grid gap-4'>
        <section className='rounded-[28px] border border-(--border) bg-(--surface) shadow-sm'>
          {heavySectionsReady.hourly ? (
            <RekapWorkorderHourlyClose
              bucket={selectedBucket}
              initialWorkzone={workzone}
            />
          ) : (
            <div className='h-60 animate-pulse rounded-[28px] bg-(--surface-2)' />
          )}
        </section>
      </div>

      <div className='hidden xl:block'>
        <section className='overflow-hidden rounded-[28px] border border-(--border) bg-(--surface) shadow-sm'>
          <div className='border-b border-(--border) bg-[linear-gradient(180deg,rgba(248,250,252,0.9),rgba(255,255,255,0.75))] px-4 py-3.5 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.45),rgba(15,23,42,0.2))]'>
            <div className='flex flex-wrap items-end justify-between gap-3'>
              <div className='max-w-3xl pb-0.5'>
                <p className='text-[10px] font-bold tracking-[0.2em] text-(--text-secondary) uppercase'>
                  Bucket filter
                </p>
                <p className='mt-1 text-[12px] font-medium text-(--text-secondary)'>
                  Pilih bucket tanpa perlu kembali ke bagian atas halaman.
                </p>
              </div>
              <div className='w-full max-w-184 xl:w-auto xl:justify-self-end'>
                <BucketFilterBar
                  selectedBucket={selectedBucket}
                  onChange={setSelectedBucket}
                />
              </div>
            </div>
          </div>
          <div className='p-0'>
            {heavySectionsReady.table ? (
              <RekapWorkorderTable
                captureTargetRef={captureTargetRef}
                isCapturing={isCapturing}
                onCapture={handleCapture}
                rows={data.rows}
                timestamp={data.timestamp}
                detailMode={
                  selectedBucket !== 'all' ? selectedBucket : undefined
                }
                overviewSummary={data.workboardSummary}
                bucketSummary={data.bucketSummary}
                bucketBreakdown={data.bucketBreakdown}
              />
            ) : (
              <div className='h-105 animate-pulse bg-(--surface-2)' />
            )}
          </div>
        </section>
      </div>

      <div className='xl:hidden'>
        <div className='rounded-[28px] border border-(--border) bg-(--surface) shadow-sm'>
          <div className='border-b border-(--border) px-4 py-4'>
            <div className='space-y-3'>
              <div>
                <p className='text-[10px] font-bold tracking-[0.2em] text-(--text-secondary) uppercase'>
                  Bucket filter
                </p>
                <p className='mt-1 text-[12px] leading-5 text-(--text-secondary)'>
                  Pilih bucket tanpa perlu kembali ke bagian atas halaman.
                </p>
              </div>
              <MobileBucketFilterGrid
                selectedBucket={selectedBucket}
                onChange={setSelectedBucket}
              />
            </div>
          </div>
          <div>
            {heavySectionsReady.cards ? (
              <RekapWorkorderCards
                rows={data.rows}
              />
            ) : (
              <div className='h-105 animate-pulse rounded-[28px] border border-(--border) bg-(--surface-2)' />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
