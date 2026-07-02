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

const toneClass: Record<
  FocusItem['tone'],
  { card: string; icon: string; text: string; dot: string; num: string }
> = {
  cyan: {
    card: 'border-cyan-200/60 bg-cyan-50/40 text-cyan-950 dark:border-cyan-500/20 dark:bg-cyan-500/[0.06] dark:text-cyan-100',
    icon: 'text-cyan-600 dark:text-cyan-300',
    text: 'text-cyan-700/80 dark:text-cyan-300/70',
    num: 'text-cyan-700 dark:text-cyan-200',
    dot: 'bg-cyan-500 shadow-cyan-500/50',
  },
  red: {
    card: 'border-red-200/60 bg-red-50/40 text-red-950 dark:border-red-500/20 dark:bg-red-500/[0.06] dark:text-red-100',
    icon: 'text-red-600 dark:text-red-300',
    text: 'text-red-700/80 dark:text-red-300/70',
    num: 'text-red-700 dark:text-red-200',
    dot: 'bg-red-500 shadow-red-500/50',
  },
  amber: {
    card: 'border-amber-200/60 bg-amber-50/40 text-amber-950 dark:border-amber-500/20 dark:bg-amber-500/[0.06] dark:text-amber-100',
    icon: 'text-amber-600 dark:text-amber-300',
    text: 'text-amber-700/80 dark:text-amber-300/70',
    num: 'text-amber-700 dark:text-amber-200',
    dot: 'bg-amber-500 shadow-amber-500/50',
  },
  emerald: {
    card: 'border-emerald-200/60 bg-emerald-50/40 text-emerald-950 dark:border-emerald-500/20 dark:bg-emerald-500/[0.06] dark:text-emerald-100',
    icon: 'text-emerald-600 dark:text-emerald-300',
    text: 'text-emerald-700/80 dark:text-emerald-300/70',
    num: 'text-emerald-700 dark:text-emerald-200',
    dot: 'bg-emerald-500 shadow-emerald-500/50',
  },
  slate: {
    card: 'border-slate-200 bg-white text-slate-900 dark:border-slate-800 dark:bg-slate-900/30 dark:text-slate-200',
    icon: 'text-slate-500 dark:text-slate-400',
    text: 'text-slate-500 dark:text-slate-400',
    num: 'text-slate-800 dark:text-slate-100',
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
      label: 'Manja HI',
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
    <div className='rounded-3xl border border-(--border) bg-(--surface) p-3.5 shadow-sm'>
      <div className='mb-3 flex items-center justify-between gap-3'>
        <div>
          <h3 className='text-[11px] font-bold tracking-[0.22em] text-(--text-secondary) uppercase'>
            Focus Queue
          </h3>
          <p className='mt-1 text-[11px] text-(--text-muted)'>
            Antrian prioritas untuk operasional hari ini
          </p>
        </div>
        <span className='rounded-full border border-(--border) bg-surface-2 px-2.5 py-1 text-[10px] font-bold text-(--text-secondary)'>
          {activeCount} Aktif
        </span>
      </div>

      <div className='grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-5'>
        {items.map((item) => {
          const style = toneClass[item.tone];
          const hasCount = item.count > 0;

          return (
            <div
              key={item.key}
              className={cn(
                'flex flex-col justify-between rounded-2xl border p-3 transition-all duration-200',
                style.card,
                !hasCount &&
                  'border-dashed border-slate-200 bg-slate-100/30 opacity-35 grayscale-50 dark:border-slate-800 dark:bg-transparent',
              )}
            >
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
                  <p className='truncate text-[10px] font-semibold tracking-wide uppercase'>
                    {item.label}
                  </p>
                </div>
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

              <div className='mt-4'>
                <p
                  className={cn(
                    'text-[1.6rem] leading-none font-semibold tracking-tight',
                    style.num,
                  )}
                >
                  {item.count.toLocaleString('id-ID')}
                </p>
                <p
                  className={cn(
                    'mt-1.5 text-[10px] font-semibold tracking-wide',
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
