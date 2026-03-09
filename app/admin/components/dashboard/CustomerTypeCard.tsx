interface CustomerTypeCardProps {
  icon: string;
  name: string;
  total: number;
  open: number;
  assigned: number;
  close: number;
  accentColor: string;
  ttrLabel?: string;
  active?: boolean;
  onClick?: () => void;
  regulerCount?: number;
  sqmCount?: number;
  unspecCount?: number;
  ffgCount?: number;
  p1Count?: number;
  pPlusCount?: number;
  totalAll?: number;
}

function MiniBar({
  value,
  max,
  color,
}: {
  value: number;
  max: number;
  color: string;
}) {
  const pct = max === 0 ? 0 : (value / max) * 100;
  return (
    <div className='h-1 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700'>
      <div
        className='h-full rounded-full transition-all duration-700'
        style={{ width: `${pct}%`, background: color }}
      />
    </div>
  );
}

function ProgressRing({
  value,
  max,
  color,
  icon,
}: {
  value: number;
  max: number;
  color: string;
  icon: string;
}) {
  const radius = 18;
  const circumference = 2 * Math.PI * radius;
  const pct = max > 0 ? value / max : 0;
  const offset = circumference * (1 - pct);

  return (
    <div className='relative flex h-11 w-11 items-center justify-center'>
      <svg className='absolute inset-0 -rotate-90' viewBox='0 0 44 44'>
        <circle
          cx='22'
          cy='22'
          r={radius}
          fill='none'
          className='stroke-slate-200 dark:stroke-slate-700'
          strokeWidth='3'
        />
        <circle
          cx='22'
          cy='22'
          r={radius}
          fill='none'
          stroke={color}
          strokeWidth='3'
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap='round'
          className='transition-all duration-700'
        />
      </svg>
      <span className='text-sm'>{icon}</span>
    </div>
  );
}

