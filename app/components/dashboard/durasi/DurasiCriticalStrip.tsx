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
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-2.5 rounded-lg border border-(--border) bg-(--surface) px-4 py-2.5">
        <div className="flex h-2 w-2 rounded-full bg-blue-500" />
        <span className="text-xs font-medium text-(--text-muted)">Total Open</span>
        <span className="text-base font-bold text-(--text-primary)">{summary.totalOpen}</span>
      </div>
      <div className="flex items-center gap-2.5 rounded-lg border border-(--border) bg-(--surface) px-4 py-2.5">
        <div className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
        </div>
        <span className="text-xs font-medium text-(--text-muted)">Critical (bucket 5+)</span>
        <span className="text-base font-bold text-red-500">{summary.criticalCount}</span>
      </div>
      <div className="flex items-center gap-2.5 rounded-lg border border-(--border) bg-(--surface) px-4 py-2.5">
        <div className="flex h-2 w-2 rounded-full bg-amber-500" />
        <span className="text-xs font-medium text-(--text-muted)">Worst Area</span>
        <span className="text-sm font-bold text-(--text-primary) truncate max-w-32">{summary.worstArea}</span>
      </div>
      <div className="flex items-center gap-2.5 rounded-lg border border-(--border) bg-(--surface) px-4 py-2.5">
        <div className="flex h-2 w-2 rounded-full bg-violet-500" />
        <span className="text-xs font-medium text-(--text-muted)">Most Loaded</span>
        <span className="text-sm font-bold text-(--text-primary)">{summary.worstBucket}</span>
      </div>
    </div>
  );
}
