'use client';
import { computeTtrCountdown, TtrStatus } from '@/app/hooks/useTtrCountdown';

const STATUS_STYLE: Record<TtrStatus, string> = {
  overdue: 'bg-red-500/15 text-red-400 border border-red-500/20 animate-pulse',
  critical: 'bg-orange-500/15 text-orange-400 border border-orange-500/20',
  warning: 'bg-amber-500/15 text-amber-300 border border-amber-500/20',
  ok: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20',
};

interface Props {
  ticket: any;
}

export default function TtrCountdownBadge({ ticket }: Props) {
  const ttr = computeTtrCountdown(ticket);
  if (!ttr) return <span className='text-xs text-(--text-secondary) italic'>—</span>;

  return (
    <div className='inline-flex flex-col items-center gap-0.5'>
      <span className={`rounded-full px-2 py-0.5 text-[11px] font-black tabular-nums whitespace-nowrap ${STATUS_STYLE[ttr.status]}`}>
        {ttr.isOverdue ? '⚠ ' : '⏱ '}{ttr.label}
      </span>
      <span className='text-[9px] text-(--text-secondary)'>
        {ttr.isOverdue ? 'OVERDUE' : 'sisa TTR'}
      </span>
    </div>
  );
}
