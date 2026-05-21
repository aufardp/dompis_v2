'use client';

import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Activity, CheckCircle2, Clock3, RefreshCw, Users } from 'lucide-react';
import DataFreshnessBadge from '../DataFreshnessBadge';
import RekapWorkorderTable from './RekapWorkorderTable';
import RekapWorkorderCards from './RekapWorkorderCards';
import RekapSkeleton from './RekapSkeleton';

interface SegCount { open: number; close: number; }

interface WorkzoneRow {
  workzone: string;
  b2c: { diamond: SegCount; platinum: SegCount; goldReg: SegCount; sqmB2c: SegCount; };
  b2b: { datin: SegCount; nonDatin: SegCount; sqmB2b: SegCount; tsel: SegCount; };
  totalOpen: number;
  totalClose: number;
}

interface SARow {
  no: number;
  area: string;
  saName: string;
  teknisiMasuk: number;
  woPerTeknisi: string;
  b2c: { diamond: SegCount; platinum: SegCount; goldReg: SegCount; sqmB2c: SegCount; };
  b2b: { datin: SegCount; nonDatin: SegCount; sqmB2b: SegCount; tsel: SegCount; };
  workzones: WorkzoneRow[];
  totalOpen: number;
  totalClose: number;
  grandTotal: number;
  jenisTiket: Record<string, SegCount>;
}

interface RekapResponse {
  title: string;
  subtitle: string;
  timestamp: string;
  syncDate: string;
  rows: SARow[];
  totals: Record<string, number>;
  error?: string;
}

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

function SummaryTile({
  label,
  value,
  sub,
  tone,
  icon,
}: {
  label: string;
  value: string;
  sub: string;
  tone: 'slate' | 'red' | 'green' | 'blue';
  icon: ReactNode;
}) {
  const toneClass = {
    slate: 'border-slate-200 bg-white text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100',
    red: 'border-red-200 bg-red-50 text-red-950 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-100',
    green: 'border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-100',
    blue: 'border-sky-200 bg-sky-50 text-sky-950 dark:border-sky-900/60 dark:bg-sky-950/30 dark:text-sky-100',
  }[tone];

  return (
    <div className={`rounded-lg border px-4 py-3 ${toneClass}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          {label}
        </p>
        <div className="text-slate-500 dark:text-slate-400">{icon}</div>
      </div>
      <div className="mt-2 flex items-end justify-between gap-3">
        <p className="text-2xl font-bold leading-none">{value}</p>
        <p className="text-right text-xs text-slate-500 dark:text-slate-400">{sub}</p>
      </div>
    </div>
  );
}

export default function RekapWorkorderClient() {
  const { data, isLoading, isError, refetch, isFetching } = useQuery<RekapResponse>({
    queryKey: ['dashboard-rekap-workorder'],
    queryFn: async () => {
      const res = await fetch('/api/dashboard/rekap-workorder');
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
        <p className="text-sm text-gray-600 dark:text-gray-400">
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
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Tidak ada Service Area yang dikonfigurasi untuk akun ini
        </p>
      </div>
    );
  }

  const summary = computeSummary(data.rows);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-950 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-bold text-slate-950 dark:text-slate-50">{data.title}</h2>
            <span className="rounded border border-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-500 dark:border-slate-700 dark:text-slate-400">
              {data.syncDate}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{data.subtitle}</p>
        </div>
        {data.timestamp && (
          <DataFreshnessBadge generatedAt={data.timestamp} onRefresh={() => refetch()} isRefreshing={isFetching} />
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <SummaryTile
          label="Total WO"
          value={formatNumber(summary.total)}
          sub={`${data.rows.length} service area`}
          tone="slate"
          icon={<Activity className="h-4 w-4" />}
        />
        <SummaryTile
          label="Open"
          value={formatNumber(summary.open)}
          sub="perlu ditangani"
          tone="red"
          icon={<Clock3 className="h-4 w-4" />}
        />
        <SummaryTile
          label="Close"
          value={formatNumber(summary.close)}
          sub={`${summary.closeRate}% closure`}
          tone="green"
          icon={<CheckCircle2 className="h-4 w-4" />}
        />
        <SummaryTile
          label="Teknisi"
          value={formatNumber(summary.teknisi)}
          sub="absen hari ini"
          tone="blue"
          icon={<Users className="h-4 w-4" />}
        />
        <SummaryTile
          label="WO/Teknisi"
          value={summary.woPerTeknisi}
          sub="open load"
          tone="slate"
          icon={<RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />}
        />
      </div>

      <div className="hidden xl:block">
        <RekapWorkorderTable rows={data.rows} timestamp={data.timestamp} />
      </div>

      <div className="xl:hidden">
        <RekapWorkorderCards rows={data.rows} />
      </div>
    </div>
  );
}
