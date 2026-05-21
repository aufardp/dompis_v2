'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  Flame,
  ListChecks,
  ShieldCheck,
} from 'lucide-react';
import type { ReactNode } from 'react';
import clsx from 'clsx';
import { Ticket } from '@/app/types/ticket';
import { JENIS_LABELS, normalizeJenis } from '@/app/config/jenis-tiket';

type GroupSummary = {
  total: number;
  open: number;
  assigned: number;
  close: number;
  ffgCount?: number;
  gamasCount?: number;
  p1Count?: number;
  pPlusCount?: number;
};

interface B2BGroupCardProps {
  groupKey: string;
  label: string;
  icon: string;
  tickets: Ticket[];
  summary?: GroupSummary;
}

function pct(value: number, total: number) {
  if (total <= 0) return 0;
  return Math.round((value / total) * 100);
}

function StatusBadge({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: string;
}) {
  return (
    <div className='rounded-lg bg-slate-50 px-2.5 py-2 dark:bg-slate-900/70'>
      <p className={clsx('font-mono text-sm font-black', tone)}>
        {value.toLocaleString()}
      </p>
      <p className='text-[10px] font-semibold text-slate-500 dark:text-slate-400'>
        {label}
      </p>
    </div>
  );
}

function FlagPill({
  label,
  value,
  icon,
  className,
}: {
  label: string;
  value: number;
  icon: ReactNode;
  className: string;
}) {
  if (value <= 0) return null;

  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold',
        className,
      )}
    >
      {icon}
      {label} {value.toLocaleString()}
    </span>
  );
}

export default function B2BGroupCard({
  groupKey,
  label,
  icon,
  tickets,
  summary,
}: B2BGroupCardProps) {
  const storageKey = `b2b:groups:expanded:${groupKey}`;
  const [expanded, setExpanded] = useState(() => {
    if (typeof window === 'undefined') return true;
    const stored = localStorage.getItem(storageKey);
    return stored !== null ? stored === 'true' : true;
  });

  useEffect(() => {
    localStorage.setItem(storageKey, String(expanded));
  }, [expanded, storageKey]);

  const total = summary?.total ?? tickets.length;
  const openCount =
    summary?.open ??
    tickets.filter((t) => !t.status_update || t.status_update === 'open')
      .length;
  const assignedCount =
    summary?.assigned ??
    tickets.filter((t) =>
      ['assigned', 'on_progress', 'pending'].includes(
        String(t.status_update ?? '').toLowerCase(),
      ),
    ).length;
  const closeCount =
    summary?.close ??
    tickets.filter((t) => t.status_update === 'close').length;
  const activeCount = openCount + assignedCount;
  const closeRate = pct(closeCount, total);
  const openRate = pct(openCount, total);
  const assignedRate = pct(assignedCount, total);
  const closeWidth = pct(closeCount, total);
  const isZeroState = total === 0;

  const breakdown = useMemo(() => {
    const countMap = new Map<string, number>();
    for (const t of tickets) {
      const key =
        normalizeJenis(t.jenisTiket) || t.jenisTiket?.toLowerCase() || 'unknown';
      countMap.set(key, (countMap.get(key) || 0) + 1);
    }

    return Array.from(countMap.entries())
      .map(([key, count]) => ({
        key,
        label: JENIS_LABELS[key] ?? key,
        count,
      }))
      .sort((a, b) => b.count - a.count);
  }, [tickets]);

  return (
    <article
      className={clsx(
        'rounded-xl border bg-white shadow-sm transition dark:bg-slate-950/70',
        isZeroState
          ? 'border-slate-200 opacity-55 dark:border-slate-800'
          : 'border-slate-200 hover:border-blue-300 hover:shadow-md dark:border-slate-800 dark:hover:border-blue-800',
      )}
    >
      <button
        type='button'
        onClick={() => setExpanded((value) => !value)}
        className='flex w-full items-start justify-between gap-3 p-4 text-left'
      >
        <div className='flex min-w-0 gap-3'>
          <div className='grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-base dark:bg-slate-900'>
            {icon}
          </div>
          <div className='min-w-0'>
            <div className='flex items-center gap-2'>
              <p className='truncate text-sm font-black text-slate-950 dark:text-slate-50'>
                {label}
              </p>
              {activeCount > 0 && (
                <span className='rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-600 dark:bg-blue-950/40 dark:text-blue-300'>
                  {activeCount} active
                </span>
              )}
            </div>
            <p className='mt-1 text-xs text-slate-500 dark:text-slate-400'>
              {total.toLocaleString()} total tickets · {closeRate}% close rate
            </p>
          </div>
        </div>

        <ChevronDown
          className={clsx(
            'mt-1 h-4 w-4 shrink-0 text-slate-400 transition-transform',
            expanded && 'rotate-180',
          )}
        />
      </button>

      <div className='px-4 pb-4'>
        <div className='grid grid-cols-3 gap-2'>
          <StatusBadge label='Open' value={openCount} tone='text-amber-600' />
          <StatusBadge
            label='Assigned'
            value={assignedCount}
            tone='text-blue-600'
          />
          <StatusBadge label='Close' value={closeCount} tone='text-emerald-600' />
        </div>

        <div className='mt-3 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800'>
          <div className='flex h-full'>
            <div className='bg-amber-400' style={{ width: `${openRate}%` }} />
            <div className='bg-blue-500' style={{ width: `${assignedRate}%` }} />
            <div className='bg-emerald-500' style={{ width: `${closeWidth}%` }} />
          </div>
        </div>

        <div className='mt-3 flex flex-wrap gap-1.5'>
          <FlagPill
            label='P1'
            value={summary?.p1Count ?? 0}
            icon={<Flame className='h-3 w-3' />}
            className='bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300'
          />
          <FlagPill
            label='Gamas'
            value={summary?.gamasCount ?? 0}
            icon={<AlertTriangle className='h-3 w-3' />}
            className='bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
          />
          <FlagPill
            label='FFG'
            value={summary?.ffgCount ?? 0}
            icon={<ShieldCheck className='h-3 w-3' />}
            className='bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
          />
          <FlagPill
            label='P+'
            value={summary?.pPlusCount ?? 0}
            icon={<ListChecks className='h-3 w-3' />}
            className='bg-fuchsia-50 text-fuchsia-700 dark:bg-fuchsia-950/40 dark:text-fuchsia-300'
          />
        </div>

        {expanded && (
          <div className='mt-4 border-t border-slate-200 pt-3 dark:border-slate-800'>
            {breakdown.length > 0 ? (
              <div className='space-y-1.5'>
                {breakdown.slice(0, 4).map((item) => (
                  <div
                    key={item.key}
                    className='flex items-center justify-between rounded-lg px-2 py-1.5 text-xs hover:bg-slate-50 dark:hover:bg-slate-900'
                  >
                    <span className='text-slate-500 dark:text-slate-400'>
                      {item.label}
                    </span>
                    <span className='font-mono font-bold text-slate-950 dark:text-slate-50'>
                      {item.count.toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className='rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:bg-slate-900 dark:text-slate-400'>
                Detail jenis tiket mengikuti summary harian backend.
              </p>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
