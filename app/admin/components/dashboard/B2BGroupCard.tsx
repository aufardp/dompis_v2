'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import clsx from 'clsx';
import { Ticket } from '@/app/types/ticket';
import { JENIS_LABELS, normalizeJenis } from '@/app/config/jenis-tiket';
import {
  isTicketClosed,
  isTicketInWork,
  isTicketOpenLike,
} from '@/app/libs/ticket-utils';

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
  loading?: boolean;
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
    <div className='rounded-lg bg-slate-50 px-2.5 py-1.5 dark:bg-slate-900/70'>
      <p className={clsx('font-mono text-xs font-black', tone)}>
        {value.toLocaleString()}
      </p>
      <p className='text-[9px] font-semibold text-slate-500 dark:text-slate-400'>
        {label}
      </p>
    </div>
  );
}

export default function B2BGroupCard({
  groupKey,
  label,
  icon,
  tickets,
  summary,
  loading = false,
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
    tickets.filter((t) => isTicketOpenLike(t.status_update))
      .length;
  const assignedCount =
    summary?.assigned ??
    tickets.filter((t) => isTicketInWork(t.status_update)).length;
  const closeCount =
    summary?.close ??
    tickets.filter((t) => isTicketClosed(t.status_update)).length;
  const activeCount = openCount + assignedCount;
  const closeRate = pct(closeCount, total);
  const openRate = pct(openCount, total);
  const assignedRate = pct(assignedCount, total);
  const closeWidth = pct(closeCount, total);
  const isZeroState = total === 0;
  const displayTotal = loading ? '888' : total.toLocaleString();
  const displayOpen = loading ? 888 : openCount;
  const displayAssigned = loading ? 888 : assignedCount;
  const displayClose = loading ? 888 : closeCount;
  const displayCloseRate = loading ? '88%' : `${closeRate}%`;
  const displayActiveCount = loading ? '88' : activeCount.toLocaleString();

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
    <phantom-ui suppressHydrationWarning fallback-radius={8}
      loading={loading}
      animation='shimmer'
      reveal={0.12}
      loading-label={`${label} loading`}
    >
      <article
        className={clsx(
          'rounded-2xl border bg-(--surface) shadow-sm transition',
          isZeroState
            ? 'border-(--border) opacity-60'
            : 'border-(--border) hover:border-blue-300 hover:shadow-md',
        )}
      >
        <button
          type='button'
          onClick={() => setExpanded((value) => !value)}
          className='flex w-full items-start justify-between gap-3 p-3.5 text-left md:p-4'
        >
          <div className='flex min-w-0 gap-3'>
            <div className='grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-(--surface-2) text-sm ring-1 ring-(--border)'>
              {icon}
            </div>
            <div className='min-w-0'>
              <div className='flex items-center gap-2'>
                <p className='truncate text-[13px] font-black text-(--text-primary)'>
                  {label}
                </p>
                {displayActiveCount !== '0' && (
                  <span className='rounded-full bg-blue-50 px-2 py-0.5 text-[9px] font-bold text-blue-700 dark:bg-blue-950/40 dark:text-blue-300'>
                    {displayActiveCount} active
                  </span>
                )}
              </div>
              <p className='mt-0.5 text-[11px] text-(--text-secondary)'>
                {displayTotal} total tickets · {displayCloseRate} close rate
              </p>
            </div>
          </div>

          <ChevronDown
            className={clsx(
              'mt-1 h-4 w-4 shrink-0 text-(--text-muted) transition-transform',
              expanded && 'rotate-180',
            )}
          />
        </button>

        <div className='px-3.5 pb-3.5 md:px-4 md:pb-4'>
          <div className='grid grid-cols-3 gap-1.5'>
            <StatusBadge label='Open' value={displayOpen} tone='text-amber-600' />
            <StatusBadge
              label='Assigned'
              value={displayAssigned}
              tone='text-blue-600'
            />
            <StatusBadge label='Close' value={displayClose} tone='text-emerald-600' />
          </div>

          <div className='mt-2.5 h-1.5 overflow-hidden rounded-full bg-(--surface-3)'>
            <div className='flex h-full'>
              <div className='bg-amber-400' style={{ width: `${openRate}%` }} />
              <div className='bg-blue-500' style={{ width: `${assignedRate}%` }} />
              <div className='bg-emerald-500' style={{ width: `${closeWidth}%` }} />
            </div>
          </div>

          {expanded && (
            <div className='mt-3 border-t border-(--border) pt-2.5'>
              {breakdown.length > 0 ? (
                <div className='space-y-1'>
                  {breakdown.slice(0, 2).map((item) => (
                    <div
                      key={item.key}
                      className='flex items-center justify-between rounded-lg px-2 py-1 text-xs hover:bg-(--surface-2)'
                    >
                      <span className='text-(--text-secondary)'>
                        {item.label}
                      </span>
                      <span className='font-mono font-bold text-(--text-primary)'>
                        {item.count.toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className='rounded-lg bg-(--surface-2) px-3 py-2 text-xs text-(--text-secondary)'>
                  Detail jenis tiket mengikuti summary harian backend.
                </p>
              )}
            </div>
          )}
        </div>
      </article>
    </phantom-ui>
  );
}
