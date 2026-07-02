'use client';

import { Clock, CheckCircle2, PauseCircle, Wrench } from 'lucide-react';
import type { TicketFilter } from './TeknisiDashboard/constants/ticket';

interface StatusGridProps {
  stats: {
    assigned: number;
    onProgress: number;
    pending: number;
    closed: number;
  };
  loading: boolean;
  activeFilter: TicketFilter;
  onFilterChange: (filter: TicketFilter) => void;
}

const STATUS_ITEMS = [
  {
    key: 'assigned' as TicketFilter,
    label: 'Menunggu',
    icon: Clock,
    color: 'text-orange-500',
    bg: 'bg-orange-50 dark:bg-orange-500/10',
    border: 'border-orange-200 dark:border-orange-500/20',
  },
  {
    key: 'on_progress' as TicketFilter,
    label: 'Dikerjakan',
    icon: Wrench,
    color: 'text-blue-500',
    bg: 'bg-blue-50 dark:bg-blue-500/10',
    border: 'border-blue-200 dark:border-blue-500/20',
  },
  {
    key: 'pending' as TicketFilter,
    label: 'Pending',
    icon: PauseCircle,
    color: 'text-purple-500',
    bg: 'bg-purple-50 dark:bg-purple-500/10',
    border: 'border-purple-200 dark:border-purple-500/20',
  },
  {
    key: 'closed' as TicketFilter,
    label: 'Selesai',
    icon: CheckCircle2,
    color: 'text-green-500',
    bg: 'bg-green-50 dark:bg-green-500/10',
    border: 'border-green-200 dark:border-green-500/20',
  },
] as const;

export default function StatusGrid({
  stats,
  loading,
  activeFilter,
  onFilterChange,
}: StatusGridProps) {
  return (
    <div className='grid grid-cols-2 gap-3'>
      {STATUS_ITEMS.map((item) => {
        const Icon = item.icon;
        const count =
          item.key === 'assigned'
            ? stats.assigned
            : item.key === 'on_progress'
              ? stats.onProgress
              : item.key === 'pending'
                ? stats.pending
                : stats.closed;

        const isActive = activeFilter === item.key;

        return (
          <button
            key={item.key}
            type='button'
            onClick={() => onFilterChange(item.key)}
            className={[
              'flex items-center gap-3 rounded-2xl border p-4 text-left transition-all active:scale-[0.97]',
              isActive
                ? 'border-[#0052cc] bg-[#0052cc]/5 ring-2 ring-[#0052cc]/20 dark:bg-[#0052cc]/10'
                : `${item.bg} ${item.border}`,
            ].join(' ')}
          >
            <div
              className={[
                'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
                item.bg,
              ].join(' ')}
            >
              <Icon size={20} className={item.color} />
            </div>
            <div className='min-w-0'>
              <p className='text-xs font-medium text-(--text-secondary)'>{item.label}</p>
              <p className='text-lg font-semibold text-(--text-primary)'>
                {loading ? (
                  <span className='inline-block h-5 w-8 animate-pulse rounded bg-(--surface-3)' />
                ) : (
                  count
                )}
              </p>
            </div>
          </button>
        );
      })}
    </div>
  );
}
