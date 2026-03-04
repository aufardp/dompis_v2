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
      'shrink-0 snap-center rounded-full px-4 py-2 text-sm font-semibold transition';
    const isActive = filter === currentFilter;

    const activeColors: Record<TicketFilter, string> = {
      all: 'bg-blue-600 text-white',
      assigned: 'bg-amber-500 text-white',
      on_progress: 'bg-blue-600 text-white',
      pending: 'bg-purple-600 text-white',
      closed: 'bg-green-600 text-white',
    };

    return `${baseClass} ${
      isActive ? activeColors[filter] : 'text-slate-600 hover:bg-slate-50'
    }`;
  };

  return (
    <div className='sticky top-0 z-30 -mx-4 px-4 pt-2 pb-3 sm:static sm:mx-0 sm:px-0'>
      <div className='relative rounded-xl bg-white/90 p-2 shadow-sm backdrop-blur'>
        <div
          ref={tabsRef}
          onScroll={onScroll}
          className='scrollbar-hide flex snap-x snap-mandatory gap-2 overflow-x-auto px-1 py-1.5 whitespace-nowrap'
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
          <div className='pointer-events-none absolute inset-y-0 left-0 w-8 rounded-l-xl bg-linear-to-r from-white to-white/0' />
        )}
        {showRightFade && (
          <div className='pointer-events-none absolute inset-y-0 right-0 w-8 rounded-r-xl bg-linear-to-l from-white to-white/0' />
        )}
      </div>
    </div>
  );
}
