'use client';

import { AlertTriangle, Flame, ShieldCheck, Sparkles, Wrench } from 'lucide-react';
import type { ReactNode } from 'react';

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

const toneClass: Record<FocusItem['tone'], string> = {
  cyan: 'border-cyan-200 bg-cyan-50 text-cyan-900 dark:border-cyan-900/60 dark:bg-cyan-950/30 dark:text-cyan-100',
  red: 'border-red-200 bg-red-50 text-red-950 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-100',
  amber: 'border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100',
  emerald: 'border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-100',
  slate: 'border-slate-200 bg-white text-slate-950 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100',
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
      icon: <Sparkles className="h-4 w-4" />,
    },
    {
      key: 'p1',
      label: 'P1',
      count: counts.p1,
      sub: 'total B2C+B2B harian',
      tone: 'red',
      icon: <Flame className="h-4 w-4" />,
    },
    {
      key: 'gamas',
      label: 'Gamas',
      count: counts.gamas,
      sub: 'total B2C+B2B harian',
      tone: 'amber',
      icon: <AlertTriangle className="h-4 w-4" />,
    },
    {
      key: 'ffg',
      label: 'FFG',
      count: counts.ffg,
      sub: 'total B2C+B2B harian',
      tone: 'emerald',
      icon: <ShieldCheck className="h-4 w-4" />,
    },
    {
      key: 'carry-over',
      label: 'Carry Over',
      count: counts.carryOver,
      sub: 'total pending harian',
      tone: 'slate',
      icon: <Wrench className="h-4 w-4" />,
    },
  ];
}

export default function OperationalFocusQueue({
  items,
}: OperationalFocusQueueProps) {
  const activeItems = items.filter((item) => item.count > 0);

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950/50">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-slate-950 dark:text-slate-50">
            Focus Queue
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Antrian prioritas untuk operasional hari ini
          </p>
        </div>
        <span className="rounded-full bg-slate-200 px-2 py-1 text-[10px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          {activeItems.length} aktif
        </span>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-5">
        {items.map((item) => (
          <div
            key={item.key}
            className={`rounded-lg border px-3 py-2.5 ${toneClass[item.tone]}`}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-slate-500 dark:text-slate-400">{item.icon}</span>
                <p className="text-xs font-bold uppercase tracking-wide">{item.label}</p>
              </div>
              <p className="text-xl font-black leading-none">{item.count}</p>
            </div>
            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{item.sub}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
