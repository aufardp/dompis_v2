'use client';

import React from 'react';
import type { LucideIcon } from 'lucide-react';

interface CustomerTypeCardProps {
  icon: LucideIcon;
  name: string;
  total: number;
  open: number;
  assigned: number;
  close: number;
  accentColor: string;
  ttrLabel?: string;
  active?: boolean;
  onClick?: () => void;
  customerCount?: number;
  sqmCount?: number;
  unspecCount?: number;
  ffgCount?: number;
  gamasCount?: number;
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
    <div className='h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800/80'>
      <div
        className='h-full rounded-full transition-all duration-1000 ease-out'
        style={{ width: `${pct}%`, background: color }}
      />
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
  customerCount,
  sqmCount,
  unspecCount,
  ffgCount = 0,
  gamasCount = 0,
  p1Count = 0,
  pPlusCount = 0,
  totalAll,
}: CustomerTypeCardProps) {
  const Icon = icon;
  const shareOfAll =
    totalAll && totalAll > 0 ? ((total / totalAll) * 100).toFixed(1) : null;
  const stats = [
    { label: 'Customer', count: customerCount, color: '#64748b' },
    { label: 'SQM', count: sqmCount, color: accentColor },
    { label: 'Unspec', count: unspecCount, color: '#94a3b8' },
  ].filter((s) => s.count !== undefined);

  return (
    <button
      type='button'
      onClick={onClick}
      aria-pressed={active}
      className={[
        'group relative w-full cursor-pointer overflow-hidden rounded-3xl border bg-(--surface) p-3.5 text-left transition-all duration-300',
        active
          ? 'border-transparent shadow-lg ring-1 ring-inset ring-blue-500/20'
          : 'border-(--border) shadow-sm hover:border-blue-300 hover:shadow-md',
      ].join(' ')}
      style={{ borderColor: active ? accentColor : undefined }}
    >
      <div className='relative z-10 flex items-start justify-between gap-3'>
        <div className='flex min-w-0 flex-col gap-1.5'>
          <span
            className='text-[10px] font-semibold tracking-[0.22em] uppercase opacity-90'
            style={{ color: accentColor }}
          >
            {name}
          </span>
          <div className='flex flex-wrap items-center gap-1.5'>
            {gamasCount > 0 && (
              <span className='inline-flex items-center rounded-full border border-amber-500/20 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-300'>
                GAMAS {gamasCount}
              </span>
            )}
            {ffgCount > 0 && (
              <span className='inline-flex items-center rounded-full border border-orange-500/20 bg-orange-500/10 px-1.5 py-0.5 text-[10px] font-bold text-orange-700 dark:text-orange-300'>
                FFG {ffgCount}
              </span>
            )}
            {p1Count > 0 && (
              <span className='inline-flex items-center rounded-full border border-red-500/20 bg-red-500/10 px-1.5 py-0.5 text-[10px] font-bold text-red-700 dark:text-red-300'>
                Manja HI {p1Count}
              </span>
            )}
          </div>
        </div>
        <div className='grid h-9 w-9 shrink-0 place-items-center rounded-2xl bg-(--surface-2) text-sm font-semibold ring-1 ring-(--border)'>
          <Icon size={16} />
        </div>
      </div>

      <div className='relative z-10 mt-3'>
        <div className='flex items-baseline gap-2'>
          <h2
            className='text-[2.2rem] leading-none font-semibold tracking-tight'
            style={{ color: active ? accentColor : 'inherit' }}
          >
            {total.toLocaleString()}
          </h2>
          <span className='text-[10px] font-bold tracking-wider text-slate-400 uppercase dark:text-slate-500'>
            Tickets
          </span>
        </div>
        {shareOfAll && (
          <p className='mt-0.5 text-[11px] font-medium text-slate-500 dark:text-slate-400'>
            Kontribusi{' '}
            <span className='font-bold text-slate-600 dark:text-slate-300'>
              {shareOfAll}%
            </span>{' '}
            dari total
          </p>
        )}
      </div>

      <div className='relative z-10 mt-3 space-y-2.5'>
        {stats.map((stat) => (
          <div key={stat.label} className='group/item relative'>
            <div className='flex items-center justify-between gap-2 rounded-xl border border-(--border) bg-(--surface-2) px-2.5 py-2'>
              <span className='text-[10px] font-bold tracking-wider text-slate-500 uppercase dark:text-slate-400'>
                {stat.label}
              </span>
              <div className='flex items-baseline gap-1.5'>
                <span
                  className='text-xs font-semibold text-slate-700 dark:text-slate-300'
                  style={{
                    color: stat.label === 'SQM' ? accentColor : undefined,
                  }}
                >
                  {stat.count?.toLocaleString()}
                </span>
                <span className='text-[10px] font-bold text-slate-400 dark:text-slate-500'>
                  {total > 0
                    ? Math.round(((stat.count || 0) / total) * 100)
                    : 0}
                  %
                </span>
              </div>
            </div>
            <MiniBar value={stat.count || 0} max={total} color={stat.color} />
          </div>
        ))}
      </div>

      <div className='relative z-10 mt-3 flex flex-wrap items-center gap-3 border-t border-(--border) pt-3 text-[10px] font-bold tracking-wider uppercase'>
        <div className='flex gap-3'>
          <span className='flex items-center gap-1.5 font-bold text-amber-500'>
            <span className='h-1.5 w-1.5 rounded-full bg-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.5)]' />
            {open} Open
          </span>
          <span className='flex items-center gap-1.5 font-bold text-blue-500'>
            <span className='h-1.5 w-1.5 rounded-full bg-blue-500 shadow-[0_0_6px_rgba(59,130,246,0.5)]' />
            {assigned} Assigned
          </span>
          <span className='flex items-center gap-1.5 font-bold text-emerald-500'>
            <span className='h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)]' />
            {close} Close
          </span>
        </div>
      </div>
    </button>
  );
}
