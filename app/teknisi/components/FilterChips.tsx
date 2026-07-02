'use client';

import { useRef } from 'react';
import type { TicketFilter } from './TeknisiDashboard/constants/ticket';

interface FilterChipsProps {
  stats: {
    assigned: number;
    onProgress: number;
    pending: number;
    closed: number;
    totalAktif: number;
  };
  activeFilter: TicketFilter;
  onFilterChange: (filter: TicketFilter) => void;
}

const CHIPS: { key: TicketFilter; label: string }[] = [
  { key: 'all', label: 'Active' },
  { key: 'assigned', label: 'Waiting' },
  { key: 'on_progress', label: 'On Progress' },
  { key: 'pending', label: 'Pending' },
  { key: 'closed', label: 'Closed' },
];

export default function FilterChips({
  stats,
  activeFilter,
  onFilterChange,
}: FilterChipsProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const getCount = (key: TicketFilter) => {
    switch (key) {
      case 'all':
        return stats.totalAktif;
      case 'assigned':
        return stats.assigned;
      case 'on_progress':
        return stats.onProgress;
      case 'pending':
        return stats.pending;
      case 'closed':
        return stats.closed;
    }
  };

  return (
    <div
      ref={scrollRef}
      className='flex gap-2 overflow-x-auto scrollbar-hide'
    >
      {CHIPS.map((chip) => {
        const isActive = activeFilter === chip.key;
        const count = getCount(chip.key);

        return (
          <button
            key={chip.key}
            type='button'
            onClick={() => onFilterChange(chip.key)}
            className={[
              'inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold transition-all active:scale-95',
              isActive
                ? 'bg-[#0052cc] text-white shadow-sm'
                : 'border border-(--border) bg-(--surface-2) text-(--text-secondary) hover:bg-(--surface-3)',
            ].join(' ')}
          >
            {chip.label}
            {count > 0 && (
              <span
                className={[
                  'inline-flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-bold',
                  isActive
                    ? 'bg-white/20 text-white'
                    : 'bg-(--surface-3) text-(--text-muted)',
                ].join(' ')}
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
