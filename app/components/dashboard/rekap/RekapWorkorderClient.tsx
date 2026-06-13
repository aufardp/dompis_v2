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

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-lg border border-(--border) bg-(--surface) px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-bold text-(--text-primary)">{data.title}</h2>
            <span className="rounded border border-(--border) px-2 py-0.5 text-[11px] font-semibold text-(--text-muted)">
              {data.syncDate}
            </span>
          </div>
          <p className="mt-1 text-xs text-(--text-secondary)">{data.subtitle}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <select
              value={selectedBucket}
              onChange={(e) => setSelectedBucket(e.target.value)}
              className="rounded-md border border-(--border) bg-(--surface) px-3 py-1.5 text-xs font-medium text-(--text-primary) outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
            >
              {BUCKET_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          {data.timestamp && (
            <DataFreshnessBadge generatedAt={data.timestamp} onRefresh={() => refetch()} isRefreshing={isFetching} />
          )}
        </div>
      </div>

      {ks && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold text-white" style={{ background: 'linear-gradient(to right, #2563eb, #9333ea)' }}>
            <span className="text-xs uppercase tracking-wide opacity-70">Total</span>
            <span className="text-lg leading-none">{formatNumber(ks.total ?? 0)}</span>
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
              className="flex items-center gap-2.5 rounded-lg border border-(--border) bg-(--surface) px-3 py-2"
              style={{ borderLeftWidth: '3px', borderLeftColor: item.accent }}
            >
              <span className="text-[10px] font-semibold uppercase tracking-wider text-(--text-muted)">
                {item.label}
              </span>
              <span className="text-base font-bold leading-none" style={{ color: item.accent }}>
                {formatNumber(item.value)}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <SummaryTile
          label="Total WO"
          value={formatNumber(ks?.total ?? 0)}
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

      <RekapWorkorderHourlyClose bucket={selectedBucket} />

      <div className="hidden xl:block">
        <RekapWorkorderTable
          rows={data.rows}
          timestamp={data.timestamp}
          detailMode={selectedBucket !== 'all' ? selectedBucket : undefined}
          overviewSummary={data.workboardSummary}
        />
      </div>

      <div className="xl:hidden">
        <RekapWorkorderCards rows={data.rows} />
      </div>
    </div>
  );
}
