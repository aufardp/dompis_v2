'use client';

import clsx from 'clsx';

type FlaggingCounts = {
  ffgCount?: number;
  gamasCount?: number;
  p1Count?: number;
  pPlusCount?: number;
};

export function FlaggingSummaryRow({
  counts,
  compact = false,
}: {
  counts: FlaggingCounts;
  compact?: boolean;
}) {
  const items = [
    ['Manja HI', counts.p1Count, 'text-red-600 dark:text-red-300'],
    ['Manja H+', counts.pPlusCount, 'text-amber-600 dark:text-amber-300'],
    ['FFG', counts.ffgCount, 'text-violet-600 dark:text-violet-300'],
    ['GAMAS', counts.gamasCount, 'text-sky-600 dark:text-sky-300'],
  ] as const;

  return (
    <div
      className={clsx(
        'grid gap-2',
        compact ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-2 sm:grid-cols-4',
      )}
    >
      {items.map(([label, value, color]) => (
        <div
          key={label}
          className='rounded-2xl border border-(--border) bg-(--bg) px-2 py-2 text-center shadow-sm'
        >
          <p className='text-[9px] font-bold tracking-[1px] text-(--text-muted) uppercase'>
            {label}
          </p>
          <p className={clsx('mt-0.5 text-sm font-semibold', color)}>
            {Number(value ?? 0).toLocaleString('id-ID')}
          </p>
        </div>
      ))}
    </div>
  );
}

type CustomerTypeCounts = {
  hvcDiamond?: number;
  hvcPlatinum?: number;
  hvcGold?: number;
  reguler?: number;
};

export function CustomerTypeSummaryRow({
  counts,
  compact = false,
}: {
  counts: CustomerTypeCounts;
  compact?: boolean;
}) {
  const items = [
    ['Diamond', counts.hvcDiamond, 'text-sky-600 dark:text-sky-300'],
    ['Platinum', counts.hvcPlatinum, 'text-indigo-600 dark:text-indigo-300'],
    ['Gold', counts.hvcGold, 'text-amber-600 dark:text-amber-300'],
    ['Reguler', counts.reguler, 'text-emerald-600 dark:text-emerald-400'],
  ] as const;

  return (
    <div
      className={clsx(
        'grid gap-2',
        compact ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-2 sm:grid-cols-4',
      )}
    >
      {items.map(([label, value, color]) => (
        <div
          key={label}
          className='rounded-2xl border border-(--border) bg-(--bg) px-2 py-2 text-center shadow-sm'
        >
          <p className='text-[9px] font-bold tracking-[1px] text-(--text-muted) uppercase'>
            {label}
          </p>
          <p className={clsx('mt-0.5 text-sm font-semibold', color)}>
            {Number(value ?? 0).toLocaleString('id-ID')}
          </p>
        </div>
      ))}
    </div>
  );
}

type TicketTypeBreakdown = {
  key: string;
  label: string;
  total?: number;
  open?: number;
  assigned?: number;
  close?: number;
};

export function TicketTypeBreakdownStrip({
  title,
  items,
  activeKeys,
}: {
  title: string;
  items: TicketTypeBreakdown[];
  activeKeys: string[];
}) {
  const visibleItems = items.filter((item) => Number(item.total ?? 0) > 0);

  return (
    <div className='rounded-2xl border border-(--border) bg-(--surface) p-3 shadow-sm'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <p className='text-[11px] font-bold tracking-[1.3px] text-(--text-muted) uppercase'>
          {title}
        </p>
        <span className='text-[11px] font-semibold text-(--text-muted)'>
          {visibleItems.length} jenis
        </span>
      </div>

      {visibleItems.length > 0 ? (
        <div className='mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3'>
          {visibleItems.map((item) => {
            const active = activeKeys.includes(item.key);
            return (
              <div
                key={item.key}
                className={clsx(
                  'rounded-2xl border px-3 py-2 transition-colors',
                  active
                    ? 'border-emerald-300 bg-emerald-500/10'
                    : 'border-(--border) bg-(--bg)',
                )}
              >
                <div className='flex items-start justify-between gap-3'>
                  <p className='min-w-0 truncate text-xs font-semibold text-(--text-primary)'>
                    {item.label}
                  </p>
                  <span className='shrink-0 text-sm font-semibold text-(--text-primary)'>
                    {Number(item.total ?? 0).toLocaleString('id-ID')}
                  </span>
                </div>
                <div className='mt-2 grid grid-cols-3 gap-1 text-center'>
                  {[
                    ['Open', item.open],
                    ['Assigned', item.assigned],
                    ['Close', item.close],
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      className='rounded-xl border border-(--border) bg-(--surface) px-1.5 py-1'
                    >
                      <p className='text-[9px] font-bold tracking-[0.8px] text-(--text-muted) uppercase'>
                        {label}
                      </p>
                      <p className='text-xs font-semibold text-(--text-primary)'>
                        {Number(value ?? 0).toLocaleString('id-ID')}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className='mt-2 text-xs font-semibold text-(--text-muted)'>
          Belum ada jenis_tiket_2 untuk kombinasi filter ini.
        </p>
      )}
    </div>
  );
}
