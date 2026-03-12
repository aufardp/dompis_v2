'use client';

import * as React from 'react';
import { DayPicker } from 'react-day-picker';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/app/libs/utils';

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

export function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn('p-2', className)}
      classNames={{
        months: 'flex flex-col gap-4 sm:flex-row sm:gap-6',
        month: 'space-y-3',
        caption: 'flex items-center justify-between px-1',
        caption_label: 'text-sm font-bold text-(--text-primary)',
        nav: 'flex items-center gap-1',
        nav_button: cn(
          'bg-surface-2 hover:bg-surface-3 inline-flex h-8 w-8 items-center justify-center rounded-lg border border-(--border) text-(--text-secondary) transition',
        ),
        table: 'w-full border-collapse space-y-1',
        head_row: 'flex',
        head_cell:
          'w-9 text-center text-[10px] font-bold tracking-wide text-(--text-muted) uppercase',
        row: 'mt-1 flex w-full',
        cell: 'relative h-9 w-9 p-0 text-center text-sm',
        day: cn(
          'h-9 w-9 rounded-lg text-xs font-semibold text-(--text-primary) transition',
          'hover:bg-surface-2 focus:outline-none focus:ring-2 focus:ring-blue-500/30',
        ),
        day_today: 'border border-blue-500/40',
        day_outside: 'text-(--text-muted) opacity-50',
        day_disabled: 'text-(--text-muted) opacity-30',
        day_selected:
          'bg-blue-600 text-white hover:bg-blue-600 focus:bg-blue-600',
        day_range_start:
          'bg-blue-600 text-white hover:bg-blue-600 rounded-r-none',
        day_range_end:
          'bg-blue-600 text-white hover:bg-blue-600 rounded-l-none',
        day_range_middle:
          'bg-blue-600/15 text-(--text-primary) hover:bg-blue-600/20 rounded-none',
        ...classNames,
      }}
      components={{
        Chevron: ({ className: iconClassName, orientation, ...p }: any) => {
          if (orientation === 'left') {
            return (
              <ChevronLeft className={cn('h-4 w-4', iconClassName)} {...p} />
            );
          }
          return (
            <ChevronRight className={cn('h-4 w-4', iconClassName)} {...p} />
          );
        },
      }}
      {...props}
    />
  );
}
