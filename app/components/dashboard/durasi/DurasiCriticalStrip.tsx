'use client';

interface PanelData {
  type: string;
  label: string;
  buckets: string[];
  areas: { name: string; region: string; sas: { name: string; counts: number[] }[] }[];
  totals: number[];
  grandTotal?: number;
}

interface CriticalSummary {
  totalOpen: number;
  criticalCount: number;
  worstArea: string;
  worstBucket: string;
}

const BUCKET_LABELS: Record<string, string> = {
  '<1hari': '<1 Hari',
  '1-3hari': '1-3 Hari',
  '3-7hari': '3-7 Hari',
  '>7hari': '>7 Hari',
};

function deriveCriticalSummary(panels: PanelData[]): CriticalSummary {
  let totalOpen = 0;
  let criticalCount = 0;
  let worstArea = '';
  let maxAreaOpen = 0;
  const bucketSums: Record<number, number> = {};

  for (const panel of panels) {
    for (const area of panel.areas) {
      const areaOpen = area.sas.reduce((s, sa) => s + sa.counts.reduce((ss, v) => ss + v, 0), 0);
      if (areaOpen > maxAreaOpen) {
        maxAreaOpen = areaOpen;
        worstArea = area.name;
      }
    }
    for (const sa of panel.areas.flatMap(a => a.sas)) {
      totalOpen += sa.counts.reduce((s, v) => s + v, 0);
    }
    panel.totals.forEach((total, idx) => {
      bucketSums[idx] = (bucketSums[idx] ?? 0) + total;
      if (idx >= 3) {
        criticalCount += total;
      }
    });
  }

  let worstBucket = '';
  let maxBucket = 0;
  for (const [idx, sum] of Object.entries(bucketSums)) {
    const label = panels[0]?.buckets[Number(idx)];
    if (sum > maxBucket && label) {
      maxBucket = sum;
      worstBucket = BUCKET_LABELS[label] ?? label;
    }
  }

  return { totalOpen, criticalCount, worstArea, worstBucket };
}

interface DurasiCriticalStripProps {
  panels: PanelData[];
}

export default function DurasiCriticalStrip({ panels }: DurasiCriticalStripProps) {
  const summary = deriveCriticalSummary(panels);

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <div className="flex items-center gap-2.5 rounded-2xl border border-(--border) bg-(--surface) px-3.5 py-2.5 sm:px-4 sm:py-3">
        <div className="h-2.5 w-2.5 rounded-full bg-amber-500" />
        <div className="min-w-0">
          <span className="block text-[10px] font-semibold uppercase tracking-[0.18em] text-(--text-muted)">
            Worst area
          </span>
          <span className="block truncate text-[1.05rem] font-semibold text-(--text-primary)">
            {summary.worstArea || '-'}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2.5 rounded-2xl border border-(--border) bg-(--surface) px-3.5 py-2.5 sm:px-4 sm:py-3">
        <div className="h-2.5 w-2.5 rounded-full bg-violet-500" />
        <div className="min-w-0">
          <span className="block text-[10px] font-semibold uppercase tracking-[0.18em] text-(--text-muted)">
            Most loaded
          </span>
          <span className="block text-[1.05rem] font-semibold text-(--text-primary)">
            {summary.worstBucket || '-'}
          </span>
        </div>
      </div>
    </div>
  );
}
