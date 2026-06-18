import DurationTable from './DurationTable';

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
}

const PANEL_ACCENT: Record<string, string> = {
  REGULER: '#3b82f6',
  HVC_DIAMOND_PLATINUM: '#22d3ee',
  HVC_GOLD: '#f59e0b',
  MANJA: '#f87171',
  FFG: '#34d399',
  SQM: '#a78bfa',
  ANAK_GAMAS: '#fb923c',
  HSI: '#94a3b8',
};

const BUCKET_COLORS = [
  'rgba(16, 185, 129, 0.85)',
  'rgba(132, 204, 22, 0.85)',
  'rgba(234, 179, 8, 0.85)',
  'rgba(249, 115, 22, 0.85)',
  'rgba(239, 68, 68, 0.85)',
  'rgba(153, 27, 27, 0.85)',
];

export default function TicketDurationPanel({ panel }: TicketDurationPanelProps) {
  const accent = PANEL_ACCENT[panel.type] ?? '#6b7280';
  const grandTotal = panel.totals.reduce((s, v) => s + v, 0);

  return (
    <div className="overflow-hidden rounded-2xl border border-(--border) bg-(--surface) shadow-sm">
      <div className="flex items-center gap-3 border-b border-(--border) bg-(--surface-2) px-3 py-2.5 sm:px-4 sm:py-3">
        <div className="h-3.5 w-1 rounded-full" style={{ background: accent }} />
        <div className="min-w-0">
          <h2 className="truncate text-[11px] font-semibold uppercase tracking-[0.16em] text-(--text-secondary) sm:text-xs sm:tracking-[0.18em]">
            Durasi Tiket {panel.label}
          </h2>
          <p className="mt-0.5 hidden text-[11px] text-(--text-muted) sm:block">
            Distribusi durasi open per bucket
          </p>
        </div>
        {panel.grandTotal !== undefined && (
          <span className="ml-auto rounded-full border border-(--border) bg-(--surface) px-2 py-0.5 text-[10px] font-semibold text-(--text-primary) sm:px-2.5 sm:py-1 sm:text-[11px]">
            {panel.grandTotal}
          </span>
        )}
      </div>

      {grandTotal > 0 && (
        <div className="flex items-center gap-2 px-3 py-2 sm:px-4">
          <div className="flex h-1.5 w-full max-w-48 overflow-hidden rounded-full bg-(--surface-3) sm:max-w-56">
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
            {grandTotal} open
          </span>
        </div>
      )}

      <DurationTable areas={panel.areas} totals={panel.totals} buckets={panel.buckets} showTotal={panel.grandTotal !== undefined} />
    </div>
  );
}
