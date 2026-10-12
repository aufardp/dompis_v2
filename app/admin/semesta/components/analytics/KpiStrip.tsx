'use client';

import type { SemestaAnalyticsV2Kpi } from '../../hooks/useSemestaAnalyticsV2';

function KpiCardSkeleton() {
  return (
    <div className="bg-surface flex h-[80px] w-[180px] shrink-0 items-center rounded-xl border border-(--border) p-4">
      <div className="space-y-2">
        <div className="h-4 w-24 rounded bg-(--border)" />
        <div className="h-8 w-20 rounded bg-(--border)" />
      </div>
    </div>
  );
}

function KpiCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-surface flex h-[80px] w-[180px] shrink-0 items-center rounded-xl border border-(--border) p-4">
      <div className="flex flex-col gap-1.5">
        <div className="font-outfit text-[11px] font-semibold uppercase text-(--text-muted)">{label}</div>
        <div className="font-dm-sans text-2xl font-bold text-(--text-primary)">{value.toLocaleString('en-US')}</div>
      </div>
    </div>
  );
}

export default function KpiStrip({
  kpi,
  loading,
  error,
}: {
  kpi?: SemestaAnalyticsV2Kpi | null;
  loading?: boolean;
  error?: string | null;
}) {
  const closed = kpi?.closed ?? 0;
  const open = (kpi?.open ?? 0) + (kpi?.onProgress ?? 0);
  const gamas = kpi?.gamas ?? 0;

  if (error && !kpi && !loading) {
    return (
      <div className="flex items-center gap-3 overflow-x-auto pb-2 scrollbar-thin">
        <div className="flex h-[80px] w-full items-center justify-center rounded-xl border border-red-500/20 bg-red-500/5 px-4 text-xs font-medium text-red-400">
          {error.includes('disiapkan') ? 'Data sedang disiapkan...' : 'Gagal memuat data analytics.'}
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin">
      {loading
        ? Array.from({ length: 3 }, (_, i) => <KpiCardSkeleton key={i} />)
        : [
            { label: 'Closed', value: closed },
            { label: 'Open', value: open },
            { label: 'Gamas', value: gamas },
          ].map((item, idx) => <KpiCard key={idx} label={item.label} value={item.value} />)}
    </div>
  );
}