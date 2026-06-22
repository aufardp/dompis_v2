import { memo } from 'react';
import { Info } from 'lucide-react';

interface B2CSummaryCardProps {
  loading?: boolean;
  total: number;
  open: number;
  assigned: number;
  close: number;
  customerCount: number;
  sqmCount: number;
  unspecCount: number;
  ffgCount: number;
  gamasCount: number;
  p1Count: number;
  pPlusCount: number;
  isDailyScope?: boolean; // NEW: indicates daily operational scope
}

function MetricCard({
  label,
  value,
  helper,
  tone,
}: {
  label: string;
  value: number | string;
  helper: string;
  tone: 'blue' | 'amber' | 'emerald' | 'slate';
}) {
  const toneClass = {
    blue: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-300',
    amber:
      'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300',
    emerald:
      'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300',
    slate:
      'border-slate-200 bg-white text-slate-700 dark:border-slate-800 dark:bg-slate-950/70 dark:text-slate-300',
  }[tone];

  return (
    <div className={`rounded-xl border px-2.5 py-2 ${toneClass}`}>
      <p className='text-[9px] font-bold tracking-[0.18em] uppercase opacity-75'>
        {label}
      </p>
      <p className='mt-1 text-xl font-black leading-none'>{value}</p>
      <p className='mt-0.5 text-[10px] opacity-80'>{helper}</p>
    </div>
  );
}

function B2CSummaryCard({
  loading = false,
  total,
  open,
  assigned,
  close,
  customerCount,
  sqmCount,
  unspecCount,
  ffgCount,
  gamasCount,
  p1Count,
  pPlusCount,
  isDailyScope = false,
}: B2CSummaryCardProps) {
  const pctClosed = total > 0 ? (close / total) * 100 : 0;
  const regulerPct = total > 0 ? ((customerCount / total) * 100).toFixed(0) : 0;
  const sqmPct = total > 0 ? ((sqmCount / total) * 100).toFixed(0) : 0;
  const unspecPct = total > 0 ? ((unspecCount / total) * 100).toFixed(0) : 0;

  const displayTotal = loading ? '88,888' : total.toLocaleString();
  const displayOpen = loading ? '888' : open.toLocaleString();
  const displayAssigned = loading ? '888' : assigned.toLocaleString();
  const displayClose = loading ? '888' : close.toLocaleString();
  const displayCustomerCount = loading ? '888' : customerCount.toLocaleString();
  const displaySqmCount = loading ? '888' : sqmCount.toLocaleString();
  const displayUnspecCount = loading ? '888' : unspecCount.toLocaleString();
  const displayFfgCount = loading ? '888' : ffgCount.toLocaleString();
  const displayP1Count = loading ? '888' : p1Count.toLocaleString();
  const displayPPlusCount = loading ? '888' : pPlusCount.toLocaleString();
  const displayGamasCount = loading ? '888' : gamasCount.toLocaleString();

  return (
    <phantom-ui suppressHydrationWarning fallback-radius={8}
      loading={loading}
      animation='shimmer'
      reveal={0.12}
      loading-label='Loading B2C summary'
    >
      <section className='rounded-3xl border border-blue-200/70 bg-[linear-gradient(180deg,rgba(239,246,255,0.96),rgba(255,255,255,0.96))] p-4 shadow-sm dark:border-blue-900/50 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.92),rgba(15,23,42,0.84))] md:p-5'>
        <div className='flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between'>
          <div className='space-y-3 xl:max-w-[42rem]'>
            <div className='flex flex-wrap items-center gap-2'>
              <span className='rounded-full border border-blue-200 bg-white px-3 py-1 text-[10px] font-bold tracking-[0.2em] text-blue-700 uppercase dark:border-blue-800 dark:bg-slate-950 dark:text-blue-300'>
                B2C Total Summary
              </span>
              {isDailyScope && (
                <span className='inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[10px] font-semibold text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300'>
                  <Info className='h-3 w-3' />
                  Daily scope
                </span>
              )}
            </div>

            <div className='flex flex-wrap items-end gap-3'>
              <div>
                <p className='text-[10px] font-bold tracking-[0.22em] text-blue-600 uppercase dark:text-blue-300'>
                  Total
                </p>
                <div className='flex items-baseline gap-2'>
                  <p className='text-[clamp(2.2rem,4vw,3.4rem)] leading-none font-black tracking-tight text-slate-950 dark:text-white'>
                    {displayTotal}
                  </p>
                  <span className='pb-1 text-[10px] font-bold tracking-[0.18em] text-slate-400 uppercase dark:text-slate-500'>
                    Tickets
                  </span>
                </div>
                <p className='mt-1 text-xs text-slate-500 dark:text-slate-400'>
                  {loading
                    ? 'Loading operational summary'
                    : isDailyScope
                      ? 'Daily operational tickets'
                      : 'Total tickets'}
                </p>
              </div>

              <div className='grid min-w-[13rem] flex-1 grid-cols-3 gap-1.5'>
                <MetricCard
                  label='Open'
                  value={displayOpen}
                  helper={
                    loading ? 'loading' : `${pctClosed.toFixed(1)}% close rate`
                  }
                  tone='amber'
                />
                <MetricCard
                  label='Assigned'
                  value={displayAssigned}
                  helper={loading ? 'loading' : 'sedang ditangani'}
                  tone='blue'
                />
                <MetricCard
                  label='Close'
                  value={displayClose}
                  helper={loading ? 'loading' : 'closed today'}
                  tone='emerald'
                />
              </div>
            </div>

            <div className='grid gap-1.5 sm:grid-cols-3'>
              <MetricCard
                label='Customer'
                value={displayCustomerCount}
                helper={loading ? 'loading' : `${regulerPct}% of total`}
                tone='slate'
              />
              <MetricCard
                label='SQM'
                value={displaySqmCount}
                helper={loading ? 'loading' : `${sqmPct}% of total`}
                tone='blue'
              />
              <MetricCard
                label='Unspec'
                value={displayUnspecCount}
                helper={loading ? 'loading' : `${unspecPct}% of total`}
                tone='amber'
              />
            </div>
          </div>

          <div className='grid gap-1.5 sm:grid-cols-2 xl:w-[17rem] xl:grid-cols-1'>
            <MetricCard
              label='FFG'
              value={displayFfgCount}
              helper={loading ? 'loading' : 'flagging priority'}
              tone='emerald'
            />
            <MetricCard
              label='Manja HI'
              value={displayP1Count}
              helper={loading ? 'loading' : 'priority hard'}
              tone='amber'
            />
            <MetricCard
              label='Manja H+'
              value={displayPPlusCount}
              helper={loading ? 'loading' : 'priority soft'}
              tone='blue'
            />
            <MetricCard
              label='GAMAS'
              value={displayGamasCount}
              helper={loading ? 'loading' : 'alert bucket'}
              tone='slate'
            />
          </div>
        </div>
      </section>
    </phantom-ui>
  );
}

export default memo(B2CSummaryCard);
