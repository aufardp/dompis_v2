'use client';

import React from 'react';

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
    <div className='relative flex h-12 w-12 shrink-0 items-center justify-center'>
      <svg className='absolute inset-0 -rotate-90' viewBox='0 0 44 44'>
        <circle
          cx='22'
          cy='22'
          r={radius}
          fill='none'
          className='stroke-slate-100 dark:stroke-slate-800'
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
          className='transition-all duration-1000 ease-in-out'
        />
      </svg>
      <span className='text-lg transition-transform duration-300 group-hover:scale-110'>
        {icon}
      </span>
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
  const shareOfAll =
    totalAll && totalAll > 0 ? ((total / totalAll) * 100).toFixed(1) : null;

  // Data mapping untuk iterasi baris progress
  const stats = [
    { label: 'Customer', count: customerCount, color: '#64748b', icon: '📋' },
    { label: 'SQM', count: sqmCount, color: accentColor, icon: '📊' },
    { label: 'Unspec', count: unspecCount, color: '#94a3b8', icon: '❓' },
  ].filter((s) => s.count !== undefined);

  return (
    <button
      type='button'
      onClick={onClick}
      aria-pressed={active}
      className={[
        'group relative w-full cursor-pointer overflow-hidden rounded-3xl p-6 text-left transition-all duration-300',
        'border-2 bg-white transition-shadow duration-300 dark:bg-slate-900/60',
        active
          ? 'scale-[1.01] shadow-xl dark:border-slate-700'
          : 'border-transparent shadow-xs hover:bg-slate-50/60 hover:shadow-lg dark:hover:bg-slate-800/40',
      ].join(' ')}
      style={{ borderColor: active ? accentColor : undefined }}
    >
      {/* Decorative Background Glow (Dioptimalkan agar tidak terlalu gelap) */}
      {active && (
        <div
          className='pointer-events-none absolute -top-12 -right-12 h-36 w-36 rounded-full opacity-15 blur-[60px]'
          style={{ backgroundColor: accentColor }}
        />
      )}

      {/* Header Section */}
      <div className='relative z-10 mb-6 flex items-start justify-between gap-4'>
        <div className='flex min-w-0 flex-col gap-1.5'>
          <span
            className='text-[11px] font-black tracking-[0.15em] uppercase opacity-90'
            style={{ color: accentColor }}
          >
            {name}
          </span>
          {/* Tempat Penampungan Badge Urgent/Gamas */}
          <div className='mt-0.5 flex flex-wrap items-center gap-1.5'>
            {gamasCount > 0 && (
              <span className='inline-flex items-center rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-600 shadow-2xs dark:text-amber-400'>
                📢 GAMAS {gamasCount}
              </span>
            )}
            {ffgCount > 0 && (
              <span className='inline-flex items-center rounded-md border border-orange-500/30 bg-orange-500/10 px-2 py-0.5 text-[10px] font-bold text-orange-600 shadow-2xs dark:text-orange-400'>
                🔥 FFG {ffgCount}
              </span>
            )}
            {p1Count > 0 && (
              <span className='inline-flex items-center rounded-md border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[10px] font-bold text-red-600 shadow-2xs dark:text-red-400'>
                ⚡ P1 {p1Count}
              </span>
            )}
          </div>
        </div>
        <ProgressRing
          value={total}
          max={totalAll ?? total}
          color={accentColor}
          icon={icon}
        />
      </div>

      {/* Big Number Section */}
      <div className='relative z-10 mb-6'>
        <div className='flex items-baseline gap-2'>
          <h2
            className='text-5xl font-black tracking-tight'
            style={{ color: active ? accentColor : 'inherit' }}
          >
            {total.toLocaleString()}
          </h2>
          <span className='text-[10px] font-bold tracking-wider text-slate-400 uppercase dark:text-slate-500'>
            Tickets
          </span>
        </div>
        {shareOfAll && (
          <p className='mt-0.5 text-[11px] font-medium text-slate-400 dark:text-slate-500'>
            Kontribusi{' '}
            <span className='font-bold text-slate-600 dark:text-slate-300'>
              {shareOfAll}%
            </span>{' '}
            dari total
          </p>
        )}
      </div>

      {/* Stats Integrated Rows */}
      <div className='relative z-10 mb-6 space-y-3.5'>
        {stats.map((stat) => (
          <div key={stat.label} className='group/item relative'>
            <div className='mb-1 flex items-center justify-between'>
              <div className='flex items-center gap-1.5'>
                <span className='text-xs opacity-80'>{stat.icon}</span>
                <span className='text-[10px] font-bold tracking-wider text-slate-400 uppercase dark:text-slate-500'>
                  {stat.label}
                </span>
              </div>
              <div className='flex items-baseline gap-1.5'>
                <span
                  className='text-xs font-black text-slate-700 dark:text-slate-300'
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

      {/* Footer Status Section (Clean & Flat) */}
      <div className='relative z-10 flex items-center justify-between border-t border-slate-100 pt-4 dark:border-slate-800/60'>
        <div className='flex gap-4 text-[10px] font-bold tracking-wider uppercase'>
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
