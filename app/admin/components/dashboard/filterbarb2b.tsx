'use client';
import { useState } from 'react';
import { cn } from '@/app/libs/utils';
import { SlidersHorizontal, X } from 'lucide-react';

type TicketType =
  | 'all'
  | 'sqm-ccan'
  | 'indibiz'
  | 'datin'
  | 'reseller'
  | 'wifi-id';
type StatusUpdate =
  | 'all'
  | 'open'
  | 'assigned'
  | 'on_progress'
  | 'pending'
  | 'close';
type FlaggingManja = 'all' | 'P1' | 'P+';

interface FilterBarB2BProps {
  ticketType?: TicketType;
  statusUpdate?: StatusUpdate;
  flagging?: FlaggingManja;
  onTypeChange?: (type: TicketType) => void;
  onStatusChange?: (status: StatusUpdate) => void;
  onFlaggingChange?: (f: FlaggingManja) => void;
}

const B2B_TYPE_OPTIONS = [
  {
    key: 'sqm-ccan',
    label: 'SQM-CCAN',
    dot: 'bg-fuchsia-400',
    activeClass: 'bg-fuchsia-400/15 border-fuchsia-400/40 text-fuchsia-400',
  },
  {
    key: 'indibiz',
    label: 'Indibiz',
    dot: 'bg-blue-400',
    activeClass: 'bg-blue-400/15 border-blue-400/40 text-blue-400',
  },
  {
    key: 'datin',
    label: 'Datin',
    dot: 'bg-cyan-400',
    activeClass: 'bg-cyan-400/15 border-cyan-400/40 text-cyan-400',
  },
  {
    key: 'reseller',
    label: 'Reseller',
    dot: 'bg-purple-400',
    activeClass: 'bg-purple-400/15 border-purple-400/40 text-purple-400',
  },
  {
    key: 'wifi-id',
    label: 'WiFi-ID',
    dot: 'bg-teal-400',
    activeClass: 'bg-teal-400/15 border-teal-400/40 text-teal-400',
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
    key: 'open',
    label: 'Open',
    dot: 'bg-amber-400',
    activeClass: 'bg-amber-400/15 border-amber-400/40 text-amber-400',
  },
  {
    key: 'assigned',
    label: 'Assigned',
    dot: 'bg-blue-400',
    activeClass: 'bg-blue-400/15 border-blue-400/40 text-blue-400',
  },
  {
    key: 'on_progress',
    label: 'On Progress',
    dot: 'bg-sky-400',
    activeClass: 'bg-sky-400/15 border-sky-400/40 text-sky-400',
  },
  {
    key: 'pending',
    label: 'Pending',
    dot: 'bg-orange-400',
    activeClass: 'bg-orange-400/15 border-orange-400/40 text-orange-400',
  },
  {
    key: 'close',
    label: 'Close',
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

const FLAGGING_OPTIONS = [
  {
    key: 'P1',
    label: 'P1',
    dot: 'bg-red-400',
    activeClass: 'bg-red-400/15 border-red-400/40 text-red-400',
  },
  {
    key: 'P+',
    label: 'P+',
    dot: 'bg-pink-400',
    activeClass: 'bg-pink-400/15 border-pink-400/40 text-pink-400',
  },
  {
    key: 'all',
    label: 'Semua',
    dot: 'bg-current',
    activeClass: 'bg-surface-2 border-white/15 text-(--text-primary)',
  },
] as const;

export function FilterBarB2B({
  ticketType: ticketTypeProp,
  statusUpdate: statusUpdateProp,
  flagging: flaggingProp,
  onTypeChange,
  onStatusChange,
  onFlaggingChange,
}: FilterBarB2BProps) {
  const ticketType = ticketTypeProp ?? 'all';
  const statusUpdate = statusUpdateProp ?? 'all';
  const flagging = flaggingProp ?? 'all';
  const [showMobileFilters, setShowMobileFilters] = useState(false);

  const activeCount =
    (ticketType !== 'all' ? 1 : 0) +
    (statusUpdate !== 'all' ? 1 : 0) +
    (flagging !== 'all' ? 1 : 0);

  function resetAll() {
    onTypeChange?.('all');
    onStatusChange?.('all');
    onFlaggingChange?.('all');
  }

  return (
    <div className='space-y-2'>
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

      <div
        className={cn(
          'flex-col gap-0 lg:flex-row lg:items-stretch',
          showMobileFilters ? 'flex' : 'hidden lg:flex',
          'bg-surface overflow-hidden rounded-xl border border-(--border) shadow-sm',
        )}
      >
        <div className='flex items-center gap-2 border-b border-(--border) px-4 py-2.5 lg:border-r lg:border-b-0'>
          <span className='w-8 shrink-0 text-[9px] font-bold tracking-[1.2px] text-(--text-secondary) uppercase'>
            Jenis
          </span>
          <div className='scrollbar-hide flex gap-1.5 overflow-x-auto'>
            {B2B_TYPE_OPTIONS.map(({ key, label, dot, activeClass }) => (
              <button
                key={key}
                onClick={() => {
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

        <div className='flex flex-1 items-center gap-2 px-4 py-2.5'>
          <span className='w-12 shrink-0 text-[9px] font-bold tracking-[1.2px] text-(--text-secondary) uppercase'>
            Status
          </span>
          <div className='scrollbar-hide flex gap-1.5 overflow-x-auto'>
            {STATUS_OPTIONS.map(({ key, label, dot, activeClass }) => (
              <button
                key={key}
                onClick={() => {
                  onStatusChange?.(key);
                }}
                className={cn(
                  'flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold whitespace-nowrap transition-all duration-150',
                  statusUpdate === key
                    ? activeClass
                    : 'hover:bg-surface-2 border-(--border) text-(--text-secondary) hover:text-(--text-primary)',
                )}
              >
                <span
                  className={cn(
                    'h-1.5 w-1.5 rounded-full',
                    statusUpdate === key ? dot : 'bg-current opacity-30',
                  )}
                />
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className='flex items-center gap-2 border-t border-(--border) px-4 py-2.5 lg:border-t-0 lg:border-l'>
          <span className='w-14 shrink-0 text-[9px] font-bold tracking-[1.2px] text-(--text-secondary) uppercase'>
            Flagging
          </span>
          <div className='scrollbar-hide flex gap-1.5 overflow-x-auto'>
            {FLAGGING_OPTIONS.map(({ key, label, dot, activeClass }) => (
              <button
                key={key}
                onClick={() => {
                  onFlaggingChange?.(key as FlaggingManja);
                }}
                className={cn(
                  'flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold whitespace-nowrap transition-all duration-150',
                  flagging === key
                    ? activeClass
                    : 'hover:bg-surface-2 border-(--border) text-(--text-secondary) hover:text-(--text-primary)',
                )}
              >
                <span
                  className={cn(
                    'h-1.5 w-1.5 rounded-full',
                    flagging === key ? dot : 'bg-current opacity-30',
                  )}
                />
                {label}
              </button>
            ))}
          </div>
        </div>

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
