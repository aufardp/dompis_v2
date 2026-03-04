'use client';
import { useState } from 'react';
import { cn } from '@/app/libs/utils';
import { SlidersHorizontal, X } from 'lucide-react';

type Dept = 'all' | 'b2b' | 'b2c';
type TicketType = 'all' | 'reguler' | 'sqm' | 'unspec';
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

// const DEPT_OPTIONS = [
//   {
//     key: 'b2b',
//     label: 'B2B',
//     activeClass: 'bg-blue-500/10 text-blue-400 border-blue-400/30',
//   },
//   {
//     key: 'b2c',
//     label: 'B2C',
//     activeClass: 'bg-violet-500/10 text-violet-400 border-violet-400/30',
//   },
//   {
//     key: 'all',
//     label: 'Semua',
//     activeClass: 'bg-surface-2 text-(--text-primary) border-(--border)',
//   },
// ] as const;

const TYPE_OPTIONS = [
  {
    key: 'reguler',
    label: 'Reguler',
    dot: 'bg-emerald-400',
    activeClass: 'bg-emerald-400/15 border-emerald-400/40 text-emerald-400',
  },
  {
    key: 'sqm',
    label: 'SQM',
    dot: 'bg-violet-400',
    activeClass: 'bg-violet-400/15 border-violet-400/40 text-violet-400',
  },
  {
    key: 'unspec',
    label: 'Unspec',
    dot: 'bg-gray-400',
    activeClass: 'bg-gray-400/15 border-gray-400/40 text-gray-400',
  },
  {
    key: 'all',
    label: 'Semua',
    dot: 'bg-current',
    activeClass: 'bg-surface-2 border-white/15 text-(--text-primary)',
  },
] as const;

const STATUS_OPTIONS = [
  {
    key: 'OPEN',
    label: 'Open',
    dot: 'bg-amber-400',
    activeClass: 'bg-amber-400/15 border-amber-400/40 text-amber-400',
  },
  {
    key: 'ASSIGNED',
    label: 'Assigned',
    dot: 'bg-blue-400',
    activeClass: 'bg-blue-400/15 border-blue-400/40 text-blue-400',
  },
  {
    key: 'ON_PROGRESS',
    label: 'On Progress',
    dot: 'bg-sky-400',
    activeClass: 'bg-sky-400/15 border-sky-400/40 text-sky-400',
  },
  {
    key: 'PENDING',
    label: 'Pending',
    dot: 'bg-orange-400',
    activeClass: 'bg-orange-400/15 border-orange-400/40 text-orange-400',
  },
  {
    key: 'CLOSE',
    label: 'Closed',
    dot: 'bg-emerald-400',
    activeClass: 'bg-emerald-400/15 border-emerald-400/40 text-emerald-400',
  },
  {
    key: 'all',
    label: 'All Status',
    dot: 'bg-current',
    activeClass: 'bg-surface-2 border-white/15 text-(--text-primary)',
  },
] as const;

