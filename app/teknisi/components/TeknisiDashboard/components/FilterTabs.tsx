'use client';

// app/teknisi/components/TeknisiDashboard/components/FilterTabs.tsx

import { TicketFilter, FILTER_CONFIG } from '../constants/ticket';

interface FilterTabsProps {
  currentFilter: TicketFilter;
  onFilterChange: (filter: TicketFilter) => void;
  stats: {
    assigned: number;
    onProgress: number;
    pending: number;
    closed: number;
  };
  tabsRef: React.RefObject<HTMLDivElement | null>;
  tabButtonRefs: React.MutableRefObject<
    Record<string, HTMLButtonElement | null>
  >;
  showLeftFade: boolean;
  showRightFade: boolean;
  onScroll: () => void;
}

export default function FilterTabs({
  currentFilter,
  onFilterChange,
  stats,
  tabsRef,
  tabButtonRefs,
  showLeftFade,
  showRightFade,
  onScroll,
}: FilterTabsProps) {
  const filters: TicketFilter[] = [
    'all',
    'assigned',
    'on_progress',
    'pending',
    'closed',
  ];

  const getCount = (filter: TicketFilter): number => {
    switch (filter) {
      case 'all':
        return stats.assigned + stats.onProgress;
      case 'assigned':
        return stats.assigned;
      case 'on_progress':
        return stats.onProgress;
      case 'pending':
        return stats.pending;
      case 'closed':
        return stats.closed;
      default:
        return 0;
    }
  };

  const getButtonClass = (filter: TicketFilter): string => {
    const baseClass =
      'shrink-0 snap-center rounded-full px-3.5 py-2.5 text-sm font-semibold transition-all duration-300 min-h-[40px] active:scale-95';
    const isActive = filter === currentFilter;

    return `${baseClass} ${
      isActive
        ? 'bg-black text-white shadow-sm dark:bg-white dark:text-black'
        : 'border border-transparent bg-(--surface-2) text-(--text-secondary) hover:border-(--border) hover:bg-(--surface) dark:bg-(--surface-2) dark:hover:bg-(--surface)'
    }`;
  };

  return (
    <div className='sticky top-14 z-30 -mx-4 bg-transparent px-4 pt-2 pb-3 sm:static sm:top-16 sm:mx-0 sm:px-0'>
      <div className='relative rounded-[28px] border border-(--border) bg-(--surface)/90 p-1.5 shadow-sm backdrop-blur-xl'>
        <div
          ref={tabsRef}
          onScroll={onScroll}
          className='scrollbar-hide flex snap-x snap-mandatory gap-1.5 overflow-x-auto px-1 py-1 whitespace-nowrap'
        >
          {filters.map((filter) => (
            <button
              key={filter}
              ref={(el) => {
                tabButtonRefs.current[filter] = el;
              }}
              onClick={() => onFilterChange(filter)}
              className={getButtonClass(filter)}
            >
              {FILTER_CONFIG[filter].label} ({getCount(filter)})
            </button>
          ))}
        </div>

        {showLeftFade && (
          <div className='pointer-events-none absolute inset-y-0 left-0 w-8 rounded-l-[28px] bg-linear-to-r from-(--surface) to-(--surface)/0' />
        )}
        {showRightFade && (
          <div className='pointer-events-none absolute inset-y-0 right-0 w-8 rounded-r-[28px] bg-linear-to-l from-(--surface) to-(--surface)/0' />
        )}
      </div>
    </div>
  );
}
