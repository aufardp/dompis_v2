'use client';

import * as React from 'react';
import { format, startOfDay, endOfDay, subDays } from 'date-fns';
import type { DateRange } from 'react-day-picker';
import { Calendar as CalendarIcon, X } from 'lucide-react';

import { Button } from '@/app/components/ui/shadcn-button';
import { Calendar } from '@/app/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/app/components/ui/popover';
import { cn } from '@/app/libs/utils';

function formatLabel(range?: DateRange) {
  if (!range?.from || !range?.to) return 'Select date range';
  return `${format(range.from, 'MMM dd, yyyy')} - ${format(
    range.to,
    'MMM dd, yyyy',
  )}`;
}

export default function DateRangePicker({
  value,
  onChange,
  onClear,
  className,
}: {
  value: DateRange | undefined;
  onChange: (range: DateRange | undefined) => void;
  onClear: () => void;
  className?: string;
}) {
  const hasRange = Boolean(value?.from && value?.to);

  const setQuick = (kind: '7d' | '30d' | 'ytd') => {
    const now = new Date();
    if (kind === '7d') {
      onChange({ from: startOfDay(subDays(now, 6)), to: endOfDay(now) });
      return;
    }
    if (kind === '30d') {
      onChange({ from: startOfDay(subDays(now, 29)), to: endOfDay(now) });
      return;
    }
    // ytd
    onChange({
      from: startOfDay(new Date(now.getFullYear(), 0, 1)),
      to: endOfDay(now),
    });
  };

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            type='button'
            variant='outline'
            className={cn(
              'w-[260px] justify-start font-semibold',
              !hasRange && 'text-(--text-secondary)',
            )}
          >
            <CalendarIcon className='h-4 w-4 text-(--text-secondary)' />
            <span className='truncate'>{formatLabel(value)}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent align='start' className='p-2'>
          <div className='flex flex-wrap gap-2 px-2 pb-2'>
            <Button
              type='button'
              size='sm'
              variant='ghost'
              onClick={() => setQuick('7d')}
            >
              Last 7 days
            </Button>
            <Button
              type='button'
              size='sm'
              variant='ghost'
              onClick={() => setQuick('30d')}
            >
              Last month
            </Button>
            <Button
              type='button'
              size='sm'
              variant='ghost'
              onClick={() => setQuick('ytd')}
            >
              Year to date
            </Button>
          </div>
          <Calendar
            mode='range'
            numberOfMonths={2}
            selected={value}
            onSelect={onChange}
            initialFocus
          />
        </PopoverContent>
      </Popover>

      {hasRange && (
        <Button
          type='button'
          size='icon'
          variant='ghost'
          onClick={onClear}
          title='Clear date range'
          className='border border-(--border)'
        >
          <X className='h-4 w-4' />
        </Button>
      )}
    </div>
  );
}
