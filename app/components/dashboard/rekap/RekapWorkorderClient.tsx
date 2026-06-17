'use client';

import type { ReactNode } from 'react';
import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/app/libs/query-keys';
import { Activity, CheckCircle2, Clock3, RefreshCw, Users } from 'lucide-react';
import DataFreshnessBadge from '../DataFreshnessBadge';
import RekapWorkorderTable from './RekapWorkorderTable';
import RekapWorkorderCards from './RekapWorkorderCards';
import RekapWorkorderHourlyClose from './RekapWorkorderHourlyClose';
import RekapSkeleton from './RekapSkeleton';

interface SegCount { open: number; close: number; }

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

const toneStyles: Record<string, { border: string; text: string; icon: string }> = {
  slate: { border: 'border-(--border)', text: 'text-(--text-primary)', icon: 'text-(--text-muted)' },
  red: { border: 'border-red-500/20', text: 'text-red-500', icon: 'text-red-400' },
  green: { border: 'border-emerald-500/20', text: 'text-emerald-500', icon: 'text-emerald-400' },
  blue: { border: 'border-blue-500/20', text: 'text-blue-500', icon: 'text-blue-400' },
};

const KPI_ACCENT: Record<string, string> = {
  'Customer': '#3b82f6',
  'Proactive': '#a855f7',
  'Unspec': '#64748b',
  'Non Technical': '#e11d48',
};

const BUCKET_CONTEXT: Record<string, { label: string; description: string; hint: string }> = {
  all: {
    label: 'All view',
    description: 'Menampilkan seluruh bucket operasional dalam satu tabel utama.',
    hint: 'Gunakan untuk membaca distribusi total.',
  },
  kpi_customer: {
    label: 'Customer view',
    description: 'Fokus pada B2C, B2B, dan SQM yang masuk bucket Customer.',
    hint: 'Detail utama: REGULER, GOLD, PLATINUM, DIAMOND.',
  },
  kpi_proactive: {
    label: 'Proactive view',
    description: 'Fokus pada tiket proactive, termasuk keluarga SQM dan SQM-CCAN.',
    hint: 'Detail utama: SQM dan SQM-CCAN.',
  },
  non_kpi_unspec: {
    label: 'Unspec view',
    description: 'Fokus pada tiket unspec untuk B2C dan B2B.',
    hint: 'Detail utama: UNSPEC dan UNSPEC-B2B.',
  },
  non_technical: {
    label: 'Non Technical view',
    description: 'Menampilkan ticket non-technical yang relevan untuk review operasional.',
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
  const open = summary.open + summary.assigned;
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
    <div className={`rounded-lg border bg-(--surface) px-4 py-3 ${t.border}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-(--text-muted)">
          {label}
        </p>
        <div className={t.icon}>{icon}</div>
      </div>
      <div className="mt-2 flex items-end justify-between gap-3">
        <p className={`text-2xl font-bold leading-none ${t.text}`}>{value}</p>
        <p className="text-right text-xs text-(--text-muted)">{sub}</p>
      </div>
      {label === 'Close' && cr !== undefined && (
        <div className="mt-2 flex items-center gap-2">
          <div className="flex-1 h-1.5 rounded-full bg-(--surface-3) overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${cr}%`,
                background: cr >= 80 ? '#22c55e' : cr >= 50 ? '#f59e0b' : '#ef4444',
              }}
            />
          </div>
          <span className="text-[10px] font-mono font-bold text-(--text-muted)">{cr}%</span>
        </div>
      )}
      {label === 'WO/Teknisi' && (
        <div className="mt-1 flex items-center gap-1">
          <div
            className="w-2 h-2 rounded-full"
            style={{ background: Number(value) >= 6 ? '#ef4444' : Number(value) >= 3 ? '#f59e0b' : '#22c55e' }}
          />
          <span className="text-[10px] text-(--text-muted)">
            {Number(value) >= 6 ? 'Overloaded' : Number(value) >= 3 ? 'Moderate' : 'Healthy'}
          </span>
        </div>
      )}
    </div>
  );
}

