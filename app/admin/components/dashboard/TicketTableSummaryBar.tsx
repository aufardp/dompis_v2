import { memo } from 'react';

interface TicketTableSummaryBarProps {
  total: number;
  open: number;
  assigned: number;
  close: number;
  label?: string;
}

function TicketTableSummaryBar({
  total,
  open,
  assigned,
  close,
  label,
}: TicketTableSummaryBarProps) {
  // Calculate proportions for progress bar segments
  const openPct = total > 0 ? (open / total) * 100 : 0;
  const assignedPct = total > 0 ? (assigned / total) * 100 : 0;
  const closePct = total > 0 ? (close / total) * 100 : 0;

  return (
    <div className='border-b border-(--border) bg-(--surface-2) px-4 py-3 sm:px-5'>
      <div className='flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
        {label && (
          <span className='text-[10px] font-bold tracking-[0.18em] text-(--text-secondary) uppercase'>
            {label}
          </span>
        )}
        <div className='grid gap-2 text-[11px] sm:flex sm:flex-wrap sm:items-center'>
          <span className='flex w-full items-center justify-between gap-1 rounded-2xl border border-amber-500/15 bg-amber-500/10 px-3 py-2 font-semibold text-amber-600 sm:w-auto sm:rounded-full sm:px-2.5 sm:py-1'>
            <span className='h-1.5 w-1.5 rounded-full bg-amber-500' />
            Open {open.toLocaleString()}
          </span>
          <span className='flex w-full items-center justify-between gap-1 rounded-2xl border border-blue-500/15 bg-blue-500/10 px-3 py-2 font-semibold text-blue-600 sm:w-auto sm:rounded-full sm:px-2.5 sm:py-1'>
            <span className='h-1.5 w-1.5 rounded-full bg-blue-500' />
            Assigned {assigned.toLocaleString()}
          </span>
          <span className='flex w-full items-center justify-between gap-1 rounded-2xl border border-emerald-500/15 bg-emerald-500/10 px-3 py-2 font-semibold text-emerald-600 sm:w-auto sm:rounded-full sm:px-2.5 sm:py-1'>
            <span className='h-1.5 w-1.5 rounded-full bg-emerald-500' />
            Close {close.toLocaleString()}
          </span>
        </div>
      </div>

      {/* Bottom row: thin 3-segment progress bar */}
      <div className='mt-3 flex h-1.5 w-full overflow-hidden rounded-full bg-slate-200/70'>
        {total === 0 ? (
          // If total is 0, render full-width slate-200
          <div className='h-full w-full bg-slate-200' />
        ) : (
          <>
            <div
              className='h-full transition-all duration-700'
              style={{ width: `${openPct}%`, background: '#f59e0b' }}
            />
            <div
              className='h-full transition-all duration-700'
              style={{ width: `${assignedPct}%`, background: '#3b82f6' }}
            />
            <div
              className='h-full transition-all duration-700'
              style={{ width: `${closePct}%`, background: '#10b981' }}
            />
          </>
        )}
      </div>
    </div>
  );
}

export default memo(TicketTableSummaryBar);
