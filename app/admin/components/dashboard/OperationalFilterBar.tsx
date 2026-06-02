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
    // Menggunakan shrink-0 agar label & kelompok filter tidak ringsek saat layar menyempit
    <div className='flex shrink-0 items-center gap-2 border-r border-slate-100 pr-4 last:border-0 last:pr-0 dark:border-slate-800/60'>
      {/* Label Kategori */}
      <div className='flex shrink-0 items-center gap-1.5 text-slate-400'>
        {icon}
        <span className='hidden text-[10px] font-bold tracking-wider text-slate-400 uppercase xl:inline-block'>
          {label}
        </span>
        {count > 0 && (
          <span className='rounded bg-slate-900 px-1 py-0.5 text-[9px] font-bold text-white dark:bg-slate-100 dark:text-slate-950'>
            {count}
          </span>
        )}
      </div>

      {/* Jarak antar chip filter diset gap-1 (rapi dan padat) */}
      <div className='flex items-center gap-1'>
        {visibleOptions.map(renderChip)}

        {options.length > ITEM_LIMIT && (
          <button
            type='button'
            onClick={onToggleExpand}
            className='inline-flex h-7 shrink-0 items-center gap-0.5 rounded-md bg-slate-100 px-1.5 text-[10px] font-bold text-slate-500 hover:text-slate-800 dark:bg-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
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
    // gap-x-5 memberikan jarak horizontal antar grup filter yang seimbang dan tidak terlalu dempet
    <div className='flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-x-5'>
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
    // p-2 (padding tipis) dan items-center membuat baris filter ini benar-benar datar, proporsional, dan presisi
    <div className='w-full rounded-xl border border-slate-100 bg-white p-2 shadow-xs lg:flex lg:items-center lg:justify-between dark:border-slate-800/80 dark:bg-slate-950'>
      {/* Kiri: Logo, Judul, dan Konten Utama Filter */}
      {/* overflow-x-auto menjamin jika layar user kecil (seperti laptop 13 inch), filternya bisa di-scroll smooth tanpa merusak grid luar */}
      <div className='no-scrollbar flex min-w-0 flex-1 items-center gap-3 overflow-x-auto py-0.5'>
        <div
          className={cn(
            'ml-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-md',
            style.soft,
          )}
        >
          <ListFilter className='h-3 w-3' />
        </div>

        {/* Nama Judul Filter */}
        <div className='hidden shrink-0 border-r border-slate-100 pr-3 md:block dark:border-slate-800/60'>
          <p
            className={cn(
              'text-[11px] leading-none font-bold tracking-wide',
              style.accent,
            )}
          >
            {style.title}
          </p>
          <span className='text-[10px] font-medium text-slate-400'>
            {activeCount > 0 ? `${activeCount} dipilih` : 'Semua'}
          </span>
        </div>

        {/* Baris Filter Utama */}
        <div className='hidden lg:block'>{content}</div>
      </div>

      {/* Kanan: Aksi Ekstra & Tombol Reset (Clear) */}
      <div className='mt-2 flex shrink-0 items-center justify-between gap-3 border-t border-slate-50 pt-2 pr-1 pl-1 lg:mt-0 lg:justify-end lg:border-t-0 lg:pt-0 dark:border-slate-900/60'>
        <div className='text-[11px] font-medium text-slate-400 lg:hidden'>
          {activeCount > 0 ? `${activeCount} filter aktif` : 'Semua data'}
        </div>

        <div className='ml-auto flex items-center gap-2'>
          {activeCount > 0 && (
            <button
              type='button'
              onClick={resetAll}
              className='inline-flex h-6 items-center gap-1 rounded px-2 text-[10px] font-semibold text-red-500 transition-colors hover:bg-red-500/10 dark:text-red-400'
            >
              <RotateCcw className='h-2.5 w-2.5' />
              Clear Filter
            </button>
          )}
          <button
            type='button'
            onClick={() => setOpenMobile((value) => !value)}
            className='inline-flex h-6 items-center gap-1 rounded border border-slate-200 px-2 text-[10px] font-medium text-slate-600 lg:hidden dark:border-slate-800 dark:text-slate-400'
          >
            {openMobile ? (
              <X className='h-2.5 w-2.5' />
            ) : (
              <SlidersHorizontal className='h-2.5 w-2.5' />
            )}
            Filter
          </button>
        </div>
      </div>

      {/* Tampilan Mobile Content */}
      {openMobile && (
        <div className='mt-2 border-t border-slate-100 pt-2.5 lg:hidden dark:border-slate-800'>
          {content}
        </div>
      )}
    </div>
  );
}
