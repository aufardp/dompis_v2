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
  ticketTypeOptions?: Array<{ key: string; label: string; total?: number }>;
  statusUpdate?: string[];
  ticketStatus?: string[];
  ticketStatusOptions?: string[];
  flagging?: string[];
  onTypeChange?: (types: string[]) => void;
  onStatusChange?: (statuses: string[]) => void;
  onTicketStatusChange?: (statuses: string[]) => void;
  onFlaggingChange?: (flags: string[]) => void;
}

type FilterOption = {
  key: string;
  label: string;
  tone: string;
};

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
    label: 'Manja HI',
    tone: 'bg-red-500/15 text-red-600 dark:text-red-300 ring-1 ring-red-500/40',
  },
  {
    key: 'P+',
    label: 'Manja H+',
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

function statusOption(value: string): FilterOption {
  const key = value.toUpperCase();
  const labels: Record<string, string> = {
    DRAFT: 'Draft',
    ANALYSIS: 'Analysis',
    BACKEND: 'Backend',
    PENDING: 'Pending',
    UNKNOWN: 'Unknown',
    CLOSED: 'Closed',
    FINALCHECK: 'Final Check',
    MEDIACARE: 'Mediacare',
  };
  const label = labels[key] ?? value;
  const tone = key === 'CLOSED' || key === 'FINALCHECK' || key === 'MEDIACARE'
    ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 ring-1 ring-emerald-500/40'
    : 'bg-sky-500/15 text-sky-600 dark:text-sky-300 ring-1 ring-sky-500/40';
  return { key: value, label, tone };
}

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
        'inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-[11px] font-semibold transition-all duration-150',
        active
          ? option.tone
          : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-slate-100',
      )}
    >
      <span
        className={cn(
          'h-1 w-1 rounded-full',
          active ? 'bg-current' : 'bg-slate-400 dark:bg-slate-500',
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
  const ITEM_LIMIT = 2;
  const visibleOptions = isExpanded ? options : options.slice(0, ITEM_LIMIT);
  const hiddenCount = options.length - ITEM_LIMIT;

  return (
    <div className='rounded-2xl border border-(--border) bg-(--surface) p-3 shadow-sm lg:flex lg:min-w-0 lg:items-start lg:gap-2 lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none lg:border-r lg:border-slate-100 lg:pr-4 lg:last:border-0 lg:last:pr-0 dark:lg:border-slate-800/60'>
      <div className='flex shrink-0 items-center gap-1.5 text-(--text-secondary)'>
        {icon}
        <span className='text-[10px] font-bold tracking-[0.18em] text-(--text-secondary) uppercase'>
          {label}
        </span>
        {count > 0 && (
          <span className='rounded-full border border-(--border) bg-(--bg) px-1.5 py-0.5 text-[9px] font-bold text-(--text-primary)'>
            {count}
          </span>
        )}
      </div>

      <div className='mt-2 flex flex-wrap gap-1 lg:mt-0'>
        {visibleOptions.map(renderChip)}

        {options.length > ITEM_LIMIT && (
          <button
            type='button'
            onClick={onToggleExpand}
            className='inline-flex h-7 shrink-0 items-center gap-0.5 rounded-md border border-(--border) bg-(--bg) px-1.5 text-[10px] font-bold text-(--text-secondary) transition-colors hover:bg-(--surface-2) hover:text-(--text-primary)'
          >
            {isExpanded ? (
              <ChevronUp className='h-3 w-3' />
            ) : (
              <>
                <ChevronDown className='h-3 w-3' />+{hiddenCount}
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
  ticketTypeOptions: ticketTypeOptionsProp,
  statusUpdate: statusUpdateProp,
  ticketStatus: ticketStatusProp,
  ticketStatusOptions: ticketStatusOptionsProp,
  flagging: flaggingProp,
  onTypeChange,
  onStatusChange,
  onTicketStatusChange,
  onFlaggingChange,
}: OperationalFilterBarProps) {
  const ticketType = ticketTypeProp ?? [];
  const statusUpdate = statusUpdateProp ?? [];
  const ticketStatus = ticketStatusProp ?? [];
  const ticketStatusValues = ticketStatusOptionsProp ?? [];
  const flagging = flaggingProp ?? [];

  const [openMobile, setOpenMobile] = useState(false);
  const [expandType, setExpandType] = useState(false);
  const [expandStatus, setExpandStatus] = useState(false);
  const [expandTicketStatus, setExpandTicketStatus] = useState(false);
  const [expandFlag, setExpandFlag] = useState(false);

  const style = SEGMENT_STYLE[segment];
  const inseraOptions: FilterOption[] = ticketStatusValues.map(statusOption);
  const configuredTypeOptions: FilterOption[] = JENIS_TIKET_LIST.filter(
    (jenis) => jenis.segment === segment,
  ).map((jenis) => ({
    key: jenis.key,
    label: jenis.label,
    tone: cn(jenis.color, 'ring-1 ring-blue-500/30 dark:ring-blue-400/40'),
  }));
  const typeOptions: FilterOption[] =
    ticketTypeOptionsProp && ticketTypeOptionsProp.length > 0
      ? ticketTypeOptionsProp.map((jenis) => ({
          key: jenis.key,
          label:
            typeof jenis.total === 'number'
              ? `${jenis.label} (${jenis.total.toLocaleString('id-ID')})`
              : jenis.label,
          tone: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 ring-1 ring-emerald-500/40',
        }))
      : configuredTypeOptions;
  const ticketStatusOptions: FilterOption[] = ticketStatusValues.map(
    (status) => ({
      key: status,
      label: status,
      tone: 'bg-violet-500/15 text-violet-600 dark:text-violet-300 ring-1 ring-violet-500/40',
    }),
  );

  const activeCount =
    ticketType.length +
    statusUpdate.length +
    ticketStatus.length +
    flagging.length;

  function resetAll() {
    onTypeChange?.([]);
    onStatusChange?.([]);
    onTicketStatusChange?.([]);
    onFlaggingChange?.([]);
  }

  const content = (
    <div className='flex flex-col gap-2.5 xl:flex-row xl:flex-wrap xl:items-start'>
      <FilterGroup
        icon={<Tag className='h-3 w-3' />}
        label='Jenis'
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

      <FilterGroup
        icon={<CheckCircle2 className='h-3 w-3' />}
        label='Dompis'
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

      <FilterGroup
        icon={<ListFilter className='h-3 w-3' />}
        label='Insera'
        count={ticketStatus.length}
        options={inseraOptions}
        activeItems={ticketStatus}
        isExpanded={expandTicketStatus}
        onToggleExpand={() => setExpandTicketStatus(!expandTicketStatus)}
        renderChip={(option) => (
          <FilterChip
            key={option.key}
            option={option}
            active={ticketStatus.includes(option.key)}
            onClick={() =>
              onTicketStatusChange?.(toggleItem(ticketStatus, option.key))
            }
          />
        )}
      />

      <FilterGroup
        icon={<BadgeAlert className='h-3 w-3' />}
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
    <div className='w-full rounded-[1.25rem] border border-(--border) bg-(--surface) p-3.5 shadow-sm'>
      <div className='flex flex-col gap-3 sm:flex-row sm:items-start'>
        <div
          className={cn(
            'grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-(--border) bg-(--bg) text-(--text-primary)',
            style.soft,
          )}
        >
          <ListFilter className='h-4 w-4' />
        </div>

        <div className='min-w-0 flex-1'>
          <div className='flex flex-wrap items-center gap-2'>
            <p
              className={cn(
                'text-[11px] font-bold tracking-[0.22em] uppercase',
                style.accent,
              )}
            >
              {style.title}
            </p>
            <span className='rounded-full border border-(--border) bg-(--bg) px-2.5 py-0.5 text-[10px] font-semibold text-(--text-muted)'>
              {activeCount > 0 ? `${activeCount} aktif` : 'Semua data'}
            </span>
          </div>
          <p className='mt-1 text-xs leading-5 text-(--text-secondary)'>
            Filter utama di bawah ini memotong data tabel secara langsung.
          </p>
        </div>

        <div className='flex shrink-0 items-center gap-2 self-start sm:ml-auto'>
          {activeCount > 0 && (
            <button
              type='button'
              onClick={resetAll}
              className='inline-flex h-8 items-center gap-1 rounded-xl border border-(--border) bg-(--bg) px-2.5 text-[10px] font-semibold text-(--text-secondary) transition-colors hover:bg-(--surface-2) hover:text-(--text-primary)'
            >
              <RotateCcw className='h-3 w-3' />
              Clear
            </button>
          )}
          <button
            type='button'
            onClick={() => setOpenMobile((value) => !value)}
            className='inline-flex h-8 items-center gap-1 rounded-xl border border-(--border) bg-(--bg) px-2.5 text-[10px] font-semibold text-(--text-secondary) transition-colors hover:bg-(--surface-2) lg:hidden'
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

      <div className='mt-3 hidden lg:block'>{content}</div>
      {openMobile && (
        <div className='mt-3 border-t border-(--border) pt-3 lg:hidden'>
          {content}
        </div>
      )}
    </div>
  );
}
