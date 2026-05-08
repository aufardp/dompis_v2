'use client';
import { useState, useRef, useCallback, useEffect } from 'react';
import { cn } from '@/app/libs/utils';
import { SlidersHorizontal, X } from 'lucide-react';

type TicketType = 'reguler' | 'sqm' | 'hvc' | 'unspec';
type StatusUpdate = 'open' | 'assigned' | 'on_progress' | 'pending' | 'close';
type FlaggingManja = 'P1' | 'P+' | 'FFG' | 'GAMAS';

interface FilterBarB2CProps {
  ticketType?: string[];
  statusUpdate?: string[];
  flagging?: string[];
  onTypeChange?: (types: string[]) => void;
  onStatusChange?: (statuses: string[]) => void;
  onFlaggingChange?: (flags: string[]) => void;
}

const B2C_TYPE_OPTIONS = [
  {
    key: 'reguler',
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
] as const;

function toggleItem(arr: string[], item: string): string[] {
  if (arr.includes(item)) {
    return arr.filter((i) => i !== item);
  }
  return [...arr, item];
}

export function FilterBarB2C({
  ticketType: ticketTypeProp,
  statusUpdate: statusUpdateProp,
  flagging: flaggingProp,
  onTypeChange,
  onStatusChange,
  onFlaggingChange,
}: FilterBarB2CProps) {
  const ticketType = ticketTypeProp ?? [];
  const statusUpdate = statusUpdateProp ?? [];
  const flagging = flaggingProp ?? [];
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

  const activeCount = ticketType.length + statusUpdate.length + flagging.length;

  function resetAll() {
    onTypeChange?.([]);
    onStatusChange?.([]);
    onFlaggingChange?.([]);
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
              'bg-gradient-to-r from-(--surface) to-transparent',
              'transition-opacity duration-200',
              showFadeLeft ? 'opacity-100' : 'opacity-0',
            )}
          />

          <div
            className={cn(
              'pointer-events-none absolute inset-y-0 right-0 z-10 w-12 rounded-r-full',
              'bg-gradient-to-l from-(--surface) to-transparent',
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
              {ticketType.length > 0 && (
                <span className='ml-1 rounded-full bg-blue-500 px-1.5 py-px text-[9px] font-bold text-white'>
                  {ticketType.length}
                </span>
              )}
            </span>

            {B2C_TYPE_OPTIONS.map(({ key, label, dot, activeClass }) => {
              const isActive = ticketType.includes(key);
              return (
                <button
                  key={key}
                  onClick={() => onTypeChange?.(toggleItem(ticketType, key))}
                  className={cn(
                    'flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.75',
                    'text-[11px] font-semibold whitespace-nowrap transition-all duration-150',
                    isActive
                      ? activeClass
                      : 'border-transparent text-(--text-secondary) hover:bg-(--surface-2) hover:text-(--text-primary)',
                  )}
                >
                  <span
                    className={cn(
                      'h-1.5 w-1.5 shrink-0 rounded-full',
                      isActive ? dot : 'bg-current opacity-30',
                    )}
                  />
                  {label}
                </button>
              );
            })}

            <div className='mx-1 h-4 w-px shrink-0 bg-(--border)' />

            <span className='shrink-0 pr-1 pl-1 text-[9px] font-bold tracking-[1.5px] text-(--text-secondary) uppercase'>
              Status
              {statusUpdate.length > 0 && (
                <span className='ml-1 rounded-full bg-blue-500 px-1.5 py-px text-[9px] font-bold text-white'>
                  {statusUpdate.length}
                </span>
              )}
            </span>

            {STATUS_OPTIONS.map(({ key, label, dot, activeClass }) => {
              const isActive = statusUpdate.includes(key);
              return (
                <button
                  key={key}
                  onClick={() => onStatusChange?.(toggleItem(statusUpdate, key))}
                  className={cn(
                    'flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.75',
                    'text-[11px] font-semibold whitespace-nowrap transition-all duration-150',
                    isActive
                      ? activeClass
                      : 'border-transparent text-(--text-secondary) hover:bg-(--surface-2) hover:text-(--text-primary)',
                  )}
                >
                  <span
                    className={cn(
                      'h-1.5 w-1.5 shrink-0 rounded-full',
                      isActive ? dot : 'bg-current opacity-30',
                    )}
                  />
                  {label}
                </button>
              );
            })}

            <div className='mx-1 h-4 w-px shrink-0 bg-(--border)' />

            <span className='shrink-0 pr-1 pl-1 text-[9px] font-bold tracking-[1.5px] text-(--text-secondary) uppercase'>
              Flag
              {flagging.length > 0 && (
                <span className='ml-1 rounded-full bg-blue-500 px-1.5 py-px text-[9px] font-bold text-white'>
                  {flagging.length}
                </span>
              )}
            </span>

            {FLAGGING_OPTIONS.map(({ key, label, dot, activeClass }) => {
              const isActive = flagging.includes(key);
              return (
                <button
                  key={key}
                  onClick={() => onFlaggingChange?.(toggleItem(flagging, key))}
                  className={cn(
                    'flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.75',
                    'text-[11px] font-semibold whitespace-nowrap transition-all duration-150',
                    isActive
                      ? activeClass
                      : 'border-transparent text-(--text-secondary) hover:bg-(--surface-2) hover:text-(--text-primary)',
                  )}
                >
                  <span
                    className={cn(
                      'h-1.5 w-1.5 shrink-0 rounded-full',
                      isActive ? dot : 'bg-current opacity-30',
                    )}
                  />
                  {label}
                </button>
              );
            })}

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