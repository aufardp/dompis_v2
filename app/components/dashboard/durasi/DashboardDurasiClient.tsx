'use client';

import { useEffect, useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/app/libs/query-keys';
import { usePersistentBranchScope } from '@/app/hooks/usePersistentBranchScope';
import { useBranchOptions } from '@/app/hooks/useDropdownOptions';
import BranchFilterSelect from '@/app/components/ui/BranchFilterSelect';
import DataFreshnessBadge from '../DataFreshnessBadge';
import TicketDurationPanel from './TicketDurationPanel';
import DurationPanelSkeleton from './DurationPanelSkeleton';
import DurasiCriticalStrip from './DurasiCriticalStrip';
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
  ],
  kpi_customer: [
    'REGULER',
    'HVC_DIAMOND_PLATINUM',
    'HVC_GOLD',
    'MANJA',
    'FFG',
    'SQM',
    'ANAK_GAMAS',
    'HSI',
  ],
  kpi_proactive: [
    'SQM_UPDATE',
    'SQM',
    'MANJA',
    'FFG',
    'ANAK_GAMAS',
    'HSI',
  ],
  non_kpi_unspec: [
    'MANJA',
    'FFG',
    'SQM',
    'ANAK_GAMAS',
    'HSI',
  ],
  non_technical: [
    'MANJA',
    'FFG',
    'SQM',
    'ANAK_GAMAS',
    'HSI',
  ],
  sqm_update: [
    'SQM_UPDATE',
    'SQM',
    'MANJA',
    'FFG',
    'ANAK_GAMAS',
    'HSI',
  ],
  obsolete: [
    'MANJA',
    'FFG',
    'SQM',
    'ANAK_GAMAS',
    'HSI',
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
    refetchInterval: 300000,
    staleTime: 120000,
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
                  onChange={(e) => setSelectedBucket(e.target.value as DurasiBucketKey)}
                  className="min-w-36 cursor-pointer rounded-lg border border-(--border) bg-(--surface) px-3 py-1.5 text-xs font-medium text-(--text-primary) outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {BUCKET_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-2xl border border-(--border) bg-(--surface-2) px-3 py-2">
                <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-(--text-muted)">
                  Branch
                </span>
                <BranchFilterSelect
                  className="min-w-36"
                  initialBranch={branch}
                />
              </div>
            </div>
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

      <div className="space-y-4">
        {visiblePanels.map((panel) => (
          <TicketDurationPanel
            key={panel.type}
            panel={panel}
            defaultOpen
            bucketKey={data.selectedBucket ?? 'all'}
            bucketLabel={selectedBucketLabel}
            isAllBucket={data.selectedBucket === 'all'}
            onCellClick={setDetailTarget}
          />
        ))}
      </div>

      <DurasiTicketDetailDrawer
        open={Boolean(detailTarget)}
        target={detailTarget}
        onClose={() => setDetailTarget(null)}
        branch={branch || undefined}
      />
    </div>
  );
}
