interface CustomerTypeCardProps {
  icon: string;
  name: string;
  total: number;
  open: number;
  assigned: number;
  closed: number;
  accentColor: string;
  ttrLabel?: string;
  active?: boolean;
  onClick?: () => void;
}

export default function CustomerTypeCard({
  icon,
  name,
  total,
  open,
  assigned,
  closed,
  accentColor,
  ttrLabel,
  active = false,
  onClick,
}: CustomerTypeCardProps) {
  const pctClosed = total > 0 ? (closed / total) * 100 : 0;

  return (
    <button
      type='button'
      onClick={onClick}
      aria-pressed={active}
      className={
        'bg-surface w-full cursor-pointer rounded-2xl border border-white/[0.07] p-4 text-left transition-all duration-200 hover:-translate-y-0.5 ' +
        (active ? 'ring-2 ring-white/15' : '')
      }
      style={{ borderTop: `2px solid ${accentColor}` }}
    >
      {ttrLabel && (
        <span className='font-syne mb-3 inline-flex items-center gap-1 rounded bg-white/6 px-2 py-0.5 text-[10px] font-bold text-[#6b7a99]'>
          ⏱ {ttrLabel}
        </span>
      )}

      <div className='mb-3 flex items-start gap-2'>
        <span className='text-lg'>{icon}</span>
        <span className='text-xs font-semibold tracking-wide text-[#6b7a99] uppercase'>
          {name}
        </span>
      </div>

      <p
        className='font-syne mb-3 text-3xl font-extrabold tracking-tight'
        style={{ color: accentColor }}
      >
        {total}
      </p>

      <div className='flex gap-3 text-[11px] text-[#6b7a99]'>
        <span className='flex items-center gap-1'>
          <span className='h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400' />
          {open} Open
        </span>
        <span className='flex items-center gap-1'>
          <span className='h-1.5 w-1.5 shrink-0 rounded-full bg-blue-400' />
          {assigned} Assigned
        </span>
        <span className='flex items-center gap-1'>
          <span className='h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400' />
          {closed} Closed
        </span>
      </div>

      <div className='bg-surface-3 mt-3 h-0.5 overflow-hidden rounded-full'>
        <div
          className='h-full rounded-full transition-all duration-700'
          style={{ width: `${pctClosed}%`, background: accentColor }}
        />
      </div>
    </button>
  );
}
