'use client';

import { clsx } from 'clsx';

export type FlaggingFilter = 'all' | 'ffg' | 'p1' | 'pplus';

interface FlaggingFilterTabsProps {
  counts: {
    all: number;
    ffg: number;
    p1: number;
    pplus: number;
  };
  activeFilter: FlaggingFilter;
  onFilterChange: (filter: FlaggingFilter) => void;
}

const tabs: { id: FlaggingFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'ffg', label: 'FFG' },
  { id: 'p1', label: 'P1' },
  { id: 'pplus', label: 'P+' },
];

export function FlaggingFilterTabs({
  counts,
  activeFilter,
  onFilterChange,
}: FlaggingFilterTabsProps) {
  const getCount = (id: FlaggingFilter): number => {
    switch (id) {
      case 'all':
        return counts.all;
      case 'ffg':
        return counts.ffg;
      case 'p1':
        return counts.p1;
      case 'pplus':
        return counts.pplus;
      default:
        return 0;
    }
  };

  return (
    <div className='flex items-center gap-2 rounded-xl bg-slate-100 p-1 dark:bg-slate-800'>
      {tabs.map((tab) => {
        const isActive = activeFilter === tab.id;
        const count = getCount(tab.id);

        return (
          <button
            key={tab.id}
            onClick={() => onFilterChange(tab.id)}
            className={clsx(
              'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all',
              isActive
                ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100'
                : 'text-slate-500 hover:bg-slate-200 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200',
              tab.id === 'ffg' && !isActive && 'text-purple-600',
              tab.id === 'p1' && !isActive && 'text-red-600',
              tab.id === 'pplus' && !isActive && 'text-amber-600',
            )}
          >
            <span>{tab.label}</span>
            {count > 0 && (
              <span
                className={clsx(
                  'rounded-full px-1.5 py-0.5 text-[10px] font-bold',
                  isActive
                    ? 'bg-slate-100 text-slate-600 dark:bg-slate-600 dark:text-slate-300'
                    : tab.id === 'ffg'
                      ? 'bg-purple-100 text-purple-700'
                      : tab.id === 'p1'
                        ? 'bg-red-100 text-red-700'
                        : 'bg-amber-100 text-amber-700',
                )}
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
