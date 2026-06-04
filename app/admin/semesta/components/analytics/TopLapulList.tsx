'use client';

import { cn } from '@/app/libs/utils';
import { Repeat } from 'lucide-react';
import type { TopLapulIncident } from '../../hooks/useSemestaAnalyticsV2';

function SkeletonItem() {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <div className="bg-surface-2 h-5 w-5 animate-pulse rounded-full" />
      <div className="bg-surface-2 h-4 flex-1 animate-pulse rounded" />
      <div className="bg-surface-2 h-5 w-10 animate-pulse rounded-full" />
    </div>
  );
}

export default function TopLapulList({
  data,
  loading,
}: {
  data?: TopLapulIncident[];
  loading?: boolean;
}) {
  return (
    <div className="bg-surface overflow-hidden rounded-xl border border-(--border)">
      <div className="px-4 pt-4 pb-2">
        <div className="flex items-center gap-2">
          <Repeat size={14} className="text-orange-400" />
          <div className="font-outfit text-xs font-bold tracking-[1.5px] text-(--text-secondary) uppercase">
            Top LAPUL Incidents
          </div>
        </div>
        <div className="font-dm-sans mt-1 text-xs text-(--text-muted)">
          Incidents re-opened within 60 days
        </div>
      </div>

      <div className="divide-y divide-(--border)/50">
        {loading
          ? Array.from({ length: 5 }, (_, i) => <SkeletonItem key={i} />)
          : data?.length
            ? data.map((item, idx) => (
                <div
                  key={`${item.incident}-${item.workzone}-${idx}`}
                  className="flex items-center gap-3 px-4 py-2.5 transition hover:bg-white/[0.02]"
                >
                  <span
                    className={cn(
                      'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold',
                      idx < 3
                        ? 'bg-orange-500/20 text-orange-300'
                        : 'bg-surface-2 text-(--text-muted)',
                    )}
                  >
                    {idx + 1}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold text-(--text-primary) text-[12px]">
                      {item.incident}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] text-(--text-muted)">
                        {item.workzone}
                      </span>
                      <span className="text-[10px] text-(--text-muted)">
                        {item.firstDate?.slice(0, 10) ?? ''}
                      </span>
                    </div>
                  </div>

                  <span
                    className={cn(
                      'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold',
                      item.occurrences >= 3
                        ? 'bg-red-500/15 text-red-300'
                        : item.occurrences >= 2
                          ? 'bg-orange-500/15 text-orange-300'
                          : 'bg-surface-2 text-(--text-muted)',
                    )}
                  >
                    {item.occurrences.toLocaleString('en-US')}x
                  </span>
                </div>
              ))
            : (
              <div className="px-4 py-6 text-center text-[12px] text-(--text-muted)">
                Tidak ada data LAPUL
              </div>
            )}
      </div>
    </div>
  );
}
