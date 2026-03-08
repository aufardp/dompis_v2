interface TicketTableSummaryBarProps {
  total: number;
  open: number;
  assigned: number;
  close: number;
  label?: string;
}

export default function TicketTableSummaryBar({
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
    <div className='bg-surface-2 border-b border-(--border) px-4 py-2'>
      {/* Top row: label + counts */}
      <div className='flex items-center gap-4'>
        {label && (
          <span className='text-[10px] font-bold tracking-wider text-(--text-secondary) uppercase'>
            {label}
          </span>
        )}
        <div className='flex items-center gap-3 text-[11px]'>
          <span className='flex items-center gap-1 font-semibold text-amber-600'>
            <span className='h-1.5 w-1.5 rounded-full bg-amber-500' />
            Open: {open.toLocaleString()}
          </span>
          <span className='flex items-center gap-1 font-semibold text-blue-600'>
            <span className='h-1.5 w-1.5 rounded-full bg-blue-500' />
            Assigned: {assigned.toLocaleString()}
          </span>
          <span className='flex items-center gap-1 font-semibold text-emerald-600'>
            <span className='h-1.5 w-1.5 rounded-full bg-emerald-500' />
            Close: {close.toLocaleString()}
          </span>
        </div>
      </div>

      {/* Bottom row: thin 3-segment progress bar */}
      <div className='mt-2 flex h-0.5 w-full overflow-hidden rounded-full bg-slate-200'>
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
