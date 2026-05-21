'use client';

import {
  AlertTriangle,
  Flame,
  ShieldCheck,
  Sparkles,
  Wrench,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/app/libs/utils';

interface FocusItem {
  key: string;
  label: string;
  count: number;
  sub: string;
  tone: 'cyan' | 'red' | 'amber' | 'emerald' | 'slate';
  icon: ReactNode;
}

interface OperationalFocusQueueProps {
  items: FocusItem[];
}

// Skema warna yang cerah, kontras, dan konsisten di light maupun dark mode
const toneClass: Record<
  FocusItem['tone'],
  { card: string; icon: string; text: string; dot: string; num: string }
> = {
  cyan: {
    card: 'border-cyan-200/60 bg-cyan-50/60 text-cyan-950 dark:border-cyan-500/20 dark:bg-cyan-500/[0.06] dark:text-cyan-200',
    icon: 'text-cyan-600 dark:text-cyan-400',
    text: 'text-cyan-700/70 dark:text-cyan-400/60',
    num: 'text-cyan-600 dark:text-cyan-300',
    dot: 'bg-cyan-500 shadow-cyan-500/50',
  },
  red: {
    card: 'border-red-200/60 bg-red-50/60 text-red-950 dark:border-red-500/20 dark:bg-red-500/[0.06] dark:text-red-200',
    icon: 'text-red-600 dark:text-red-400',
    text: 'text-red-700/70 dark:text-red-400/60',
    num: 'text-red-600 dark:text-red-300',
    dot: 'bg-red-500 shadow-red-500/50',
  },
  amber: {
    card: 'border-amber-200/60 bg-amber-50/60 text-amber-950 dark:border-amber-500/20 dark:bg-amber-500/[0.06] dark:text-amber-200',
    icon: 'text-amber-600 dark:text-amber-400',
    text: 'text-amber-700/70 dark:text-amber-400/60',
    num: 'text-amber-600 dark:text-amber-300',
    dot: 'bg-amber-500 shadow-amber-500/50',
  },
  emerald: {
    card: 'border-emerald-200/60 bg-emerald-50/60 text-emerald-950 dark:border-emerald-500/20 dark:bg-emerald-500/[0.06] dark:text-emerald-200',
    icon: 'text-emerald-600 dark:text-emerald-400',
    text: 'text-emerald-700/70 dark:text-emerald-400/60',
    num: 'text-emerald-600 dark:text-emerald-300',
    dot: 'bg-emerald-500 shadow-emerald-500/50',
  },
  slate: {
    card: 'border-slate-200 bg-white text-slate-900 dark:border-slate-800 dark:bg-slate-900/30 dark:text-slate-200',
    icon: 'text-slate-500 dark:text-slate-400',
    text: 'text-slate-500 dark:text-slate-400',
    num: 'text-slate-800 dark:text-slate-200',
    dot: 'bg-slate-400 shadow-slate-400/50',
  },
};

export function buildOperationalFocusItems(counts: {
  diamond: number;
  p1: number;
  gamas: number;
  ffg: number;
  carryOver: number;
}): FocusItem[] {
  return [
    {
      key: 'diamond',
      label: 'Diamond',
      count: counts.diamond,
      sub: 'total B2C+B2B harian',
      tone: 'cyan',
      icon: <Sparkles className='h-3.5 w-3.5' />,
    },
    {
      key: 'p1',
      label: 'P1',
      count: counts.p1,
      sub: 'total B2C+B2B harian',
      tone: 'red',
      icon: <Flame className='h-3.5 w-3.5' />,
    },
    {
      key: 'gamas',
      label: 'Gamas',
      count: counts.gamas,
      sub: 'total B2C+B2B harian',
      tone: 'amber',
      icon: <AlertTriangle className='h-3.5 w-3.5' />,
    },
    {
      key: 'ffg',
      label: 'FFG',
      count: counts.ffg,
      sub: 'total B2C+B2B harian',
      tone: 'emerald',
      icon: <ShieldCheck className='h-3.5 w-3.5' />,
    },
    {
      key: 'carry-over',
      label: 'Carry Over',
      count: counts.carryOver,
      sub: 'total pending harian',
      tone: 'slate',
      icon: <Wrench className='h-3.5 w-3.5' />,
    },
  ];
}

export default function OperationalFocusQueue({
  items,
}: OperationalFocusQueueProps) {
  const activeCount = items.filter((item) => item.count > 0).length;

  return (
    <div className='rounded-2xl border border-slate-200/80 bg-slate-50/50 p-4 shadow-xs dark:border-slate-900/80 dark:bg-slate-950'>
      {/* Header Widget */}
      <div className='mb-4 flex items-center justify-between gap-3'>
        <div>
          <h3 className='text-xs font-black tracking-wider text-slate-400 uppercase dark:text-slate-500'>
            Focus Queue
          </h3>
          <p className='mt-0.5 text-[11px] font-medium text-slate-400 dark:text-slate-500'>
            Antrian prioritas untuk operasional hari ini
          </p>
        </div>
        <span className='rounded-md bg-slate-200/60 px-2 py-0.5 text-[10px] font-bold text-slate-600 dark:bg-slate-900 dark:text-slate-400'>
          {activeCount} Aktif
        </span>
      </div>

      {/* Grid List Card */}
      <div className='grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5'>
        {items.map((item) => {
          const style = toneClass[item.tone];
          const hasCount = item.count > 0;

          return (
            <div
              key={item.key}
              className={cn(
                'flex flex-col justify-between rounded-xl border p-3.5 shadow-2xs transition-all duration-200',
                style.card,
                !hasCount &&
                  'border-dashed border-slate-200 bg-slate-100/40 opacity-30 grayscale-50 dark:border-slate-800 dark:bg-transparent',
              )}
            >
              {/* Top Section: Icon & Title */}
              <div className='flex items-center justify-between gap-2'>
                <div className='flex min-w-0 items-center gap-2'>
                  <span
                    className={cn(
                      'shrink-0',
                      hasCount ? style.icon : 'text-slate-400',
                    )}
                  >
                    {item.icon}
                  </span>
                  <p className='truncate text-[11px] font-black tracking-wide uppercase'>
                    {item.label}
                  </p>
                </div>
                {/* Dot Indicator */}
                {hasCount && (
                  <span className='relative flex h-1.5 w-1.5 shrink-0'>
                    <span
                      className={cn(
                        'absolute inline-flex h-full w-full animate-ping rounded-full opacity-75',
                        style.dot,
                      )}
                    />
                    <span
                      className={cn(
                        'relative inline-flex h-1.5 w-1.5 rounded-full',
                        style.dot,
                      )}
                    />
                  </span>
                )}
              </div>

              {/* Bottom Section: Total Angka & Subtitle */}
              <div className='mt-5'>
                <p
                  className={cn(
                    'text-3xl leading-none font-black tracking-tight',
                    style.num,
                  )}
                >
                  {item.count.toLocaleString()}
                </p>
                <p
                  className={cn(
                    'mt-2 text-[10px] font-semibold tracking-wide',
                    style.text,
                  )}
                >
                  {item.sub}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
