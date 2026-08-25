'use client';

import { useEffect, useState, useMemo } from 'react';
import { ChevronDown } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/app/libs/query-keys';
import { usePersistentBranchScope } from '@/app/hooks/usePersistentBranchScope';
import { useBranchOptions } from '@/app/hooks/useDropdownOptions';
import BranchFilterSelect from '@/app/components/ui/BranchFilterSelect';
import DataFreshnessBadge from '../DataFreshnessBadge';
import TicketDurationPanel from './TicketDurationPanel';
import DurationPanelSkeleton from './DurationPanelSkeleton';
import DurasiCriticalStrip from './DurasiCriticalStrip';
import DurasiHeatmap from './DurasiHeatmap';
import DurasiTicketDetailDrawer from './DurasiTicketDetailDrawer';
import type { DurasiBucketKey, DurasiDetailTarget } from './durasi-types';

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
  open: number;
  assigned: number;
  unassigned: number;
  close: number;
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
  selectedBucket?: DurasiBucketKey;
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

// Panel per bucket ditentukan lewat uji empiris ke data live (bukan
// tebakan): tiap kombinasi bucket x panel dihitung berapa tiket yang
// benar-benar cocok, panel dengan hasil 0 di bucket tsb tidak dicantumkan
// supaya filter bucket benar-benar cuma menampilkan isinya sendiri.
// REGULER/HVC (customer-tier, dimensi customer_type) lintas-bucket karena
// orthogonal terhadap source_ticket/jenis-tiket.
const PANEL_ORDER_BY_BUCKET: Record<string, string[]> = {
  all: [
    'REGULER',
    'HVC_DIAMOND_PLATINUM',
    'HVC_GOLD',
    'MANJA',
    'FFG',
    'SQM_UPDATE',
    'SQM',
    'ANAK_GAMAS',
    'HSI',
    'TSEL',
    'DATIN',
    'UNSPEC',
  ],
  kpi_customer: [
    'REGULER',
    'HVC_DIAMOND_PLATINUM',
    'HVC_GOLD',
    'MANJA',
    'FFG',
    'HSI',
    'TSEL',
    'DATIN',
  ],
  kpi_proactive: [
    'REGULER',
    'HVC_DIAMOND_PLATINUM',
    'HVC_GOLD',
    'SQM',
  ],
  non_kpi_unspec: [
    'REGULER',
    'HVC_DIAMOND_PLATINUM',
    'HVC_GOLD',
    'UNSPEC',
  ],
  non_technical: [
    'REGULER',
    'HVC_DIAMOND_PLATINUM',
    'HVC_GOLD',
    'FFG',
  ],
  sqm_update: [
    'REGULER',
    'HVC_DIAMOND_PLATINUM',
    'HVC_GOLD',
    'SQM_UPDATE',
    'SQM',
  ],
  obsolete: [
    'REGULER',
    'HVC_DIAMOND_PLATINUM',
    'HVC_GOLD',
    'FFG',
  ],
};

function formatNum(n: number): string {
  return new Intl.NumberFormat('id-ID').format(n);
}

