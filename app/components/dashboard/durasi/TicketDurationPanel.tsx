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
  '#10b981', '#84cc16', '#eab308',
  '#f97316', '#ef4444', '#991b1b',
];

export default function TicketDurationPanel({ panel }: TicketDurationPanelProps) {
  const accent = PANEL_ACCENT[panel.type] ?? '#6b7280';
  const grandTotal = panel.totals.reduce((s, v) => s + v, 0);

  return (
    <div className="overflow-hidden rounded-lg border border-(--border) bg-(--surface)">
      {/* Panel header with accent stripe */}
      <div className="flex items-center gap-3 border-b border-(--border) bg-(--surface-2) px-4 py-3">
        <div className="h-4 w-1 rounded-full" style={{ background: accent }} />
        <h2 className="text-xs font-bold uppercase tracking-widest text-(--text-secondary)">
          Durasi Tiket {panel.label}
        </h2>
        {panel.grandTotal !== undefined && (
          <span className="ml-auto text-xs font-mono font-bold text-(--text-primary)">
            {panel.grandTotal}
          </span>
        )}
      </div>

      {/* Mini stacked sparkline */}
      {grandTotal > 0 && (
        <div className="flex items-center gap-2 px-4 pb-2 pt-2">
          <div className="flex h-1.5 w-full max-w-48 overflow-hidden rounded-full gap-px">
            {panel.totals.map((total, idx) => {
              const pct = (total / grandTotal) * 100;
              return pct > 0 ? (
                <div
                  key={idx}
                  style={{ width: `${pct}%`, background: BUCKET_COLORS[idx] ?? '#6b7280' }}
                  title={`${panel.buckets[idx]}: ${total}`}
                />
              ) : null;
            })}
          </div>
          <span className="text-[10px] text-(--text-muted) font-mono">
            {grandTotal} open
          </span>
        </div>
      )}

      <DurationTable areas={panel.areas} totals={panel.totals} buckets={panel.buckets} showTotal={panel.grandTotal !== undefined} />
    </div>
  );
}
