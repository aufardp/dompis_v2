'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/app/libs/query-keys';
import DataFreshnessBadge from '../DataFreshnessBadge';
import TicketDurationPanel from './TicketDurationPanel';
import DurationPanelSkeleton from './DurationPanelSkeleton';
import DurasiCriticalStrip from './DurasiCriticalStrip';

interface PanelData {
  type: string;
  label: string;
  buckets: string[];
  areas: { name: string; region: string; sas: { name: string; counts: number[] }[] }[];
  totals: number[];
  grandTotal?: number;
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

interface DashboardResponse {
  syncDate: string | null;
  generatedAt: string;
  panels: PanelData[];
  kpiSummary?: KpiSummaryCounts;
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

const KPI_ACCENT: Record<string, string> = {
  'Customer': '#3b82f6',
  'Proactive': '#a855f7',
  'Unspec': '#64748b',
  'Non Technical': '#e11d48',
  'SQM Update': '#7c3aed',
  'Obsolete': '#f43f5e',
};

function formatNum(n: number): string {
  return new Intl.NumberFormat('id-ID').format(n);
}

export default function DashboardDurasiClient() {
  const [selectedBucket, setSelectedBucket] = useState('all');

  const queryParams = useMemo(() => new URLSearchParams({ bucket: selectedBucket }), [selectedBucket]);

  const { data, isLoading, isError, refetch, isFetching } = useQuery<DashboardResponse>({
    queryKey: queryKeys.dashboard.durasi(selectedBucket),
    queryFn: async () => {
      const res = await fetch(`/api/dashboard/durasi?${queryParams}`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to fetch');
      }
      return res.json();
    },
    refetchInterval: 300000,
    staleTime: 120000,
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="xl:col-span-2"><DurationPanelSkeleton /></div>
        <DurationPanelSkeleton />
        <DurationPanelSkeleton />
        <DurationPanelSkeleton />
        <DurationPanelSkeleton />
        <div className="xl:col-span-2"><DurationPanelSkeleton /></div>
        <DurationPanelSkeleton />
        <DurationPanelSkeleton />
      </div>
    );
  }

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

  if (!data?.panels?.length) {
    return (
      <div className="flex flex-col items-center gap-3 py-12">
        <p className="text-sm text-(--text-muted)">
          Tidak ada Service Area yang dikonfigurasi untuk akun ini
        </p>
      </div>
    );
  }

  const panelMap = new Map(data.panels.map((p) => [p.type, p]));
  const getPanel = (type: string) => panelMap.get(type);
  const ks = data.kpiSummary;
  const summaryCards = ks
    ? [
        { label: 'Total', value: formatNum(ks.total ?? 0), accent: 'from-blue-600 to-purple-600' },
        { label: 'Customer', value: formatNum(ks.kpiCustomer), accent: KPI_ACCENT['Customer'] },
        { label: 'Proactive', value: formatNum(ks.kpiProactive), accent: KPI_ACCENT['Proactive'] },
        { label: 'Unspec', value: formatNum(ks.nonKpiUnspec), accent: KPI_ACCENT['Unspec'] },
        { label: 'Non Technical', value: formatNum(ks.nonTechnical), accent: KPI_ACCENT['Non Technical'] },
        { label: 'SQM Update', value: formatNum(ks.sqmUpdate), accent: KPI_ACCENT['SQM Update'] },
        { label: 'Obsolete', value: formatNum(ks.obsolete), accent: KPI_ACCENT['Obsolete'] },
      ]
    : [];

  return (
    <div className="space-y-4">
      {data.generatedAt && (
        <DataFreshnessBadge generatedAt={data.generatedAt} onRefresh={() => refetch()} isRefreshing={isFetching} />
      )}

      {/* KPI Summary — left-accent border chips */}
      {summaryCards.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {summaryCards.map((card) => {
            const isGradient = card.accent.startsWith('from-');
            return (
              <div
                key={card.label}
                className={`flex items-center gap-2.5 rounded-lg border border-(--border) bg-(--surface) px-3 py-2 ${isGradient ? 'bg-linear-to-r text-white' : ''}`}
                style={isGradient ? { background: 'linear-gradient(to right, #2563eb, #9333ea)' } : { borderLeftWidth: '3px', borderLeftColor: card.accent }}
              >
                <span className="text-[10px] font-semibold uppercase tracking-wider text-(--text-muted)">
                  {card.label}
                </span>
                <span className={`text-base font-bold leading-none ${isGradient ? 'text-white' : 'text-(--text-primary)'}`}>
                  {card.value}
                </span>
              </div>
            );
          })}

          {/* KPI filter — dropdown */}
          <div className="ml-auto flex items-center gap-2">
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
        </div>
      )}

      {/* Critical summary strip */}
      {data.panels.length > 0 && (
        <DurasiCriticalStrip panels={data.panels} />
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="xl:col-span-2">
          {getPanel('REGULER') && <TicketDurationPanel panel={getPanel('REGULER')!} />}
        </div>
        {getPanel('HVC_DIAMOND_PLATINUM') && <TicketDurationPanel panel={getPanel('HVC_DIAMOND_PLATINUM')!} />}
        {getPanel('HVC_GOLD') && <TicketDurationPanel panel={getPanel('HVC_GOLD')!} />}
        {getPanel('MANJA') && <TicketDurationPanel panel={getPanel('MANJA')!} />}
        {getPanel('FFG') && <TicketDurationPanel panel={getPanel('FFG')!} />}
        <div className="xl:col-span-2">
          {getPanel('SQM') && <TicketDurationPanel panel={getPanel('SQM')!} />}
        </div>
        {getPanel('ANAK_GAMAS') && <TicketDurationPanel panel={getPanel('ANAK_GAMAS')!} />}
        {getPanel('HSI') && <TicketDurationPanel panel={getPanel('HSI')!} />}
      </div>
    </div>
  );
}
