'use client';

import clsx from 'clsx';
import {
  useTtrComplianceOverview,
  type SegComplianceData,
  type TtrPeriod,
} from '@/app/hooks/useTtrComplianceOverview';

const TIER_META: { key: 'manja' | 'diamond' | 'platinum' | 'gold' | 'reguler'; label: string; tone: string }[] = [
  { key: 'manja', label: '3Jam_MANJA', tone: 'border-red-500/15 bg-red-500/[0.05]' },
  { key: 'diamond', label: '3Jam_DIAMOND', tone: 'border-sky-500/15 bg-sky-500/[0.05]' },
  { key: 'platinum', label: '6Jam_PLATINUM', tone: 'border-indigo-500/15 bg-indigo-500/[0.05]' },
  { key: 'gold', label: '12Jam_GOLD', tone: 'border-amber-500/15 bg-amber-500/[0.05]' },
  { key: 'reguler', label: '24Jam_REGULER', tone: 'border-emerald-500/15 bg-emerald-500/[0.05]' },
];

function TierCard({ label, tone, data }: { label: string; tone: string; data?: SegComplianceData }) {
  const achieved = data?.achievement != null && data.achievement >= 100;

  return (
    <div className={clsx('rounded-2xl border p-3.5 shadow-sm', tone)}>
      <p className='truncate text-[10px] font-bold tracking-[0.16em] text-(--text-secondary) uppercase'>
        {label}
      </p>
      <p className='mt-1.5 text-[10px] text-(--text-muted)'>
        Total Tiket Close: <span className='font-semibold text-(--text-primary)'>{data?.totalClose ?? 0}</span>
      </p>

      <div className='mt-2 grid grid-cols-2 gap-1.5 text-[10px]'>
        <div className='rounded-xl bg-white/50 px-2 py-1.5 dark:bg-white/5'>
          <p className='text-(--text-muted) uppercase'>GAMAS</p>
          <p className='font-semibold text-(--text-primary)'>
            C {data?.gamas.comply ?? 0} · NC {data?.gamas.notComply ?? 0}
          </p>
        </div>
        <div className='rounded-xl bg-white/50 px-2 py-1.5 dark:bg-white/5'>
          <p className='text-(--text-muted) uppercase'>Non-GAMAS</p>
          <p className='font-semibold text-(--text-primary)'>
            C {data?.nonGamas.comply ?? 0} · NC {data?.nonGamas.notComply ?? 0}
          </p>
        </div>
      </div>

      <div className='mt-3 flex items-center justify-between gap-2 border-t border-(--border)/60 pt-2.5'>
        <div>
          <p className='text-[9px] font-bold tracking-[0.16em] text-(--text-muted) uppercase'>Realisasi</p>
          <p className='text-lg leading-none font-semibold text-(--text-primary)'>{data?.percent ?? 0}%</p>
        </div>
        <div className='text-right'>
          <p className='text-[9px] font-bold tracking-[0.16em] text-(--text-muted) uppercase'>Ach KPI</p>
          <p
            className={clsx(
              'text-lg leading-none font-semibold',
              data?.achievement == null
                ? 'text-(--text-muted)'
                : achieved
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-red-600 dark:text-red-400',
            )}
          >
            {data?.achievement != null ? `${data.achievement}%` : '-'}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function TtrComplianceTierRow({
  period,
  workzone,
  branch,
}: {
  period: TtrPeriod;
  workzone?: string;
  branch?: string;
}) {
  const { data, isLoading } = useTtrComplianceOverview({ period, workzone, branch });

  return (
    <div className='rounded-3xl border border-(--border) bg-(--surface) p-4 shadow-sm'>
      <div className='mb-3'>
        <p className='text-[10px] font-bold tracking-[0.22em] text-(--text-secondary) uppercase'>
          TTR Compliance per Tier
        </p>
        <p className='mt-1 text-sm font-semibold text-(--text-primary)'>
          Realisasi &amp; achievement per kategori SLA, breakdown GAMAS/Non-GAMAS
        </p>
      </div>

      {isLoading ? (
        <div className='grid gap-2 sm:grid-cols-2 xl:grid-cols-5'>
          {TIER_META.map((t) => (
            <div key={t.key} className='h-40 animate-pulse rounded-2xl bg-(--surface-2)' />
          ))}
        </div>
      ) : (
        <div className='grid gap-2 sm:grid-cols-2 xl:grid-cols-5'>
          {TIER_META.map((t) => (
            <TierCard key={t.key} label={t.label} tone={t.tone} data={data?.tiers[t.key]} />
          ))}
        </div>
      )}
    </div>
  );
}
