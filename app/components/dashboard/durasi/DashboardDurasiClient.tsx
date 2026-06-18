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

function SummaryCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <div className="rounded-2xl border border-(--border) bg-(--surface) px-3.5 py-3 shadow-sm">
      <div className="flex items-center gap-2">
        <span
          className="h-2 w-2 rounded-full"
          style={{ backgroundColor: accent }}
        />
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-(--text-muted)">
          {label}
        </span>
      </div>
      <div className="mt-2 text-xl font-semibold tracking-tight text-(--text-primary)">
        {value}
      </div>
    </div>
  );
}

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
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
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
        { label: 'Total', value: formatNum(ks.total ?? 0), accent: '#2563eb' },
        { label: 'Customer', value: formatNum(ks.kpiCustomer), accent: KPI_ACCENT['Customer'] },
        { label: 'Proactive', value: formatNum(ks.kpiProactive), accent: KPI_ACCENT['Proactive'] },
        { label: 'Unspec', value: formatNum(ks.nonKpiUnspec), accent: KPI_ACCENT['Unspec'] },
        { label: 'Non Technical', value: formatNum(ks.nonTechnical), accent: KPI_ACCENT['Non Technical'] },
        { label: 'SQM Update', value: formatNum(ks.sqmUpdate), accent: KPI_ACCENT['SQM Update'] },
        { label: 'Obsolete', value: formatNum(ks.obsolete), accent: KPI_ACCENT['Obsolete'] },
      ]
    : [];

  return (
    <div className="space-y-5">
      <section className="rounded-3xl border border-(--border) bg-(--surface) p-4 shadow-sm">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <p className="text-[10px] font-bold tracking-[0.22em] text-(--text-muted) uppercase">
              Monitoring Durasi
            </p>
            {data.generatedAt && (
              <div className="shrink-0">
                <DataFreshnessBadge
                  generatedAt={data.generatedAt}
                  onRefresh={() => refetch()}
                  isRefreshing={isFetching}
                />
              </div>
            )}
          </div>

          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0 max-w-2xl">
              <h1 className="text-xl font-semibold tracking-tight text-(--text-primary)">
                Distribusi tiket per bucket durasi
              </h1>
              <p className="mt-1.5 max-w-2xl text-sm leading-6 text-(--text-secondary)">
                Tampilan ini memadatkan status durasi supaya pola open dan bucket kritis mudah dipindai tanpa elemen visual yang berlebihan.
              </p>
            </div>

            <div className="flex flex-col gap-2 lg:min-w-[18rem]">
              <div className="flex items-center justify-between gap-3 rounded-2xl border border-(--border) bg-(--surface-2) px-3 py-2">
                <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-(--text-muted)">
                  Bucket view
                </span>
                <select
                  value={selectedBucket}
                  onChange={(e) => setSelectedBucket(e.target.value)}
                  className="min-w-36 cursor-pointer rounded-lg border border-(--border) bg-(--surface) px-3 py-1.5 text-xs font-medium text-(--text-primary) outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {BUCKET_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>

        {summaryCards.length > 0 && (
          <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-7">
            {summaryCards.map((card) => (
              <SummaryCard
                key={card.label}
                label={card.label}
                value={card.value}
                accent={card.accent}
              />
            ))}
          </div>
        )}
      </section>

      {/* Critical summary strip */}
      {data.panels.length > 0 && (
        <DurasiCriticalStrip panels={data.panels} />
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
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
