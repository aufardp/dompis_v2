'use client';

import { Eye, RefreshCw, UserPlus } from 'lucide-react';
import clsx from 'clsx';

interface TicketActionButtonsProps {
  hasAssignee: boolean;     // true = sudah ada teknisi → tampilkan RefreshCw (amber)
  isClosed: boolean;        // true = hanya tampilkan tombol Detail
  onDetail: () => void;
  onAssign: () => void;
  size?: 'sm' | 'xs';      // sm = padding px-3 py-1.5, xs = px-2 py-1
  detailTitle?: string;
  assignTitle?: string;
}

export default function TicketActionButtons({
  hasAssignee,
  isClosed,
  onDetail,
  onAssign,
  size = 'sm',
  detailTitle = 'Lihat Detail',
  assignTitle,
}: TicketActionButtonsProps) {
  const defaultAssignTitle = hasAssignee ? 'Reassign Teknisi' : 'Assign Teknisi';
  const px = size === 'xs' ? 'px-2 py-1' : 'px-3 py-1.5';
  const iconSize = size === 'xs' ? 11 : 13;

  if (isClosed) {
    return (
      <button
        type='button'
        onClick={onDetail}
        title={detailTitle}
        className={clsx(
          'bg-surface inline-flex items-center gap-1.5 rounded-xl border border-(--border)',
          px,
          'text-xs font-semibold text-(--text-secondary) transition',
          'hover:border-blue-300 hover:bg-blue-50 hover:text-blue-600',
          'dark:hover:border-blue-400/40 dark:hover:bg-blue-500/15 dark:hover:text-blue-400',
        )}
      >
        <Eye size={iconSize} />
      </button>
    );
  }

  return (
    <div className='inline-flex overflow-hidden rounded-xl border border-(--border) shadow-sm'>
      <button
        type='button'
        onClick={onDetail}
        title={detailTitle}
        className={clsx(
          'bg-surface flex items-center gap-1.5 border-r border-(--border)',
          px,
          'text-xs font-semibold text-(--text-secondary) transition',
          'hover:bg-blue-50 hover:text-blue-600',
          'dark:hover:bg-blue-500/15 dark:hover:text-blue-400',
        )}
      >
        <Eye size={iconSize} />
      </button>

      <button
        type='button'
        onClick={onAssign}
        title={assignTitle ?? defaultAssignTitle}
        className={clsx(
          'flex items-center gap-1.5 text-xs font-bold text-white transition',
          px,
          hasAssignee
            ? 'bg-amber-500 hover:bg-amber-600'
            : 'bg-blue-600 hover:bg-blue-700',
        )}
      >
        {hasAssignee ? <RefreshCw size={iconSize} /> : <UserPlus size={iconSize} />}
      </button>
    </div>
  );
}
