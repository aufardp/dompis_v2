'use client';

import { useState } from 'react';
import {
  BadgeAlert,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ListFilter,
  RotateCcw,
  SlidersHorizontal,
  Tag,
  X,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/app/libs/utils';
import { JENIS_TIKET_LIST } from '@/app/config/jenis-tiket';

type Segment = 'b2b' | 'b2c';

interface OperationalFilterBarProps {
  segment: Segment;
  ticketType?: string[];
  statusUpdate?: string[];
  flagging?: string[];
  onTypeChange?: (types: string[]) => void;
  onStatusChange?: (statuses: string[]) => void;
  onFlaggingChange?: (flags: string[]) => void;
}

type FilterOption = {
  key: string;
  label: string;
  tone: string;
};

// Warna aktif dibuat lebih cerah dan stand-out di dark mode yang baru
const STATUS_OPTIONS: FilterOption[] = [
  {
    key: 'open',
    label: 'Open',
    tone: 'bg-amber-500/15 text-amber-600 dark:text-amber-300 ring-1 ring-amber-500/40',
  },
  {
    key: 'assigned',
    label: 'Assigned',
    tone: 'bg-blue-500/15 text-blue-600 dark:text-blue-300 ring-1 ring-blue-500/40',
  },
  {
    key: 'on_progress',
    label: 'On Progress',
    tone: 'bg-sky-500/15 text-sky-600 dark:text-sky-300 ring-1 ring-sky-500/40',
  },
  {
    key: 'pending',
    label: 'Pending',
    tone: 'bg-orange-500/15 text-orange-600 dark:text-orange-300 ring-1 ring-orange-500/40',
  },
  {
    key: 'close',
    label: 'Close',
    tone: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 ring-1 ring-emerald-500/40',
  },
];

const FLAG_OPTIONS: FilterOption[] = [
  {
    key: 'P1',
    label: 'P1',
    tone: 'bg-red-500/15 text-red-600 dark:text-red-300 ring-1 ring-red-500/40',
  },
  {
    key: 'P+',
    label: 'P+',
    tone: 'bg-fuchsia-500/15 text-fuchsia-600 dark:text-fuchsia-300 ring-1 ring-fuchsia-500/40',
  },
  {
    key: 'FFG',
    label: 'FFG',
    tone: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 ring-1 ring-emerald-500/40',
  },
  {
    key: 'GAMAS',
    label: 'Gamas',
    tone: 'bg-amber-500/15 text-amber-600 dark:text-amber-300 ring-1 ring-amber-500/40',
  },
];

const SEGMENT_STYLE: Record<
  Segment,
  { title: string; accent: string; soft: string }
> = {
  b2b: {
    title: 'Filter B2B',
    accent: 'text-slate-900 dark:text-slate-100',
    soft: 'bg-blue-500/15 text-blue-600 dark:bg-blue-500/20 dark:text-blue-300',
  },
  b2c: {
    title: 'Filter B2C',
    accent: 'text-slate-900 dark:text-slate-100',
    soft: 'bg-emerald-500/15 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-300',
  },
};

function toggleItem(arr: string[], item: string): string[] {
  if (arr.includes(item)) return arr.filter((i) => i !== item);
  return [...arr, item];
}

function FilterChip({
  option,
  active,
  onClick,
}: {
  option: FilterOption;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type='button'
      onClick={onClick}
      className={cn(
        'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition-all duration-150',
        active
          ? option.tone
          : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-slate-100',
      )}
    >
      <span
        className={cn(
          'h-1.5 w-1.5 rounded-full transition-transform',
          active ? 'scale-110 bg-current' : 'bg-slate-400 dark:bg-slate-500',
        )}
      />
      {option.label}
    </button>
  );
}

function FilterGroup({
  icon,
  label,
  count,
  options,
  activeItems,
  isExpanded,
  onToggleExpand,
  renderChip,
}: {
  icon: ReactNode;
  label: string;
  count: number;
  options: FilterOption[];
  activeItems: string[];
  isExpanded: boolean;
  onToggleExpand: () => void;
  renderChip: (option: FilterOption) => ReactNode;
}) {
  const ITEM_LIMIT = 3;
  const visibleOptions = isExpanded ? options : options.slice(0, ITEM_LIMIT);
  const hiddenCount = options.length - ITEM_LIMIT;

  return (
    <div className='flex flex-col gap-2.5 lg:col-span-4'>
      {/* Label Group */}
      <div className='flex items-center gap-2 px-1'>
        <span className='text-slate-400 dark:text-slate-400'>{icon}</span>
        <span className='text-[11px] font-bold tracking-wider text-slate-400 uppercase dark:text-slate-400'>
          {label}
        </span>
        {count > 0 && (
          <span className='ml-1 rounded-full bg-slate-900 px-1.5 py-0.5 text-[10px] font-bold text-white dark:bg-slate-100 dark:text-slate-950'>
            {count}
          </span>
        )}
      </div>

      {/* Container List Filter (Lebih Terang di Dark Mode) */}
      <div className='flex flex-wrap content-start gap-1.5 rounded-xl border border-slate-100 bg-slate-50/40 p-3 shadow-xs dark:border-slate-800 dark:bg-slate-900/60'>
        {visibleOptions.map(renderChip)}

        {options.length > ITEM_LIMIT && (
          <button
            type='button'
            onClick={onToggleExpand}
            className='inline-flex h-8 items-center gap-1 rounded-lg bg-slate-200/50 px-2.5 text-xs font-bold text-slate-500 transition-colors hover:text-slate-800 dark:bg-slate-800/80 dark:text-slate-400 dark:hover:text-slate-200'
          >
            {isExpanded ? (
              <>
                <ChevronUp className='h-3.5 w-3.5' />
                Less
              </>
            ) : (
              <>
                <ChevronDown className='h-3.5 w-3.5' />+{hiddenCount} More
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}

export default function OperationalFilterBar({
  segment,
  ticketType: ticketTypeProp,
  statusUpdate: statusUpdateProp,
  flagging: flaggingProp,
  onTypeChange,
  onStatusChange,
  onFlaggingChange,
}: OperationalFilterBarProps) {
  const ticketType = ticketTypeProp ?? [];
  const statusUpdate = statusUpdateProp ?? [];
  const flagging = flaggingProp ?? [];

  const [openMobile, setOpenMobile] = useState(false);

  // State expand mandiri untuk masing-masing grup filter
  const [expandType, setExpandType] = useState(false);
  const [expandStatus, setExpandStatus] = useState(false);
  const [expandFlag, setExpandFlag] = useState(false);

  const style = SEGMENT_STYLE[segment];
  const typeOptions: FilterOption[] = JENIS_TIKET_LIST.filter(
    (jenis) => jenis.segment === segment,
  ).map((jenis) => ({
    key: jenis.key,
    label: jenis.label,
    tone: cn(jenis.color, 'ring-1 ring-blue-500/30 dark:ring-blue-400/40'),
  }));

  const activeCount = ticketType.length + statusUpdate.length + flagging.length;

  function resetAll() {
    onTypeChange?.([]);
    onStatusChange?.([]);
    onFlaggingChange?.([]);
  }

  const content = (
    <div className='flex flex-col gap-5 lg:grid lg:grid-cols-12 lg:items-start'>
      {/* 1. Jenis Tiket (Sekarang sejajar col-span-4 jika collapse) */}
      <FilterGroup
        icon={<Tag className='h-3.5 w-3.5' />}
        label='Jenis Tiket'
        count={ticketType.length}
        options={typeOptions}
        activeItems={ticketType}
        isExpanded={expandType}
        onToggleExpand={() => setExpandType(!expandType)}
        renderChip={(option) => (
          <FilterChip
            key={option.key}
            option={option}
            active={ticketType.includes(option.key)}
            onClick={() => onTypeChange?.(toggleItem(ticketType, option.key))}
          />
        )}
      />

      {/* 2. Status Dompis */}
      <FilterGroup
        icon={<CheckCircle2 className='h-3.5 w-3.5' />}
        label='Status'
        count={statusUpdate.length}
        options={STATUS_OPTIONS}
        activeItems={statusUpdate}
        isExpanded={expandStatus}
        onToggleExpand={() => setExpandStatus(!expandStatus)}
        renderChip={(option) => (
          <FilterChip
            key={option.key}
            option={option}
            active={statusUpdate.includes(option.key)}
            onClick={() =>
              onStatusChange?.(toggleItem(statusUpdate, option.key))
            }
          />
        )}
      />

      {/* 3. Flag */}
      <FilterGroup
        icon={<BadgeAlert className='h-3.5 w-3.5' />}
        label='Flag'
        count={flagging.length}
        options={FLAG_OPTIONS}
        activeItems={flagging}
        isExpanded={expandFlag}
        onToggleExpand={() => setExpandFlag(!expandFlag)}
        renderChip={(option) => (
          <FilterChip
            key={option.key}
            option={option}
            active={flagging.includes(option.key)}
            onClick={() => onFlaggingChange?.(toggleItem(flagging, option.key))}
          />
        )}
      />
    </div>
  );

  return (
    <div className='rounded-2xl border border-slate-100 bg-white p-4 shadow-xs dark:border-slate-800/80 dark:bg-slate-950'>
      {/* Header Minimalis */}
      <div className='flex items-center justify-between gap-3 border-b border-slate-50 pb-3 dark:border-slate-900/60'>
        <div className='flex min-w-0 items-center gap-3'>
          <div
            className={cn(
              'grid h-8 w-8 place-items-center rounded-lg',
              style.soft,
            )}
          >
            <ListFilter className='h-3.5 w-3.5' />
          </div>
          <div className='min-w-0'>
            <p className={cn('text-xs font-bold tracking-wide', style.accent)}>
              {style.title}
            </p>
            <p className='truncate text-[11px] font-medium text-slate-400 dark:text-slate-400'>
              {activeCount > 0
                ? `${activeCount} filter terpilih`
                : 'Menampilkan semua data'}
            </p>
          </div>
        </div>

        <div className='flex items-center gap-2'>
          {activeCount > 0 && (
            <button
              type='button'
              onClick={resetAll}
              className='hidden h-7 items-center gap-1 rounded-md px-2 text-xs font-medium text-red-500 transition-colors hover:bg-red-500/10 sm:inline-flex dark:text-red-400'
            >
              <RotateCcw className='h-3 w-3' />
              Clear
            </button>
          )}
          <button
            type='button'
            onClick={() => setOpenMobile((value) => !value)}
            className='inline-flex h-7 items-center gap-1.5 rounded-md border border-slate-200 px-2 text-xs font-medium text-slate-600 lg:hidden dark:border-slate-800 dark:text-slate-400'
          >
            {openMobile ? (
              <X className='h-3 w-3' />
            ) : (
              <SlidersHorizontal className='h-3 w-3' />
            )}
            Filter
          </button>
        </div>
      </div>

      {/* Konten Utama */}
      <div className='mt-4 hidden lg:block'>{content}</div>
      {openMobile && <div className='mt-4 lg:hidden'>{content}</div>}
    </div>
  );
}
