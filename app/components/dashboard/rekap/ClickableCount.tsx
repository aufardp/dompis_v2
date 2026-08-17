'use client';

import type { CSSProperties } from 'react';
import clsx from 'clsx';
import type { RekapCellSpec } from './cellSpec';

interface ClickableCountProps {
  count: number;
  spec?: RekapCellSpec;
  onCellClick?: (spec: RekapCellSpec) => void;
  className?: string;
  style?: CSSProperties;
  disabled?: boolean;
  showZero?: boolean;
}

/**
 * Renders a count as a clickable button (opens the ticket-member modal) while
 * keeping the exact visual style of the surrounding table/card cell. Non-count
 * cells pass `spec={undefined}` and render as a static span.
 */
export default function ClickableCount({
  count,
  spec,
  onCellClick,
  className,
  style,
  disabled,
  showZero = false,
}: ClickableCountProps) {
  const value = showZero ? count : count > 0 ? String(count) : '-';
  const canOpen = Boolean(spec) && !disabled && count > 0;

  if (!canOpen) {
    return (
      <span className={className} style={style}>
        {value}
      </span>
    );
  }

  return (
    <button
      type='button'
      className={clsx(
        'inline-flex cursor-pointer items-center justify-center rounded-full px-1.5 -mx-1.5 py-1 -my-1 min-h-6 min-w-6 text-[11px] font-semibold leading-none transition-all hover:ring-2 hover:ring-blue-500/40 focus:ring-2 focus:ring-blue-500/50 focus:outline-none',
        className,
      )}
      style={style}
      onClick={(event) => {
        event.stopPropagation();
        onCellClick?.(spec!);
      }}
      aria-label={`Lihat ${count} ticket untuk ${spec!.label}`}
      title={`Lihat ${count} ticket: ${spec!.label}`}
    >
      {value}
    </button>
  );
}