export default function DashboardDurasiClient({
  initialBranch = '',
}: {
  initialBranch?: string;
}) {
  const [selectedBucket, setSelectedBucket] = useState<DurasiBucketKey>('all');
  const [detailTarget, setDetailTarget] = useState<DurasiDetailTarget | null>(null);
  const [view, setView] = useState<'table' | 'heatmap'>('table');
  const { branch } = usePersistentBranchScope(initialBranch);

  const queryParams = useMemo(
    () =>
      new URLSearchParams({
        bucket: selectedBucket,
        ...(branch ? { branch } : {}),
      }),
    [selectedBucket, branch],
  );

  const { data, isLoading, isError, refetch, isFetching } = useQuery<DashboardResponse>({
    queryKey: queryKeys.dashboard.durasi({ bucket: selectedBucket, branch }),
    queryFn: async () => {
      const res = await fetch(`/api/dashboard/durasi?${queryParams}`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to fetch');
      }
      return res.json();
    },
    refetchInterval: 60000,
    staleTime: 30000,
  });

  useEffect(() => {
    setDetailTarget(null);
  }, [selectedBucket]);

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
  const selectedBucketLabel =
    BUCKET_OPTIONS.find((opt) => opt.value === data.selectedBucket)?.label ??
    'All';
  const kpiSummary = data.kpiSummary ?? {
    total: 0,
    open: 0,
    assigned: 0,
    unassigned: 0,
    close: 0,
    kpiCustomer: 0,
    kpiProactive: 0,
    nonKpiUnspec: 0,
    nonTechnical: 0,
    sqmUpdate: 0,
    obsolete: 0,
  };
  const panelOrder = [
    ...(PANEL_ORDER_BY_BUCKET[data.selectedBucket ?? 'all'] ?? PANEL_ORDER_BY_BUCKET.all),
  ];
  const visiblePanels = panelOrder
    .map((type) => getPanel(type))
    .filter((panel): panel is PanelData => Boolean(panel));

  return (
    <div className="space-y-5">
      <section className="rounded-3xl border border-(--border) bg-(--surface) p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-bold tracking-[0.22em] text-(--text-muted) uppercase">
                Monitoring Durasi
              </p>
              <h1 className="mt-1 text-xl font-semibold tracking-tight text-(--text-primary)">
                Distribusi tiket per bucket durasi
              </h1>
            </div>
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

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3 sm:max-w-md">
            <label className="block">
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.18em] text-(--text-muted)">
                Bucket
              </span>
              <div className="relative">
                <select
                  value={selectedBucket}
                  onChange={(e) => setSelectedBucket(e.target.value as DurasiBucketKey)}
                  className="w-full cursor-pointer appearance-none rounded-2xl border border-(--border) bg-(--surface) px-4 py-2.5 pr-10 text-sm text-(--text-primary) shadow-sm transition-colors hover:bg-(--surface-2) focus:border-blue-500 focus:outline-none"
                >
                  {BUCKET_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute top-3 right-3 h-4 w-4 text-(--text-muted)" />
              </div>
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.18em] text-(--text-muted)">
                Branch
              </span>
              <BranchFilterSelect className="block w-full" initialBranch={branch} />
            </label>
          </div>
        </div>
      </section>

      {/* Critical summary strip */}
      {data.panels.length > 0 && (
        <DurasiCriticalStrip
          panels={data.panels}
          summary={kpiSummary}
          bucketLabel={selectedBucketLabel}
          isAllBucket={data.selectedBucket === 'all'}
        />
      )}

      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-bold tracking-[0.18em] text-(--text-muted) uppercase">
          {view === 'table' ? `${visiblePanels.length} panel` : 'Heat-map durasi per service area'}
        </p>
        <div className="inline-flex shrink-0 rounded-full border border-(--border) bg-(--surface-2) p-0.5 text-[11px] font-semibold">
          <button
            type="button"
            onClick={() => setView('table')}
            className={`rounded-full px-3 py-1 transition-colors ${view === 'table' ? 'bg-(--surface) text-(--text-primary) shadow-sm' : 'text-(--text-muted)'}`}
          >
            Tabel
          </button>
          <button
            type="button"
            onClick={() => setView('heatmap')}
            className={`rounded-full px-3 py-1 transition-colors ${view === 'heatmap' ? 'bg-(--surface) text-(--text-primary) shadow-sm' : 'text-(--text-muted)'}`}
          >
            Heat-map
          </button>
        </div>
      </div>

      {view === 'table' ? (
        <div className="space-y-4">
          {visiblePanels.map((panel) => (
            <TicketDurationPanel
              key={panel.type}
              panel={panel}
              defaultOpen={false}
              bucketKey={data.selectedBucket ?? 'all'}
              bucketLabel={selectedBucketLabel}
              isAllBucket={data.selectedBucket === 'all'}
              onCellClick={setDetailTarget}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-(--border) bg-(--surface) p-3 shadow-sm sm:p-4">
          <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[10px] text-(--text-muted)">
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-emerald-500/80" />Segar</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-yellow-500/80" />Menengah</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-red-600/85" />Lama / EXPIRED</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-(--surface-2)" />Tidak ada tiket</span>
          </div>
          <DurasiHeatmap
            panels={visiblePanels}
            bucketKey={data.selectedBucket ?? 'all'}
            bucketLabel={selectedBucketLabel}
            onCellClick={setDetailTarget}
          />
        </div>
      )}

      <DurasiTicketDetailDrawer
        open={Boolean(detailTarget)}
        target={detailTarget}
        onClose={() => setDetailTarget(null)}
        branch={branch || undefined}
      />
    </div>
  );
}
