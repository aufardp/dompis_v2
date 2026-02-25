'use client';
import { useState } from 'react';
import { cn } from '@/app/libs/utils';

type Dept = 'all' | 'b2b' | 'b2c';
type TicketType = 'all' | 'reguler' | 'sqm';
type HasilVisit =
  | 'all'
  | 'OPEN'
  | 'ASSIGNED'
  | 'ON_PROGRESS'
  | 'PENDING'
  | 'ESCALATED'
  | 'CANCELLED'
  | 'CLOSE';

interface DeptFilterBarProps {
  onDeptChange?: (dept: Dept) => void;
  onTypeChange?: (type: TicketType) => void;
  onStatusChange?: (status: HasilVisit) => void;
}

export function DeptFilterBar({
  onDeptChange,
  onTypeChange,
  onStatusChange,
}: DeptFilterBarProps) {
  const [dept, setDept] = useState<Dept>('all');
  const [ticketType, setTicketType] = useState<TicketType>('all');
  const [hasilVisit, setHasilVisit] = useState<HasilVisit>('all');
  const [showMobileFilters, setShowMobileFilters] = useState(false);

  const handleDeptChange = (newDept: Dept) => {
    setDept(newDept);
    onDeptChange?.(newDept);
  };

  const handleTypeChange = (newType: TicketType) => {
    setTicketType(newType);
    onTypeChange?.(newType);
  };

  const handleStatusChange = (next: HasilVisit) => {
    setHasilVisit(next);
    onStatusChange?.(next);
  };

  return (
    <div className='space-y-3'>
      {/* Mobile Filter Toggle */}
      <div className='flex items-center justify-between lg:hidden'>
        <button
          onClick={() => setShowMobileFilters(!showMobileFilters)}
          className='bg-surface-2 flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-[var(--text-secondary)]'
        >
          <span>Filters</span>
          <span className='rounded-full bg-blue-500/20 px-2 py-0.5 text-xs text-blue-400'>
            {(dept !== 'all' ? 1 : 0) +
              (ticketType !== 'all' ? 1 : 0) +
              (hasilVisit !== 'all' ? 1 : 0)}
          </span>
        </button>
      </div>

      {/* Desktop Filters */}
      <div
        className={cn(
          'flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between',
          showMobileFilters ? 'flex' : 'hidden lg:flex',
        )}
      >
        {/* Dept Tabs */}
        <div className='scrollbar-hide flex w-full overflow-x-auto pb-2 lg:w-auto lg:pb-0'>
          <div className='bg-surface flex gap-1 rounded-lg border border-[var(--border)] p-1'>
            {(
              [
                { label: 'B2B', key: 'b2b' },
                { label: 'B2C', key: 'b2c' },
                { label: 'Semua', key: 'all' },
              ] as const
            ).map(({ label, key }) => {
              return (
                <button
                  key={key}
                  onClick={() => handleDeptChange(key)}
                  className={cn(
                    'rounded-md px-4 py-2 text-sm font-semibold whitespace-nowrap transition-all md:px-5',
                    dept === key &&
                      key === 'b2b' &&
                      'bg-blue-500/10 text-blue-400',
                    dept === key &&
                      key === 'b2c' &&
                      'bg-violet-500/10 text-violet-400',
                    dept === key &&
                      key === 'all' &&
                      'bg-surface-2 text-(--text-primary)',
                    dept !== key &&
                      'hover:bg-surface-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
                  )}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Ticket Type Pills */}
        <div className='scrollbar-hide flex w-full overflow-x-auto pb-2 lg:w-auto lg:pb-0'>
          <div className='flex gap-2'>
            {[
              {
                key: 'reguler',
                label: 'Reguler',
                activeClass:
                  'bg-emerald-400/15 border-emerald-400/40 text-emerald-400',
              },
              {
                key: 'sqm',
                label: 'SQM',
                activeClass:
                  'bg-violet-400/15 border-violet-400/40 text-violet-400',
              },
              {
                key: 'all',
                label: 'Semua',
                activeClass:
                  'bg-surface-2 border-white/15 text-[var(--text-primary)]',
              },
            ].map(({ key, label, activeClass }) => (
              <button
                key={key}
                onClick={() => handleTypeChange(key as TicketType)}
                className={cn(
                  'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-all',
                  ticketType === key
                    ? activeClass
                    : 'hover:bg-surface-2 border-(--border) text-(--text-secondary)',
                )}
              >
                <span className='h-1.5 w-1.5 rounded-full bg-current' />
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Status (HASIL_VISIT) Pills */}
        <div className='scrollbar-hide flex w-full overflow-x-auto pb-2 lg:w-auto lg:pb-0'>
          <div className='flex gap-2'>
            {[
              {
                key: 'OPEN',
                label: 'Open',
                activeClass:
                  'bg-amber-400/15 border-amber-400/40 text-amber-400',
              },
              {
                key: 'ASSIGNED',
                label: 'Assigned',
                activeClass: 'bg-blue-400/15 border-blue-400/40 text-blue-400',
              },
              {
                key: 'ON_PROGRESS',
                label: 'On Progress',
                activeClass: 'bg-sky-400/15 border-sky-400/40 text-sky-400',
              },
              {
                key: 'PENDING',
                label: 'Pending',
                activeClass:
                  'bg-orange-400/15 border-orange-400/40 text-orange-400',
              },
              // {
              //   key: 'ESCALATED',
              //   label: 'Escalated',
              //   activeClass:
              //     'bg-slate-400/15 border-slate-400/40 text-slate-300',
              // },
              // {
              //   key: 'CANCELLED',
              //   label: 'Cancelled',
              //   activeClass: 'bg-rose-400/15 border-rose-400/40 text-rose-400',
              // },
              {
                key: 'CLOSE',
                label: 'Closed',
                activeClass:
                  'bg-emerald-400/15 border-emerald-400/40 text-emerald-400',
              },
              {
                key: 'all',
                label: 'All Status',
                activeClass:
                  'bg-surface-2 border-white/15 text-[var(--text-primary)]',
              },
            ].map(({ key, label, activeClass }) => (
              <button
                key={key}
                onClick={() => handleStatusChange(key as HasilVisit)}
                className={cn(
                  'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-all',
                  hasilVisit === key
                    ? activeClass
                    : 'hover:bg-surface-2 border-[var(--border)] text-[var(--text-secondary)]',
                )}
              >
                <span className='h-1.5 w-1.5 rounded-full bg-current' />
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
