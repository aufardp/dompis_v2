interface B2BGroupSummaryProps {
  title: string;
  icon: string;
  total: number;
  open: number;
  assigned: number;
  close: number;
  regulerCount: number;
  sqmCount: number;
  ffgCount: number;
  p1Count: number;
  pPlusCount: number;
  accentColor: string;
}

function ResolutionRing({ pct, color }: { pct: number; color: string }) {
  const radius = 22;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - pct / 100);

  return (
    <div className='relative flex h-14 w-14 items-center justify-center'>
      <svg className='absolute inset-0 -rotate-90' viewBox='0 0 56 56'>
        <circle
          cx='28'
          cy='28'
          r={radius}
          fill='none'
          className='stroke-slate-200 dark:stroke-slate-700'
          strokeWidth='3.5'
        />
        <circle
          cx='28'
          cy='28'
          r={radius}
          fill='none'
          stroke={color}
          strokeWidth='3.5'
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap='round'
          className='transition-all duration-700'
        />
      </svg>
      <p className='text-[11px] font-bold' style={{ color }}>
        {pct.toFixed(1)}%
      </p>
    </div>
  );
}

export default function B2BGroupSummary({
  title,
  icon,
  total,
  open,
  assigned,
  close,
  regulerCount,
  sqmCount,
  ffgCount,
  p1Count,
  pPlusCount,
  accentColor,
}: B2BGroupSummaryProps) {
  const pctClosed = total > 0 ? (close / total) * 100 : 0;
  const regulerPct = total > 0 ? Math.round((regulerCount / total) * 100) : 0;
  const sqmPct = total > 0 ? Math.round((sqmCount / total) * 100) : 0;
  const ffgPct = total > 0 ? Math.round((ffgCount / total) * 100) : 0;
  const p1Pct = total > 0 ? Math.round((p1Count / total) * 100) : 0;
  const pPlusPct = total > 0 ? Math.round((pPlusCount / total) * 100) : 0;

  return (
    <div
      className='relative overflow-hidden rounded-2xl p-4 md:p-5'
      style={{
        background: `linear-gradient(135deg, ${accentColor}18 0%, ${accentColor}0a 60%, transparent 100%)`,
        border: `1.5px solid ${accentColor}35`,
      }}
    >
      {/* Decorative circle */}
      <div
        className='pointer-events-none absolute -top-8 -right-8 h-36 w-36 rounded-full'
        style={{ background: `${accentColor}08` }}
      />

      <div className='relative flex flex-wrap items-center gap-5 md:gap-8'>
        {/* Title + Total */}
        <div className='shrink-0'>
          <div className='mb-1.5 flex items-center gap-2'>
            <div
              className='flex h-7 w-7 items-center justify-center rounded-lg text-sm'
              style={{
                background: accentColor + '20',
                border: `1px solid ${accentColor}30`,
              }}
            >
              {icon}
            </div>
            <span
              className='text-[10px] font-bold tracking-[1.5px] uppercase'
              style={{ color: accentColor }}
            >
              {title}
            </span>
          </div>
          <p
            className='text-4xl font-black tracking-tight md:text-5xl'
            style={{ color: accentColor }}
          >
            {total.toLocaleString()}
          </p>
          <p className='mt-0.5 text-[10px] text-slate-400 dark:text-slate-500'>Total Tickets</p>
        </div>

        {/* Divider */}
        <div
          className='hidden h-12 w-px sm:block'
          style={{ background: accentColor + '25' }}
        />

        {/* Reguler + SQM + Priority */}
        <div className='flex gap-6'>
          <div>
            <p className='mb-1 text-[9px] font-semibold text-slate-400 dark:text-slate-500'>
              📋 Reguler
            </p>
            <p className='text-xl font-bold text-slate-700 dark:text-slate-200'>
              {regulerCount.toLocaleString()}
            </p>
            <p className='text-[9px] text-slate-400 dark:text-slate-500'>{regulerPct}% of total</p>
          </div>
          <div>
            <p className='mb-1 text-[9px] font-semibold text-slate-400 dark:text-slate-500'>
              📊 SQM
            </p>
            <p className='text-xl font-bold text-slate-700 dark:text-slate-200'>
              {sqmCount.toLocaleString()}
            </p>
            <p className='text-[9px] text-slate-400 dark:text-slate-500'>{sqmPct}% of total</p>
          </div>
          <div>
            <p className='mb-1 text-[9px] font-semibold text-slate-400 dark:text-slate-500'>
              🛡️ FFG
            </p>
            <p className='text-xl font-bold text-slate-700 dark:text-slate-200'>
              {ffgCount.toLocaleString()}
            </p>
            <p className='text-[9px] text-slate-400 dark:text-slate-500'>{ffgPct}% of total</p>
          </div>
          <div>
            <p className='mb-1 text-[9px] font-semibold text-slate-400 dark:text-slate-500'>
              ⚠️ P1
            </p>
            <p className='text-xl font-bold text-slate-700 dark:text-slate-200'>
              {p1Count.toLocaleString()}
            </p>
            <p className='text-[9px] text-slate-400 dark:text-slate-500'>{p1Pct}% of total</p>
          </div>
          <div>
            <p className='mb-1 text-[9px] font-semibold text-slate-400 dark:text-slate-500'>
              📈 P+
            </p>
            <p className='text-xl font-bold text-slate-700 dark:text-slate-200'>
              {pPlusCount.toLocaleString()}
            </p>
            <p className='text-[9px] text-slate-400 dark:text-slate-500'>{pPlusPct}% of total</p>
          </div>
        </div>

        {/* Divider */}
        <div
          className='hidden h-12 w-px sm:block'
          style={{ background: accentColor + '25' }}
        />

        {/* Status */}
        <div className='flex gap-5'>
          <div className='text-center'>
            <p
              className='text-xl font-black'
              style={{ color: open > 0 ? '#f59e0b' : '#f59e0b40' }}
            >
              {open}
            </p>
            <p className='text-[9px] text-slate-400 dark:text-slate-500'>Open</p>
          </div>
          <div className='text-center'>
            <p
              className='text-xl font-black'
              style={{ color: assigned > 0 ? '#3b82f6' : '#3b82f640' }}
            >
              {assigned}
            </p>
            <p className='text-[9px] text-slate-400 dark:text-slate-500'>Assigned</p>
          </div>
          <div className='text-center'>
            <p
              className='text-xl font-black'
              style={{ color: close > 0 ? '#10b981' : '#10b98140' }}
            >
              {close}
            </p>
            <p className='text-[9px] text-slate-400 dark:text-slate-500'>Close</p>
          </div>
        </div>

        {/* Resolution ring */}
        <div className='ml-auto hidden flex-col items-center gap-1 md:flex'>
          <p className='text-[9px] text-slate-400 dark:text-slate-500'>Resolution</p>
          <ResolutionRing pct={pctClosed} color={accentColor} />
        </div>
      </div>

      {/* Bottom stacked progress bar */}
      <div className='mt-4'>
        <div className='h-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700/60'>
          <div className='flex h-full'>
            <div
              className='h-full transition-all duration-700'
              style={{
                width: `${total > 0 ? (open / total) * 100 : 0}%`,
                background: '#f59e0b',
              }}
            />
            <div
              className='h-full transition-all duration-700'
              style={{
                width: `${total > 0 ? (assigned / total) * 100 : 0}%`,
                background: '#3b82f6',
              }}
            />
            <div
              className='h-full transition-all duration-700'
              style={{
                width: `${total > 0 ? (close / total) * 100 : 0}%`,
                background: accentColor,
              }}
            />
          </div>
        </div>
        <div className='mt-1 flex justify-between text-[9px] text-slate-300 dark:text-slate-500'>
          <span>Open · Assigned · Close</span>
          <span>{total} total</span>
        </div>
      </div>
    </div>
  );
}
