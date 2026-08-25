import DurationTable from './DurationTable';
import { useEffect, useMemo, useState } from 'react';
import type { DurasiDetailTarget, DurasiBucketKey, DurasiPanelType } from './durasi-types';

interface SASummary { name: string; counts: number[]; }
interface PanelArea { name: string; region: string; sas: SASummary[]; }

interface PanelData {
  type: string;
  label: string;
  buckets: string[];
  areas: PanelArea[];
  totals: number[];
  grandTotal?: number;
}

interface TicketDurationPanelProps {
  panel: PanelData;
  defaultOpen?: boolean;
  bucketKey: DurasiBucketKey;
  bucketLabel: string;
  isAllBucket: boolean;
  onCellClick?: (target: DurasiDetailTarget) => void;
}

const PANEL_ACCENT: Record<string, string> = {
  REGULER: '#3b82f6',
  HVC_DIAMOND_PLATINUM: '#22d3ee',
  HVC_GOLD: '#f59e0b',
  MANJA: '#f87171',
  FFG: '#34d399',
  SQM_UPDATE: '#8b5cf6',
  SQM: '#a78bfa',
  ANAK_GAMAS: '#fb923c',
  HSI: '#94a3b8',
  TSEL: '#f43f5e',
  DATIN: '#06b6d4',
  UNSPEC: '#64748b',
};

const BUCKET_COLORS = [
  'rgba(16, 185, 129, 0.85)',
  'rgba(132, 204, 22, 0.85)',
  'rgba(234, 179, 8, 0.85)',
  'rgba(249, 115, 22, 0.85)',
  'rgba(239, 68, 68, 0.85)',
  'rgba(153, 27, 27, 0.85)',
];

function formatNum(n: number): string {
  return new Intl.NumberFormat('id-ID').format(n);
}

export default function TicketDurationPanel({
  panel,
  defaultOpen = false,
  bucketKey,
  bucketLabel,
  isAllBucket,
  onCellClick,
}: TicketDurationPanelProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  useEffect(() => {
    setIsOpen(defaultOpen);
  }, [defaultOpen, panel.type]);

  const accent = PANEL_ACCENT[panel.type] ?? '#6b7280';
  const grandTotal = panel.totals.reduce((s, v) => s + v, 0);
  const dominantBucket = useMemo(() => {
    let max = -1;
    let idx = 0;
    panel.totals.forEach((total, i) => {
      if (total > max) {
        max = total;
        idx = i;
      }
    });
    return { label: panel.buckets[idx] ?? '-', total: max > 0 ? max : 0 };
  }, [panel.buckets, panel.totals]);

  const topArea = useMemo(() => {
    let bestName = '-';
    let bestCount = 0;
    for (const area of panel.areas) {
      const areaCount = (area.sas ?? []).reduce((sum, sa) => sa ? sum + (sa.counts ?? []).reduce((s, v) => s + v, 0) : sum, 0);
      if (areaCount > bestCount) {
        bestCount = areaCount;
        bestName = area.name;
      }
    }
    return { name: bestName, count: bestCount };
  }, [panel.areas]);
  const topAreaLabel = isAllBucket ? 'Top area' : `Top area in ${bucketLabel}`;
  const dominantLabel = isAllBucket ? 'Dominan' : `Dominan di ${bucketLabel}`;

  return (
    <div className="overflow-hidden rounded-2xl border border-(--border) bg-(--surface) shadow-sm">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex w-full items-start gap-3 border-b border-(--border) bg-(--surface-2) px-3 py-2.5 text-left transition-colors hover:bg-(--surface-3)/50 sm:px-4 sm:py-3"
      >
        <div className="mt-0.5 h-3.5 w-1 rounded-full shrink-0" style={{ background: accent }} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h2 className="truncate text-[11px] font-semibold uppercase tracking-[0.16em] text-(--text-secondary) sm:text-xs sm:tracking-[0.18em]">
              Durasi Tiket {panel.label}
            </h2>
            <span className="rounded-full border border-(--border) bg-(--surface) px-2 py-0.5 text-[10px] font-semibold text-(--text-primary) sm:text-[11px]">
              {formatNum(panel.grandTotal ?? grandTotal)}
            </span>
          </div>
          <div className="mt-2 grid gap-2 text-[11px] text-(--text-muted) sm:grid-cols-2">
            <span className="truncate">{topAreaLabel}: <strong className="text-(--text-primary)">{topArea.name}</strong> ({formatNum(topArea.count)})</span>
            <span className="truncate">{dominantLabel}: <strong className="text-(--text-primary)">{dominantBucket.label}</strong> ({formatNum(dominantBucket.total)})</span>
          </div>
        </div>
        <span className={`mt-0.5 text-xs font-semibold transition-transform ${isOpen ? 'rotate-180' : ''}`}>⌄</span>
      </button>

      {grandTotal > 0 && (
        <div className="flex items-center gap-2 px-3 py-2 sm:px-4">
          <div className="flex h-1.5 w-full max-w-56 overflow-hidden rounded-full bg-(--surface-3)">
            {panel.totals.map((total, idx) => {
              const pct = (total / grandTotal) * 100;
              return pct > 0 ? (
                <div
                  key={idx}
                  style={{
                    width: `${pct}%`,
                    background: BUCKET_COLORS[idx] ?? 'rgba(107, 114, 128, 0.85)',
                  }}
                  title={`${panel.buckets[idx]}: ${total}`}
                />
              ) : null;
            })}
          </div>
          <span className="text-[10px] text-(--text-muted) sm:text-[11px]">
            {formatNum(grandTotal)} tiket
          </span>
        </div>
      )}

      {isOpen && (
        <DurationTable
          areas={panel.areas}
          totals={panel.totals}
          buckets={panel.buckets}
          showTotal={panel.grandTotal !== undefined}
          bucketKey={bucketKey}
          bucketLabel={bucketLabel}
          panelType={panel.type as DurasiPanelType}
          panelLabel={panel.label}
          onCellClick={onCellClick}
        />
      )}
    </div>
  );
}
