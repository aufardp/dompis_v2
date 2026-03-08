import { Info } from 'lucide-react';

interface B2CSummaryCardProps {
  total: number;
  open: number;
  assigned: number;
  close: number;
  regulerCount: number;
  sqmCount: number;
  unspecCount: number;
  ffgCount: number;
  p1Count: number;
  pPlusCount: number;
  isDailyScope?: boolean; // NEW: indicates daily operational scope
}

function ResolutionRing({ pct }: { pct: number }) {
  const radius = 26;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - pct / 100);

  return (
    <div className='relative flex h-16 w-16 items-center justify-center'>
      <svg className='absolute inset-0 -rotate-90' viewBox='0 0 64 64'>
        <circle
          cx='32'
          cy='32'
          r={radius}
          fill='none'
          stroke='rgba(255,255,255,0.1)'
          strokeWidth='4'
        />
        <circle
          cx='32'
          cy='32'
          r={radius}
          fill='none'
          stroke='#34d399'
          strokeWidth='4'
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap='round'
          className='transition-all duration-700'
        />
      </svg>
      <div className='text-center'>
        <p className='text-xs font-bold text-emerald-400'>{pct.toFixed(1)}%</p>
      </div>
    </div>
  );
}

export default function B2CSummaryCard({
  total,
  open,
  assigned,
  close,
  regulerCount,
  sqmCount,
  unspecCount,
  ffgCount,
  p1Count,
  pPlusCount,
  isDailyScope = false,
}: B2CSummaryCardProps) {
  const pctClosed = total > 0 ? (close / total) * 100 : 0;
  const regulerPct = total > 0 ? ((regulerCount / total) * 100).toFixed(0) : 0;
  const sqmPct = total > 0 ? ((sqmCount / total) * 100).toFixed(0) : 0;
  const unspecPct = total > 0 ? ((unspecCount / total) * 100).toFixed(0) : 0;

  return (
    <div
      className='relative overflow-hidden rounded-2xl p-5 md:p-6'
      style={{
        background:
          'linear-gradient(135deg, #1e3a5f 0%, #1e40af 50%, #312e81 100%)',
      }}
    >
      {/* Decorative background circles */}
      <div
        className='pointer-events-none absolute -top-10 -right-10 h-48 w-48 rounded-full'
        style={{ background: 'rgba(255,255,255,0.04)' }}
      />
      <div
        className='pointer-events-none absolute right-20 -bottom-15 h-40 w-40 rounded-full'
        style={{ background: 'rgba(255,255,255,0.03)' }}
      />

      <div className='relative flex flex-wrap items-center gap-6 md:gap-10'>
        {/* Total */}
        <div className='shrink-0'>
          <div className='flex items-center gap-1.5'>
            <p className='mb-1 text-[10px] font-bold tracking-[2px] text-blue-300 uppercase'>
              B2C Total Summary
            </p>
            {isDailyScope && (
              <div
                className='group relative flex items-center justify-center'
                title='Daily Operational Only: Tickets synced today or with pending reason'
              >
                <Info className='h-3.5 w-3.5 text-blue-300/70 cursor-help' />
                <div className='absolute left-1/2 top-full z-50 hidden w-64 -translate-x-1/2 rounded-lg border border-blue-200 bg-blue-900 px-3 py-2 text-[10px] text-blue-100 shadow-xl group-hover:block'>
                  <p className='font-semibold mb-0.5'>Daily Operational Scope</p>
                  <p className='text-blue-200/80'>
                    Angka ini hanya mencakup tiket operasional hari ini dan tiket pending. 
                    Bukan total keseluruhan database.
                  </p>
                </div>
              </div>
            )}
          </div>
          <p className='text-5xl font-black tracking-tight text-white md:text-6xl'>
            {total.toLocaleString()}
          </p>
          <p className='mt-1 text-xs text-blue-300/70'>
            {isDailyScope ? 'Daily Operational Tickets' : 'Total Tickets'}
          </p>
        </div>

        {/* Divider */}
        <div className='hidden h-14 w-px bg-white/10 sm:block' />

        {/* Reguler + SQM + Unspec breakdown */}
        <div className='flex gap-8'>
          <div>
            <p className='mb-1 text-[10px] text-blue-300'>📋 Reguler</p>
            <p className='text-2xl font-bold text-white'>
              {regulerCount.toLocaleString()}
            </p>
            <p className='text-[10px] text-blue-300/60'>
              {regulerPct}% of total
            </p>
          </div>
          <div>
            <p className='mb-1 text-[10px] text-blue-300'>📊 SQM</p>
            <p className='text-2xl font-bold text-white'>
              {sqmCount.toLocaleString()}
            </p>
            <p className='text-[10px] text-blue-300/60'>{sqmPct}% of total</p>
          </div>
          <div>
            <p className='mb-1 text-[10px] text-blue-300'>❓ Unspec</p>
            <p className='text-2xl font-bold text-white'>
              {unspecCount.toLocaleString()}
            </p>
            <p className='text-[10px] text-blue-300/60'>
              {unspecPct}% of total
            </p>
          </div>
        </div>

        {/* Divider */}
        <div className='hidden h-14 w-px bg-white/10 sm:block' />

        {/* Status */}
        <div className='flex gap-6'>
          <div className='text-center'>
            <p
              className='text-2xl font-black'
              style={{ color: open > 0 ? '#fbbf24' : 'rgba(251,191,36,0.4)' }}
            >
              {open}
            </p>
            <p className='text-[10px] text-blue-300/60'>Open</p>
          </div>
          <div className='text-center'>
            <p
              className='text-2xl font-black'
              style={{
                color: assigned > 0 ? '#60a5fa' : 'rgba(96,165,250,0.4)',
              }}
            >
              {assigned}
            </p>
            <p className='text-[10px] text-blue-300/60'>Assigned</p>
          </div>
          <div className='text-center'>
            <p
              className='text-2xl font-black'
              style={{ color: close > 0 ? '#34d399' : 'rgba(52,211,153,0.4)' }}
            >
              {close}
            </p>
            <p className='text-[10px] text-blue-300/60'>Close</p>
          </div>
        </div>

        {/* Divider */}
        <div className='hidden h-14 w-px bg-white/10 sm:block' />

        {/* Flagging counts */}
        <div className='flex gap-6'>
          <div className='text-center'>
            <p
              className='text-2xl font-black'
              style={{
                color: ffgCount > 0 ? '#a855f7' : 'rgba(168,85,247,0.4)',
              }}
            >
              {ffgCount}
            </p>
            <p className='text-[10px] text-purple-300/60'>🔥 FFG</p>
          </div>
          <div className='text-center'>
            <p
              className='text-2xl font-black'
              style={{ color: p1Count > 0 ? '#ef4444' : 'rgba(239,68,68,0.4)' }}
            >
              {p1Count}
            </p>
            <p className='text-[10px] text-red-300/60'>⚡ P1</p>
          </div>
          <div className='text-center'>
            <p
              className='text-2xl font-black'
              style={{
                color: pPlusCount > 0 ? '#f59e0b' : 'rgba(245,158,11,0.4)',
              }}
            >
              {pPlusCount}
            </p>
            <p className='text-[10px] text-amber-300/60'>⚡ P+</p>
          </div>
        </div>

        {/* Resolution ring — pushed to right */}
        {/* <div className='ml-auto hidden flex-col items-center gap-1 md:flex'>
          <p className='text-[10px] text-blue-300/70'>Resolution Rate</p>
          <ResolutionRing pct={pctClosed} />
        </div> */}
      </div>
    </div>
  );
}