export default function CustomerTypeCard({
  icon,
  name,
  total,
  open,
  assigned,
  close,
  accentColor,
  active = false,
  onClick,
  regulerCount,
  sqmCount,
  unspecCount,
  ffgCount,
  p1Count,
  pPlusCount,
  totalAll,
}: CustomerTypeCardProps) {
  const shareOfAll =
    totalAll && totalAll > 0 ? ((total / totalAll) * 100).toFixed(1) : null;

  return (
    <button
      type='button'
      onClick={onClick}
      aria-pressed={active}
      className={[
        'w-full cursor-pointer rounded-2xl p-5 text-left transition-all duration-200',
        'hover:-translate-y-0.5',
        'bg-white dark:bg-slate-800/70',
        'shadow-sm hover:shadow-md dark:shadow-none',
        !active && 'border border-slate-200 dark:border-slate-700/60',
      ].filter(Boolean).join(' ')}
      style={active ? {
        border: `2px solid ${accentColor}`,
        boxShadow: `0 4px 20px ${accentColor}28`,
      } : undefined}
    >
      {/* Header */}
      <div className='mb-3 flex items-start justify-between'>
        <div className='flex items-center gap-2'>
          <div
            className='flex h-8 w-8 items-center justify-center rounded-full'
            style={{
              background: accentColor + '15',
              border: `1.5px solid ${accentColor}35`,
            }}
          >
            <span className='text-sm'>{icon}</span>
          </div>
          <span
            className='text-[11px] font-bold tracking-widest uppercase'
            style={{ color: accentColor }}
          >
            {name}
          </span>
        </div>

        <ProgressRing
          value={total}
          max={totalAll ?? total}
          color={accentColor}
          icon={icon}
        />
      </div>

      {/* Big number */}
      <p
        className='text-4xl font-black tracking-tight'
        style={{ color: accentColor }}
      >
        {total.toLocaleString()}
      </p>
      <p className='mb-4 text-xs text-slate-400 dark:text-slate-500'>
        {shareOfAll ? `${shareOfAll}% of total` : 'tickets'}
      </p>

      {/* Pills - Reguler, SQM, Unspec */}
      {(regulerCount !== undefined ||
        sqmCount !== undefined ||
        unspecCount !== undefined) && (
        <div className='mb-3 flex flex-wrap gap-2'>
          {regulerCount !== undefined && (
            <span className='flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[11px] font-semibold text-slate-500 dark:border-slate-600 dark:bg-slate-700/60 dark:text-slate-300'>
              📋 Reguler: {regulerCount}
            </span>
          )}
          {sqmCount !== undefined && (
            <span
              className='flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold'
              style={{
                background: accentColor + '12',
                borderColor: accentColor + '35',
                color: accentColor,
              }}
            >
              📊 SQM: {sqmCount}
            </span>
          )}
          {unspecCount !== undefined && (
            <span className='flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[11px] font-semibold text-slate-500 dark:border-slate-600 dark:bg-slate-700/60 dark:text-slate-400'>
              ❓ Unspec: {unspecCount}
            </span>
          )}
        </div>
      )}

      {/* Flagging Pills - FFG, P1, P+ */}
      {(ffgCount !== undefined ||
        p1Count !== undefined ||
        pPlusCount !== undefined) && (
        <div className='mb-3 flex flex-wrap gap-2'>
          {ffgCount !== undefined && ffgCount > 0 && (
            <span className='flex items-center gap-1 rounded-full border border-purple-200 bg-purple-50 px-2 py-0.5 text-[10px] font-semibold text-purple-600 dark:border-purple-700/50 dark:bg-purple-900/30 dark:text-purple-300'>
              🔥 FFG: {ffgCount}
            </span>
          )}
          {p1Count !== undefined && p1Count > 0 && (
            <span className='flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-600 dark:border-red-700/50 dark:bg-red-900/30 dark:text-red-300'>
              ⚡ P1: {p1Count}
            </span>
          )}
          {pPlusCount !== undefined && pPlusCount > 0 && (
            <span className='flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-600 dark:border-amber-700/50 dark:bg-amber-900/30 dark:text-amber-300'>
              ⚡ P+: {pPlusCount}
            </span>
          )}
        </div>
      )}

      {/* Mini bars */}
      {(regulerCount !== undefined ||
        sqmCount !== undefined ||
        unspecCount !== undefined) && (
        <div className='mb-4 space-y-1.5'>
          {regulerCount !== undefined && (
            <div className='flex items-center gap-2'>
              <span className='w-10 shrink-0 text-right text-[10px] text-slate-400 dark:text-slate-500'>
                Reguler
              </span>
              <MiniBar value={regulerCount} max={total} color='#94a3b8' />
              <span className='w-7 shrink-0 text-right text-[10px] font-semibold text-slate-400 dark:text-slate-500'>
                {total > 0 ? Math.round((regulerCount / total) * 100) : 0}%
              </span>
            </div>
          )}
          {sqmCount !== undefined && (
            <div className='flex items-center gap-2'>
              <span className='w-10 shrink-0 text-right text-[10px] text-slate-400 dark:text-slate-500'>
                SQM
              </span>
              <MiniBar value={sqmCount} max={total} color={accentColor} />
              <span className='w-7 shrink-0 text-right text-[10px] font-semibold text-slate-400 dark:text-slate-500'>
                {total > 0 ? Math.round((sqmCount / total) * 100) : 0}%
              </span>
            </div>
          )}

          {unspecCount !== undefined && (
            <div className='flex items-center gap-2'>
              <span className='w-10 shrink-0 text-right text-[10px] text-slate-400 dark:text-slate-500'>
                Unspec
              </span>
              <MiniBar value={unspecCount} max={total} color='#94a3b8' />
              <span className='w-7 shrink-0 text-right text-[10px] font-semibold text-slate-400 dark:text-slate-500'>
                {total > 0 ? Math.round((unspecCount / total) * 100) : 0}%
              </span>
            </div>
          )}
        </div>
      )}

      {/* Status dots */}
      <div className='flex flex-wrap gap-3 text-[11px] text-slate-400 dark:text-slate-500'>
        <span className='flex items-center gap-1.5'>
          <span className='h-2 w-2 rounded-full bg-amber-400' />
          {open} Open
        </span>
        <span className='flex items-center gap-1.5'>
          <span className='h-2 w-2 rounded-full bg-blue-400' />
          {assigned} Assigned
        </span>
        <span className='flex items-center gap-1.5'>
          <span className='h-2 w-2 rounded-full bg-emerald-400' />
          {close} Close
        </span>
      </div>
    </button>
  );
}
