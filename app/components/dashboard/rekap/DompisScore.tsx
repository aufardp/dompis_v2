interface DompisScoreProps {
  ok: number;
  nok: number;
  pct: number;
}

export default function DompisScore({ ok, nok, pct }: DompisScoreProps) {
  const total = ok + nok;
  if (total === 0) {
    return <span className="text-slate-400 dark:text-slate-500">—</span>;
  }

  let bgClass: string;
  if (pct === 0 && total > 0) {
    bgClass = 'bg-red-900 text-white dark:bg-red-950';
  } else if (pct >= 80) {
    bgClass = 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200';
  } else if (pct >= 50) {
    bgClass = 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-200';
  } else {
    bgClass = 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200';
  }

  return (
    <div className={`inline-flex flex-col items-center rounded px-1.5 py-0.5 font-mono text-xs ${bgClass}`}>
      <span className="font-bold leading-tight">{pct.toFixed(2)}%</span>
      <span className="text-[9px] opacity-70 leading-tight">{ok}/{nok}</span>
    </div>
  );
}