export default function RekapWorkorderClient() {
  const [selectedBucket, setSelectedBucket] = useState('all');

  const queryParams = useMemo(() => new URLSearchParams({ bucket: selectedBucket }), [selectedBucket]);

  const { data, isLoading, isError, refetch, isFetching } = useQuery<RekapResponse>({
    queryKey: [...queryKeys.dashboard.rekapWorkorder(), selectedBucket],
    queryFn: async () => {
      const res = await fetch(`/api/dashboard/rekap-workorder?${queryParams}`, {
        cache: 'no-store',
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to fetch');
      }
      return res.json();
    },
    refetchInterval: 120000,
    staleTime: 60000,
  });

  if (isLoading) return <RekapSkeleton />;

  if (isError || data?.error) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-12">
        <p className="text-sm text-(--text-secondary)">
          {data?.error || 'Gagal memuat data. Klik refresh untuk mencoba lagi.'}
        </p>
        <button onClick={() => refetch()} className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
          Refresh
        </button>
      </div>
    );
  }

  if (!data?.rows?.length) {
    return (
      <div className="flex flex-col items-center gap-3 py-12">
        <p className="text-sm text-(--text-muted)">
          Tidak ada Service Area yang dikonfigurasi untuk akun ini
        </p>
      </div>
    );
  }

  const summary = computeOverviewSummary(data.workboardSummary) ?? computeSummary(data.rows);
  const fallbackSummary = computeSummary(data.rows);
  const displaySummary = {
    ...fallbackSummary,
    ...summary,
    teknisi: fallbackSummary.teknisi,
    woPerTeknisi: fallbackSummary.woPerTeknisi,
  };
  const ks = data.kpiSummary;
  const bucketContext =
    BUCKET_CONTEXT[selectedBucket as keyof typeof BUCKET_CONTEXT] ??
    BUCKET_CONTEXT.all;

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-[28px] border border-(--border) bg-(--surface) shadow-sm">
        <div className="border-b border-(--border) bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.12),transparent_28%),radial-gradient(circle_at_top_right,rgba(16,185,129,0.09),transparent_24%)] px-4 py-4 md:px-5 md:py-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-black tracking-tight text-(--text-primary) md:text-xl">
                  {data.title}
                </h2>
                <span className="rounded-full border border-(--border) bg-surface px-2.5 py-1 text-[11px] font-semibold text-(--text-muted)">
                  {data.syncDate}
                </span>
              </div>
              <p className="mt-2 text-sm leading-6 text-(--text-secondary)">
                {data.subtitle}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-blue-500/15 bg-blue-500/[0.08] px-3 py-1 text-[11px] font-semibold text-blue-700 dark:text-blue-200">
                  {bucketContext.label}
                </span>
                <span className="rounded-full border border-(--border) bg-surface px-3 py-1 text-[11px] font-semibold text-(--text-secondary)">
                  {bucketContext.hint}
                </span>
                <span className="rounded-full border border-(--border) bg-surface px-3 py-1 text-[11px] font-semibold text-(--text-secondary)">
                  {data.rows.length.toLocaleString('id-ID')} service area
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-3 lg:min-w-[18rem]">
              {data.timestamp && (
                <DataFreshnessBadge
                  generatedAt={data.timestamp}
                  onRefresh={() => refetch()}
                  isRefreshing={isFetching}
                />
              )}
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => refetch()}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-(--border) bg-surface px-4 py-2.5 text-sm font-semibold text-(--text-primary) transition-colors hover:bg-surface-2"
                >
                  <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
                <div className="rounded-2xl border border-(--border) bg-surface-2 px-4 py-2.5 text-center">
                  <p className="text-[10px] font-bold tracking-[0.22em] text-(--text-muted) uppercase">
                    Mode
                  </p>
                  <p className="mt-1 truncate text-sm font-semibold text-(--text-primary)">
                    {bucketContext.label}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2 rounded-3xl border border-(--border) bg-(--surface) p-2">
            {BUCKET_OPTIONS.map((opt) => {
              const active = opt.value === selectedBucket;
              return (
                <button
                  key={opt.value}
                  onClick={() => setSelectedBucket(opt.value)}
                  className={`rounded-full px-3.5 py-2 text-xs font-semibold transition-all ${
                    active
                      ? 'bg-blue-500 text-white shadow-sm'
                      : 'border border-(--border) bg-surface-2 text-(--text-secondary) hover:bg-(--surface-hover) hover:text-(--text-primary)'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="border-b border-(--border) px-4 py-4 md:px-5">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <SummaryTile
              label="Total WO"
              value={formatNumber(ks?.total ?? displaySummary.total)}
              sub={`${data.rows.length} service area`}
              tone="slate"
              icon={<Activity className="h-4 w-4" />}
            />
            <SummaryTile
              label="Open"
              value={formatNumber(displaySummary.open)}
              sub="perlu ditangani"
              tone="red"
              icon={<Clock3 className="h-4 w-4" />}
            />
            <SummaryTile
              label="Close"
              value={formatNumber(displaySummary.close)}
              sub={`${displaySummary.closeRate}% closure`}
              tone="green"
              icon={<CheckCircle2 className="h-4 w-4" />}
              closeRate={displaySummary.closeRate}
            />
            <SummaryTile
              label="Teknisi"
              value={formatNumber(displaySummary.teknisi)}
              sub="absen hari ini"
              tone="blue"
              icon={<Users className="h-4 w-4" />}
            />
            <SummaryTile
              label="WO/Teknisi"
              value={displaySummary.woPerTeknisi}
              sub="open load"
              tone="slate"
              icon={<RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />}
            />
          </div>
        </div>

        {ks && (
          <div className="border-b border-(--border) px-4 py-4 md:px-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-[11px] font-bold tracking-[0.22em] text-(--text-secondary) uppercase">
                  Priority overview
                </p>
                <p className="mt-1 text-sm text-(--text-muted)">
                  Total seluruh bucket dan flag prioritas
                </p>
              </div>
              <span className="text-[11px] font-semibold text-(--text-muted)">
                Ringkasan bucket operasional
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-2.5 rounded-2xl border border-blue-500/15 bg-blue-500/[0.08] px-3 py-2 text-white">
                <span className="text-[10px] font-semibold uppercase tracking-[0.18em] opacity-70">
                  Total
                </span>
                <span className="text-lg leading-none font-black text-blue-700 dark:text-blue-100">
                  {formatNumber(ks.total ?? 0)}
                </span>
              </div>
              {[
                { label: 'Customer', value: ks.kpiCustomer, accent: '#3b82f6' },
                { label: 'Proactive', value: ks.kpiProactive, accent: '#a855f7' },
                { label: 'Unspec', value: ks.nonKpiUnspec, accent: '#64748b' },
                { label: 'Non Technical', value: ks.nonTechnical, accent: '#e11d48' },
                { label: 'SQM Update', value: ks.sqmUpdate, accent: '#7c3aed' },
                { label: 'Obsolete', value: ks.obsolete, accent: '#f43f5e' },
              ].map((item) => (
                <div
                  key={item.label}
                  className="flex items-center gap-2.5 rounded-2xl border border-(--border) bg-(--surface) px-3 py-2"
                  style={{ borderLeftWidth: '3px', borderLeftColor: item.accent }}
                >
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-(--text-muted)">
                    {item.label}
                  </span>
                  <span className="text-base font-bold leading-none" style={{ color: item.accent }}>
                    {formatNumber(item.value)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
      <div className="grid gap-4">
        <section className="rounded-[28px] border border-(--border) bg-(--surface) shadow-sm">
          <RekapWorkorderHourlyClose bucket={selectedBucket} />
        </section>
      </div>

      <div className="hidden xl:block">
        <section className="overflow-hidden rounded-[28px] border border-(--border) bg-(--surface) shadow-sm">
          <div className="border-b border-(--border) bg-[linear-gradient(180deg,rgba(248,250,252,0.9),rgba(255,255,255,0.75))] px-4 py-4 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.45),rgba(15,23,42,0.2))]">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="max-w-3xl">
                <p className="text-[11px] font-bold tracking-[0.22em] text-(--text-secondary) uppercase">
                  Workboard table
                </p>
                <p className="mt-1 text-sm font-medium text-(--text-secondary)">
                  Hierarki area, service area, dan workzone dengan detail sesuai bucket aktif.
                </p>
              </div>
              <span className="rounded-full border border-(--border) bg-(--bg) px-3 py-1 text-[11px] font-semibold text-(--text-secondary)">
                {selectedBucket === 'all' ? 'All view' : bucketContext.label}
              </span>
            </div>
          </div>
          <div className="p-0">
            <RekapWorkorderTable
              rows={data.rows}
              timestamp={data.timestamp}
              detailMode={selectedBucket !== 'all' ? selectedBucket : undefined}
              overviewSummary={data.workboardSummary}
            />
          </div>
        </section>
      </div>

      <div className="xl:hidden">
        <RekapWorkorderCards rows={data.rows} />
      </div>
    </div>
  );
}