export function DeptFilterBar({
  onDeptChange,
  onTypeChange,
  onStatusChange,
}: DeptFilterBarProps) {
  const [dept, setDept] = useState<Dept>('all');
  const [ticketType, setTicketType] = useState<TicketType>('all');
  const [hasilVisit, setHasilVisit] = useState<HasilVisit>('all');
  const [showMobileFilters, setShowMobileFilters] = useState(false);

  const activeCount =
    (dept !== 'all' ? 1 : 0) +
    (ticketType !== 'all' ? 1 : 0) +
    (hasilVisit !== 'all' ? 1 : 0);

  function resetAll() {
    setDept('all');
    onDeptChange?.('all');
    setTicketType('all');
    onTypeChange?.('all');
    setHasilVisit('all');
    onStatusChange?.('all');
  }

  return (
    <div className='space-y-2'>
      {/* ── Mobile toggle ── */}
      <div className='flex items-center justify-between lg:hidden'>
        <button
          onClick={() => setShowMobileFilters((v) => !v)}
          className='bg-surface flex items-center gap-2 rounded-xl border border-(--border) px-3 py-2 text-sm font-semibold text-(--text-secondary) transition hover:border-blue-400/40 hover:text-blue-400'
        >
          <SlidersHorizontal size={14} />
          Filters
          {activeCount > 0 && (
            <span className='rounded-full bg-blue-500 px-2 py-0.5 text-[10px] font-bold text-white'>
              {activeCount}
            </span>
          )}
        </button>
        {activeCount > 0 && (
          <button
            onClick={resetAll}
            className='flex items-center gap-1 text-xs font-semibold text-red-400 hover:text-red-500'
          >
            <X size={12} /> Reset
          </button>
        )}
      </div>

      {/* ── Filter bar ── */}
      <div
        className={cn(
          'flex-col gap-0 lg:flex-row lg:items-stretch',
          showMobileFilters ? 'flex' : 'hidden lg:flex',
          'bg-surface overflow-hidden rounded-xl border border-(--border) shadow-sm',
        )}
      >
        {/* Section: Tipe */}
        {/* <div className='flex items-center gap-2 border-b border-(--border) px-4 py-2.5 lg:border-r lg:border-b-0'>
          <span className='w-8 shrink-0 text-[9px] font-bold tracking-[1.2px] text-(--text-secondary) uppercase'>
            Tipe
          </span>
          <div className='flex gap-1'>
            {DEPT_OPTIONS.map(({ key, label, activeClass }) => (
              <button
                key={key}
                onClick={() => {
                  setDept(key);
                  onDeptChange?.(key);
                }}
                className={cn(
                  'rounded-lg border px-3 py-1 text-xs font-semibold whitespace-nowrap transition-all duration-150',
                  dept === key
                    ? activeClass
                    : 'hover:bg-surface-2 border-transparent text-(--text-secondary) hover:text-(--text-primary)',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div> */}

        {/* Section: Jenis */}
        <div className='flex items-center gap-2 border-b border-(--border) px-4 py-2.5 lg:border-r lg:border-b-0'>
          <span className='w-8 shrink-0 text-[9px] font-bold tracking-[1.2px] text-(--text-secondary) uppercase'>
            Jenis
          </span>
          <div className='scrollbar-hide flex gap-1.5 overflow-x-auto'>
            {TYPE_OPTIONS.map(({ key, label, dot, activeClass }) => (
              <button
                key={key}
                onClick={() => {
                  setTicketType(key);
                  onTypeChange?.(key);
                }}
                className={cn(
                  'flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold whitespace-nowrap transition-all duration-150',
                  ticketType === key
                    ? activeClass
                    : 'hover:bg-surface-2 border-(--border) text-(--text-secondary) hover:text-(--text-primary)',
                )}
              >
                <span
                  className={cn(
                    'h-1.5 w-1.5 rounded-full',
                    ticketType === key ? dot : 'bg-current opacity-30',
                  )}
                />
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Section: Status */}
        <div className='flex flex-1 items-center gap-2 px-4 py-2.5'>
          <span className='w-12 shrink-0 text-[9px] font-bold tracking-[1.2px] text-(--text-secondary) uppercase'>
            Status
          </span>
          <div className='scrollbar-hide flex gap-1.5 overflow-x-auto'>
            {STATUS_OPTIONS.map(({ key, label, dot, activeClass }) => (
              <button
                key={key}
                onClick={() => {
                  setHasilVisit(key);
                  onStatusChange?.(key);
                }}
                className={cn(
                  'flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold whitespace-nowrap transition-all duration-150',
                  hasilVisit === key
                    ? activeClass
                    : 'hover:bg-surface-2 border-(--border) text-(--text-secondary) hover:text-(--text-primary)',
                )}
              >
                <span
                  className={cn(
                    'h-1.5 w-1.5 rounded-full',
                    hasilVisit === key ? dot : 'bg-current opacity-30',
                  )}
                />
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Reset button — desktop, only visible when filter active */}
        {activeCount > 0 && (
          <div className='hidden items-center border-l border-(--border) px-3 lg:flex'>
            <button
              onClick={resetAll}
              className='flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-red-400 transition hover:bg-red-400/10'
            >
              <X size={12} />
              Reset
              <span className='rounded-full bg-red-400/20 px-1.5 py-0.5 text-[9px] font-bold'>
                {activeCount}
              </span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
