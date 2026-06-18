'use client';

import '@aejkatappaja/phantom-ui';
import { cn } from '@/app/libs/utils';
import { AlertTriangle } from 'lucide-react';
import type { TopGaulService } from '../../hooks/useSemestaAnalyticsV2';

function TopGaulLoading() {
  return (
    <phantom-ui suppressHydrationWarning fallback-radius={8}
      loading
      animation='shimmer'
      reveal={0.12}
      loading-label='Loading top GAUL services'
    >
      <div className='overflow-hidden rounded-xl border border-(--border) bg-(--surface)'>
        <div className='px-4 pt-4 pb-3'>
          <div className='flex items-center gap-2'>
            <div className='h-3.5 w-3.5 rounded-full bg-slate-200 dark:bg-slate-800' />
            <div className='h-3.5 w-40 rounded-full bg-slate-200 dark:bg-slate-800' />
          </div>
          <div className='mt-2 h-3 w-56 rounded-full bg-slate-100 dark:bg-slate-800/70' />
        </div>

        <div className='divide-y divide-(--border)/50'>
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className='flex items-center gap-3 px-4 py-3'>
              <div className='h-5 w-5 rounded-full bg-slate-200 dark:bg-slate-800' />
              <div className='min-w-0 flex-1 space-y-2'>
                <div className='h-4 w-3/4 rounded-full bg-slate-200 dark:bg-slate-800' />
                <div className='flex items-center gap-2'>
                  <div className='h-3 w-16 rounded-full bg-slate-100 dark:bg-slate-800/70' />
                  <div className='h-3 w-20 rounded-full bg-slate-100 dark:bg-slate-800/70' />
                </div>
              </div>
              <div className='h-5 w-10 rounded-full bg-slate-200 dark:bg-slate-800' />
            </div>
          ))}
        </div>
      </div>
    </phantom-ui>
  );
}

export default function TopGaulList({
  data,
  loading,
}: {
  data?: TopGaulService[];
  loading?: boolean;
}) {
  if (loading) {
    return <TopGaulLoading />;
  }

  return (
    <div className="bg-surface overflow-hidden rounded-xl border border-(--border)">
      <div className="px-4 pt-4 pb-2">
        <div className="flex items-center gap-2">
          <AlertTriangle size={14} className="text-amber-400" />
          <div className="font-outfit text-xs font-bold tracking-[1.5px] text-(--text-secondary) uppercase">
            Top GAUL Services
          </div>
        </div>
        <div className="font-dm-sans mt-1 text-xs text-(--text-muted)">
          Service numbers with repeat incidents within 60 days
        </div>
      </div>

      <div className="divide-y divide-(--border)/50">
        {data?.length
          ? data.map((item, idx) => (
              <div
                key={`${item.service_no}-${item.workzone}-${idx}`}
                className="flex items-center gap-3 px-4 py-2.5 transition hover:bg-white/[0.02]"
              >
                <span
                  className={cn(
                    'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold',
                    idx < 3
                      ? 'bg-amber-500/20 text-amber-300'
                      : 'bg-surface-2 text-(--text-muted)',
                  )}
                >
                  {idx + 1}
                </span>

                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold text-(--text-primary) text-[12px]">
                    {item.service_no}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] text-(--text-muted)">
                      {item.workzone}
                    </span>
                    <span className="text-[10px] text-(--text-muted)">
                      {item.lastDate?.slice(0, 10) ?? ''}
                    </span>
                  </div>
                </div>

                <span
                  className={cn(
                    'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold',
                    item.occurrences >= 3
                      ? 'bg-red-500/15 text-red-300'
                      : item.occurrences >= 2
                        ? 'bg-amber-500/15 text-amber-300'
                        : 'bg-surface-2 text-(--text-muted)',
                  )}
                >
                  {item.occurrences.toLocaleString('en-US')}x
                </span>
              </div>
            ))
          : (
            <div className="px-4 py-6 text-center text-[12px] text-(--text-muted)">
              Tidak ada data GAUL
            </div>
          )}
      </div>
    </div>
  );
}
