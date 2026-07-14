'use client';

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

interface CriticalSummary {
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
  let worstArea = '';
  let maxAreaOpen = 0;
  const bucketSums: Record<number, number> = {};

  for (const panel of panels) {
    for (const area of panel.areas) {
      const areaOpen = (area.sas ?? []).reduce((s, sa) => sa ? s + (sa.counts ?? []).reduce((ss, v) => ss + v, 0) : s, 0);
      if (areaOpen > maxAreaOpen) {
        maxAreaOpen = areaOpen;
        worstArea = area.name;
      }
    }

    panel.totals.forEach((total, idx) => {
      bucketSums[idx] = (bucketSums[idx] ?? 0) + total;
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

  return { worstArea, worstBucket };
}

function StatCard({
  label,
  value,
  accent,
  note,
}: {
  label: string;
  value: string;
  accent: string;
  note?: string;
}) {
  return (
    <div className="rounded-2xl border border-(--border) bg-(--surface) px-3.5 py-3 shadow-sm">
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: accent }} />
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-(--text-muted)">
          {label}
        </span>
      </div>
      <div className="mt-2 text-xl font-semibold tracking-tight text-(--text-primary)">
        {value}
      </div>
      {note && (
        <div className="mt-1 text-[11px] text-(--text-muted)">
          {note}
        </div>
      )}
    </div>
  );
}

interface DurasiCriticalStripProps {
  panels: PanelData[];
  summary: KpiSummaryCounts;
  bucketLabel: string;
  isAllBucket: boolean;
}

export default function DurasiCriticalStrip({ panels, summary, bucketLabel, isAllBucket }: DurasiCriticalStripProps) {
  const critical = deriveCriticalSummary(panels);
  const openLabel = isAllBucket ? 'Open' : `Open in ${bucketLabel}`;
  const closeLabel = isAllBucket ? 'Close' : `Close in ${bucketLabel}`;
  const worstAreaLabel = isAllBucket ? 'Worst area' : `Worst area in ${bucketLabel}`;
  const mostLoadedLabel = isAllBucket ? 'Most loaded' : `Most loaded in ${bucketLabel}`;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <StatCard
          label={openLabel}
          value={new Intl.NumberFormat('id-ID').format(summary.open)}
          accent="#2563eb"
          note="ticket aktif dalam scope bucket"
        />
        <StatCard
          label={closeLabel}
          value={new Intl.NumberFormat('id-ID').format(summary.close)}
          accent="#e11d48"
          note="ticket closed dalam scope bucket"
        />
        <StatCard
          label={worstAreaLabel}
          value={critical.worstArea || '-'}
          accent="#f59e0b"
          note="service area dengan beban tertinggi"
        />
        <StatCard
          label={mostLoadedLabel}
          value={critical.worstBucket || '-'}
          accent="#7c3aed"
          note="bucket durasi paling padat"
        />
      </div>
    </div>
  );
}
