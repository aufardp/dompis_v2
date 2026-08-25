'use client';

import clsx from 'clsx';
import { Timer, Sun, Moon, CheckCircle2, XCircle, Gauge } from 'lucide-react';
import {
  useTtrComplianceOverview,
  type TtrPeriod,
} from '@/app/hooks/useTtrComplianceOverview';

const PERIOD_OPTIONS: { value: TtrPeriod; label: string }[] = [
  { value: 'today', label: 'Hari Ini' },
  { value: 'week', label: 'Minggu Ini' },
  { value: 'month', label: 'Bulan Ini' },
];

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: typeof Timer;
  label: string;
  value: string;
  sub?: string;
  tone: 'blue' | 'slate' | 'emerald' | 'red' | 'violet';
}) {
  const toneStyles: Record<typeof tone, string> = {
    blue: 'border-blue-500/15 bg-blue-500/[0.06] text-blue-700 dark:text-blue-200',
    slate:
      'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-950/30 dark:text-slate-200',
    emerald:
      'border-emerald-500/15 bg-emerald-500/[0.06] text-emerald-700 dark:text-emerald-200',
    red: 'border-red-500/15 bg-red-500/[0.06] text-red-700 dark:text-red-200',
    violet:
      'border-violet-500/15 bg-violet-500/[0.06] text-violet-700 dark:text-violet-200',
  };

  return (
    <div
      className={clsx(
        'rounded-2xl border px-3.5 py-3 shadow-sm',
        toneStyles[tone],
      )}
    >
      <div className='flex items-center gap-2'>
        <span className='flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-white/60 dark:bg-white/5'>
          <Icon size={14} />
        </span>
        <p className='truncate text-[9px] font-bold tracking-[0.2em] text-(--text-muted) uppercase'>
          {label}
        </p>
      </div>
      <p className='mt-2 text-lg leading-none font-semibold tracking-tight text-(--text-primary)'>
        {value}
      </p>
      {sub && (
        <p className='mt-1.5 text-[10px] font-medium text-(--text-secondary)'>
          {sub}
        </p>
      )}
    </div>
  );
}

export default function TtrComplianceHeaderRow({
  period,
  onPeriodChange,
  workzone,
  branch,
}: {
  period: TtrPeriod;
  onPeriodChange: (period: TtrPeriod) => void;
  workzone?: string;
  branch?: string;
}) {
  const { data, isLoading } = useTtrComplianceOverview({
    period,
    workzone,
    branch,
  });

  const complyTotal = data?.complyTotal ?? 0;
  const notComplyTotal = data?.notComplyTotal ?? 0;
  const complyRate =
    complyTotal + notComplyTotal > 0
      ? Math.round((complyTotal / (complyTotal + notComplyTotal)) * 100)
      : 0;

  return (
    <div className='rounded-3xl border border-(--border) bg-(--surface) p-4 shadow-sm'>
      <div className='mb-3 flex flex-wrap items-center justify-between gap-2'>
        <div>
          <p className='text-[10px] font-bold tracking-[0.22em] text-(--text-secondary) uppercase'>
            TTR SQM Compliance
          </p>
          <p className='mt-1 text-sm font-semibold text-(--text-primary)'>
            TTR SQM, SQM Open, dan SLA
          </p>
        </div>
        <div className='flex flex-wrap gap-1.5'>
          {PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => onPeriodChange(opt.value)}
              className={clsx(
                'shrink-0 rounded-full px-3 py-1.5 text-[11px] font-semibold transition-all',
                opt.value === period
                  ? 'bg-blue-500 text-white shadow-sm'
                  : 'bg-surface-2 border border-(--border) text-(--text-secondary) hover:bg-(--surface-hover) hover:text-(--text-primary)',
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className='grid gap-2 sm:grid-cols-2 xl:grid-cols-5'>
        <StatCard
          icon={Gauge}
          label='MTTR Close'
          value={isLoading ? '...' : (data?.mttrFormatted ?? '-')}
          sub='reported → closed'
          tone='violet'
        />
        <StatCard
          icon={Sun}
          label='WorkHour'
          value={
            isLoading
              ? '...'
              : (data?.workHourCount ?? 0).toLocaleString('id-ID')
          }
          sub='SQM dilaporkan 08:00–17:00'
          tone='blue'
        />
        <StatCard
          icon={Moon}
          label='Non-WorkHour'
          value={
            isLoading
              ? '...'
              : (data?.nonWorkHourCount ?? 0).toLocaleString('id-ID')
          }
          sub='SQM dilaporkan 17:00–08:00'
          tone='slate'
        />
        <StatCard
          icon={CheckCircle2}
          label='Comply / Not Comply'
          value={
            isLoading
              ? '...'
              : `${complyTotal.toLocaleString('id-ID')} / ${notComplyTotal.toLocaleString('id-ID')}`
          }
          sub={`${complyRate}% comply`}
          tone='emerald'
        />
        <StatCard
          icon={XCircle}
          label='TTR Comply SQM 4H'
          value={
            isLoading ? '...' : `${data?.sqmWorkHourCompliance.percent ?? 0}%`
          }
          sub={
            data?.sqmWorkHourCompliance.target
              ? `Target ${data.sqmWorkHourCompliance.target}% · Ach ${data.sqmWorkHourCompliance.achievement ?? '-'}%`
              : 'Target belum diatur'
          }
          tone='red'
        />
      </div>
    </div>
  );
}
