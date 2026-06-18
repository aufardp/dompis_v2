'use client';

import '@aejkatappaja/phantom-ui';
import { useMemo } from 'react';
import { cn } from '@/app/libs/utils';
import { AlertTriangle, Repeat, Shield } from 'lucide-react';
import type { SemestaAnalyticsV2Kpi } from '../../hooks/useSemestaAnalyticsV2';

type CardDef = {
  key: keyof SemestaAnalyticsV2Kpi;
  label: string;
  accent: string;
  dot: string;
  pill: string;
  icon?: React.ReactNode;
  warning?: boolean;
  pctOf?: 'total';
};

const CARDS: CardDef[] = [
  { key: 'total', label: 'Total', accent: 'from-blue-500/20 via-indigo-500/10 to-transparent', dot: 'bg-blue-400', pill: 'bg-blue-500/10 text-blue-300' },
  { key: 'open', label: 'Open', accent: 'from-red-500/20 via-rose-500/10 to-transparent', dot: 'bg-red-400', pill: 'bg-red-500/10 text-red-300', pctOf: 'total' },
  { key: 'onProgress', label: 'On Progress', accent: 'from-amber-500/20 via-orange-500/10 to-transparent', dot: 'bg-amber-400', pill: 'bg-amber-500/10 text-amber-300', pctOf: 'total' },
  { key: 'closed', label: 'Closed', accent: 'from-emerald-500/20 via-teal-500/10 to-transparent', dot: 'bg-emerald-400', pill: 'bg-emerald-500/10 text-emerald-300', pctOf: 'total' },
  { key: 'gaul', label: 'GAUL', accent: 'from-amber-500/20 via-yellow-500/10 to-transparent', dot: 'bg-amber-400', pill: 'bg-amber-500/10 text-amber-300', icon: <AlertTriangle size={14} />, warning: true },
  { key: 'lapul', label: 'LAPUL', accent: 'from-orange-500/20 via-amber-500/10 to-transparent', dot: 'bg-orange-400', pill: 'bg-orange-500/10 text-orange-300', icon: <Repeat size={14} />, warning: true },
  { key: 'gamas', label: 'Gamas', accent: 'from-cyan-500/20 via-teal-500/10 to-transparent', dot: 'bg-cyan-400', pill: 'bg-cyan-500/10 text-cyan-300', icon: <Shield size={14} /> },
  { key: 'sqm', label: 'SQM', accent: 'from-violet-500/20 via-purple-500/10 to-transparent', dot: 'bg-violet-400', pill: 'bg-violet-500/10 text-violet-300', pctOf: 'total' },
  { key: 'sqmCcan', label: 'SQM-CCAN', accent: 'from-purple-500/20 via-fuchsia-500/10 to-transparent', dot: 'bg-purple-400', pill: 'bg-purple-500/10 text-purple-300', pctOf: 'total' },
  { key: 'unspec', label: 'Unspec', accent: 'from-slate-500/20 via-gray-500/10 to-transparent', dot: 'bg-slate-400', pill: 'bg-slate-500/10 text-slate-300', pctOf: 'total' },
  { key: 'unspecB2b', label: 'Unspec B2B', accent: 'from-slate-500/20 via-red-500/10 to-transparent', dot: 'bg-red-400', pill: 'bg-red-500/10 text-red-300', pctOf: 'total' },
];

function KpiCardSkeleton() {
  return (
    <div className="bg-surface group relative flex shrink-0 flex-col gap-2 overflow-hidden rounded-xl border border-(--border) p-4 w-[180px]">
      <div className="bg-surface-2 h-5 w-20 rounded-full" />
      <div className="bg-surface-2 mt-1 h-8 w-16 rounded-lg" />
    </div>
  );
}

function KpiCard({ def, value, total }: { def: CardDef; value: number; total: number }) {
  const pct = def.pctOf === 'total' && total > 0 ? ((value / total) * 100).toFixed(1) : null;

  return (
    <div
      className={cn(
        "bg-surface group relative shrink-0 overflow-hidden rounded-xl border border-(--border) p-4 w-[180px]",
        "transition-all duration-300 ease-in-out hover:scale-[1.02] hover:border-white/10",
        def.warning && value > 0 && "ring-1 ring-amber-500/30",
      )}
    >
      <div className={cn("pointer-events-none absolute inset-0 opacity-80 bg-gradient-to-br", def.accent)} />
      <div className="relative flex flex-col gap-1.5">
        <div className={cn("font-outfit inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold tracking-[1.2px] uppercase w-fit", def.pill)}>
          <span className={cn("h-2 w-2 rounded-full shrink-0", def.dot)} />
          {def.icon && <span className="shrink-0">{def.icon}</span>}
          {def.label}
        </div>
        <div className="font-dm-sans text-2xl font-bold tracking-[-0.3px] text-(--text-primary)">
          {value.toLocaleString('en-US')}
        </div>
          {pct !== null && (
          <div className="font-outfit text-[11px] text-(--text-muted)">
            {pct.replace('.', ',')}% dari total
          </div>
        )}
      </div>
    </div>
  );
}

export default function KpiStrip({
  kpi,
  loading,
}: {
  kpi?: SemestaAnalyticsV2Kpi | null;
  loading?: boolean;
}) {
  const total = kpi?.total ?? 0;

  const skeletonCards = useMemo(
    () => Array.from({ length: 11 }, (_, i) => <KpiCardSkeleton key={i} />),
    [],
  );

  return (
    <phantom-ui suppressHydrationWarning fallback-radius={8}
      loading={loading || !kpi}
      animation='shimmer'
      reveal={0.12}
      loading-label='Loading KPI strip'
    >
      <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin">
        {loading || !kpi
          ? skeletonCards
          : CARDS.map((def) => (
              <KpiCard
                key={def.key}
                def={def}
                value={kpi[def.key] ?? 0}
                total={total}
              />
            ))}
      </div>
    </phantom-ui>
  );
}
