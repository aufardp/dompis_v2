interface DompisScoreProps {
  ok: number;
  nok: number;
  pct: number;
}

function getScoreStyle(pct: number, total: number): React.CSSProperties {
  if (total === 0) return {};
  if (pct === 0) return { background: '#7f1d1d', color: '#fca5a5' };
  if (pct >= 80) return { background: 'rgba(34, 197, 94, 0.15)', color: '#22c55e' };
  if (pct >= 50) return { background: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b' };
  return { background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444' };
}

export default function DompisScore({ ok, nok, pct }: DompisScoreProps) {
  const total = ok + nok;
  if (total === 0) {
    return <span className="text-(--text-muted)">—</span>;
  }

  return (
    <div className="inline-flex flex-col items-center rounded px-1.5 py-0.5 font-mono text-xs" style={getScoreStyle(pct, total)}>
      <span className="font-bold leading-tight">{pct.toFixed(2)}%</span>
      <span className="text-[9px] opacity-70 leading-tight">{ok}/{nok}</span>
    </div>
  );
}
