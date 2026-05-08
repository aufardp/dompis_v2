'use client';
import { useState, useRef, useCallback, useEffect } from 'react';
import { cn } from '@/app/libs/utils';
import { SlidersHorizontal, X } from 'lucide-react';

type TicketType = 'all' | 'customer' | 'sqm' | 'hvc' | 'unspec';
type StatusUpdate =
  | 'all'
  | 'open'
  | 'assigned'
  | 'on_progress'
  | 'pending'
  | 'close';
type FlaggingManja = 'all' | 'P1' | 'P+' | 'FFG' | 'GAMAS';

interface FilterBarB2CProps {
  ticketType?: TicketType;
  statusUpdate?: StatusUpdate;
  flagging?: FlaggingManja;
  onTypeChange?: (type: TicketType) => void;
  onStatusChange?: (status: StatusUpdate) => void;
  onFlaggingChange?: (f: FlaggingManja) => void;
}

const B2C_TYPE_OPTIONS = [
  {
    key: 'customer',
    label: 'Reg',
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
    key: 'hvc',
    label: 'HVC',
    dot: 'bg-amber-400',
    activeClass: 'bg-amber-400/15 border-amber-400/40 text-amber-400',
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
    key: 'FFG',
    label: 'FFG',
    dot: 'bg-rose-400',
    activeClass: 'bg-rose-400/15 border-rose-400/40 text-rose-400',
  },
  {
    key: 'GAMAS',
    label: 'GAMAS',
    dot: 'bg-sky-400',
    activeClass: 'bg-sky-400/15 border-sky-400/40 text-sky-400',
  },
  {
    key: 'all',
    label: 'Semua',
    dot: 'bg-current',
    activeClass: 'bg-surface-2 border-white/15 text-(--text-primary)',
  },
] as const;

