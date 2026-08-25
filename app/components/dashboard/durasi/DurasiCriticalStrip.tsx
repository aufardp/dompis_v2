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

function deriveCriticalSummary(panels: PanelData[]): CriticalSummary {
  let worstArea = '';
  let maxAreaOpen = 0;
  let worstBucket = '';
  let maxBucketTotal = 0;

  for (const panel of panels) {
    for (const area of panel.areas) {
      const areaOpen = (area.sas ?? []).reduce((s, sa) => sa ? s + (sa.counts ?? []).reduce((ss, v) => ss + v, 0) : s, 0);
      if (areaOpen > maxAreaOpen) {
        maxAreaOpen = areaOpen;
        worstArea = area.name;
      }
    }

    // Cari pasangan (panel, bucket) tertinggi memakai skala bucket milik
    // panel itu sendiri — panel beda-beda pakai skala bucket berbeda
    // (mis. MANJA/FFG hari, HSI jam sendiri, lainnya STANDARD_BUCKETS),
    // jadi tidak bisa dijumlah lintas panel berdasarkan index saja.
    panel.totals.forEach((total, idx) => {
      if (total > maxBucketTotal) {
        maxBucketTotal = total;
        worstBucket = `${panel.label} · ${panel.buckets[idx] ?? '-'}`;
      }
    });
  }

  return { worstArea, worstBucket };
}

function StatCard({
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
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: accent }} />
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
        />
        <StatCard
          label={closeLabel}
          value={new Intl.NumberFormat('id-ID').format(summary.close)}
          accent="#e11d48"
        />
        <StatCard
          label={worstAreaLabel}
          value={critical.worstArea || '-'}
          accent="#f59e0b"
        />
        <StatCard
          label={mostLoadedLabel}
          value={critical.worstBucket || '-'}
          accent="#7c3aed"
        />
      </div>
    </div>
  );
}
