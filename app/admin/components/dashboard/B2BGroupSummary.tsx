import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Clock3,
  Flame,
  ShieldCheck,
  SignalHigh,
} from 'lucide-react';
import type { ReactNode } from 'react';

interface B2BGroupSummaryProps {
  title: string;
  total: number;
  open: number;
  assigned: number;
  close: number;
  regulerCount: number;
  sqmCount: number;
  ffgCount: number;
  gamasCount: number;
  p1Count: number;
  pPlusCount: number;
  activeGroupCount?: number;
}

function formatPct(value: number, total: number) {
  if (total <= 0) return '0%';
  return `${Math.round((value / total) * 100)}%`;
}

function MetricTile({
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
    <div className={`rounded-xl border px-3 py-2.5 ${toneClass}`}>
      <p className='text-[10px] font-bold tracking-wide uppercase opacity-70'>
        {label}
      </p>
      <p className='mt-1 text-2xl font-black leading-none'>{value}</p>
      <p className='mt-1 text-[11px] opacity-75'>{helper}</p>
    </div>
  );
}

function PriorityPill({
  icon,
  label,
  value,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: number;
  tone: string;
}) {
  return (
    <div className='flex min-w-0 items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-950/60'>
      <div className='flex min-w-0 items-center gap-2'>
        <span className={tone}>{icon}</span>
        <span className='truncate text-xs font-semibold text-slate-600 dark:text-slate-300'>
          {label}
        </span>
      </div>
      <span className='font-mono text-sm font-black text-slate-950 dark:text-slate-50'>
        {value.toLocaleString()}
      </span>
    </div>
  );
}

export default function B2BGroupSummary({
  title,
  total,
  open,
  assigned,
  close,
  regulerCount,
  sqmCount,
  ffgCount,
  gamasCount,
  p1Count,
  pPlusCount,
  activeGroupCount,
}: B2BGroupSummaryProps) {
  const active = open + assigned;
  const closeRate = formatPct(close, total);
  const openPct = total > 0 ? (open / total) * 100 : 0;
  const assignedPct = total > 0 ? (assigned / total) * 100 : 0;
  const closePct = total > 0 ? (close / total) * 100 : 0;

  return (
    <section className='overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950'>
      <div className='border-b border-slate-200 bg-slate-50 px-4 py-4 dark:border-slate-800 dark:bg-slate-900/70 md:px-5'>
        <div className='flex flex-col gap-3 md:flex-row md:items-center md:justify-between'>
          <div className='flex items-center gap-3'>
            <div className='grid h-10 w-10 place-items-center rounded-xl bg-blue-600 text-white shadow-sm'>
              <BarChart3 className='h-5 w-5' />
            </div>
            <div>
              <p className='text-sm font-black tracking-wide text-slate-950 uppercase dark:text-slate-50'>
                {title} Operational Summary
              </p>
              <p className='text-xs text-slate-500 dark:text-slate-400'>
                {activeGroupCount ?? 0} service group aktif dalam scope harian
              </p>
            </div>
          </div>

          <div className='flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-950'>
            <SignalHigh className='h-4 w-4 text-blue-500' />
            <span className='text-xs font-semibold text-slate-600 dark:text-slate-300'>
              Active load
            </span>
            <span className='font-mono text-sm font-black text-slate-950 dark:text-slate-50'>
              {active.toLocaleString()}
            </span>
          </div>
        </div>
      </div>

      <div className='grid gap-4 p-4 md:grid-cols-[1.2fr_1fr] md:p-5'>
        <div className='space-y-4'>
          <div className='grid grid-cols-2 gap-3 lg:grid-cols-4'>
            <MetricTile
              label='Total'
              value={total.toLocaleString()}
              helper='all B2B tickets'
              tone='blue'
            />
            <MetricTile
              label='Open'
              value={open.toLocaleString()}
              helper={`${formatPct(open, total)} dari total`}
              tone='amber'
            />
            <MetricTile
              label='Assigned'
              value={assigned.toLocaleString()}
              helper='sedang ditangani'
              tone='slate'
            />
            <MetricTile
              label='Close Rate'
              value={closeRate}
              helper={`${close.toLocaleString()} close`}
              tone='emerald'
            />
          </div>

          <div>
            <div className='mb-2 flex items-center justify-between'>
              <p className='text-xs font-bold text-slate-700 dark:text-slate-200'>
                Status composition
              </p>
              <p className='text-[11px] text-slate-500 dark:text-slate-400'>
                Open / Assigned / Close
              </p>
            </div>
            <div className='flex h-3 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800'>
              <div className='bg-amber-400' style={{ width: `${openPct}%` }} />
              <div className='bg-blue-500' style={{ width: `${assignedPct}%` }} />
              <div className='bg-emerald-500' style={{ width: `${closePct}%` }} />
            </div>
          </div>
        </div>

        <div className='grid gap-2 sm:grid-cols-2'>
          <PriorityPill
            icon={<Activity className='h-4 w-4' />}
            label='Reguler'
            value={regulerCount}
            tone='text-slate-500'
          />
          <PriorityPill
            icon={<Clock3 className='h-4 w-4' />}
            label='SQM'
            value={sqmCount}
            tone='text-blue-500'
          />
          <PriorityPill
            icon={<ShieldCheck className='h-4 w-4' />}
            label='FFG'
            value={ffgCount}
            tone='text-emerald-500'
          />
          <PriorityPill
            icon={<AlertTriangle className='h-4 w-4' />}
            label='Gamas'
            value={gamasCount}
            tone='text-amber-500'
          />
          <PriorityPill
            icon={<Flame className='h-4 w-4' />}
            label='P1'
            value={p1Count}
            tone='text-red-500'
          />
          <PriorityPill
            icon={<CheckCircle2 className='h-4 w-4' />}
            label='P+'
            value={pPlusCount}
            tone='text-fuchsia-500'
          />
        </div>
      </div>
    </section>
  );
}