export function FilterBarB2C({
  ticketType: ticketTypeProp,
  statusUpdate: statusUpdateProp,
  flagging: flaggingProp,
  onTypeChange,
  onStatusChange,
  onFlaggingChange,
}: FilterBarB2CProps) {
  const ticketType = ticketTypeProp ?? 'all';
  const statusUpdate = statusUpdateProp ?? 'all';
  const flagging = flaggingProp ?? 'all';
  const [showMobileFilters, setShowMobileFilters] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const startX = useRef(0);
  const scrollStart = useRef(0);
  const [showFadeLeft, setShowFadeLeft] = useState(false);
  const [showFadeRight, setShowFadeRight] = useState(true);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setShowFadeLeft(el.scrollLeft > 4);
    setShowFadeRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    isDragging.current = true;
    startX.current = e.pageX - (scrollRef.current?.offsetLeft ?? 0);
    scrollStart.current = scrollRef.current?.scrollLeft ?? 0;
    if (scrollRef.current) scrollRef.current.style.cursor = 'grabbing';
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging.current || !scrollRef.current) return;
    e.preventDefault();
    const x = e.pageX - (scrollRef.current.offsetLeft ?? 0);
    const walk = (x - startX.current) * 1.2;
    scrollRef.current.scrollLeft = scrollStart.current - walk;
  }, []);

  const handleMouseUp = useCallback(() => {
    isDragging.current = false;
    if (scrollRef.current) scrollRef.current.style.cursor = 'grab';
  }, []);

  useEffect(() => {
    handleScroll();
  }, [handleScroll]);

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

      <div className={cn('hidden lg:block', showMobileFilters && 'block')}>
        <div className='relative'>
          <div
            className={cn(
              'pointer-events-none absolute inset-y-0 left-0 z-10 w-12 rounded-l-full',
              'bg-linear-to-r from-(--surface) to-transparent',
              'transition-opacity duration-200',
              showFadeLeft ? 'opacity-100' : 'opacity-0',
            )}
          />

          <div
            className={cn(
              'pointer-events-none absolute inset-y-0 right-0 z-10 w-12 rounded-r-full',
              'bg-linear-to-l from-(--surface) to-transparent',
              'transition-opacity duration-200',
              showFadeRight ? 'opacity-100' : 'opacity-0',
            )}
          />

          <div
            ref={scrollRef}
            onScroll={handleScroll}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            className={cn(
              'flex items-center gap-1 overflow-x-auto rounded-full bg-(--surface)',
              'border border-(--border) p-1',
              'cursor-grab select-none [&::-webkit-scrollbar]:hidden',
              'scrollbar-none',
            )}
            style={{ scrollbarWidth: 'none' }}
          >
            <span className='shrink-0 pr-1 pl-2 text-[9px] font-bold tracking-[1.5px] text-(--text-secondary) uppercase'>
              Jenis
            </span>

            {B2C_TYPE_OPTIONS.map(({ key, label, dot, activeClass }) => (
              <button
                key={key}
                onClick={() => onTypeChange?.(key)}
                className={cn(
                  'flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.75',
                  'text-[11px] font-semibold whitespace-nowrap transition-all duration-150',
                  ticketType === key
                    ? activeClass
                    : 'border-transparent text-(--text-secondary) hover:bg-(--surface-2) hover:text-(--text-primary)',
                )}
              >
                <span
                  className={cn(
                    'h-1.5 w-1.5 shrink-0 rounded-full',
                    ticketType === key ? dot : 'bg-current opacity-30',
                  )}
                />
                {label}
              </button>
            ))}

            <div className='mx-1 h-4 w-px shrink-0 bg-(--border)' />

            <span className='shrink-0 pr-1 pl-1 text-[9px] font-bold tracking-[1.5px] text-(--text-secondary) uppercase'>
              Status
            </span>

            {STATUS_OPTIONS.map(({ key, label, dot, activeClass }) => (
              <button
                key={key}
                onClick={() => onStatusChange?.(key)}
                className={cn(
                  'flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.75',
                  'text-[11px] font-semibold whitespace-nowrap transition-all duration-150',
                  statusUpdate === key
                    ? activeClass
                    : 'border-transparent text-(--text-secondary) hover:bg-(--surface-2) hover:text-(--text-primary)',
                )}
              >
                <span
                  className={cn(
                    'h-1.5 w-1.5 shrink-0 rounded-full',
                    statusUpdate === key ? dot : 'bg-current opacity-30',
                  )}
                />
                {label}
              </button>
            ))}

            <div className='mx-1 h-4 w-px shrink-0 bg-(--border)' />

            <span className='shrink-0 pr-1 pl-1 text-[9px] font-bold tracking-[1.5px] text-(--text-secondary) uppercase'>
              Flag
            </span>

            {FLAGGING_OPTIONS.map(({ key, label, dot, activeClass }) => (
              <button
                key={key}
                onClick={() => onFlaggingChange?.(key as FlaggingManja)}
                className={cn(
                  'flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.75',
                  'text-[11px] font-semibold whitespace-nowrap transition-all duration-150',
                  flagging === key
                    ? activeClass
                    : 'border-transparent text-(--text-secondary) hover:bg-(--surface-2) hover:text-(--text-primary)',
                )}
              >
                <span
                  className={cn(
                    'h-1.5 w-1.5 shrink-0 rounded-full',
                    flagging === key ? dot : 'bg-current opacity-30',
                  )}
                />
                {label}
              </button>
            ))}

            <div className='mx-1 h-4 w-px shrink-0 bg-(--border)' />

            <button
              onClick={resetAll}
              className={cn(
                'mr-1 flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.75',
                'text-[11px] font-semibold whitespace-nowrap transition-all duration-150',
                'border-red-400/30 text-red-400/60 hover:border-red-400/50 hover:bg-red-400/10 hover:text-red-400',
                activeCount === 0 && 'opacity-40',
              )}
            >
              <X size={10} />
              Reset
              {activeCount > 0 && (
                <span className='rounded-full bg-red-400/20 px-1.5 py-px text-[9px] font-bold text-red-300'>
                  {activeCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
