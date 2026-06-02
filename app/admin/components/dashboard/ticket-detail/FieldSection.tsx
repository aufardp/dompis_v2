'use client';

import { type ReactNode } from 'react';
import clsx from 'clsx';

interface FieldProps {
  label: string;
  value?: string | number | null;
  mono?: boolean;
  fullWidth?: boolean;
  highlight?: boolean;
}

export function Field({
  label,
  value,
  mono,
  fullWidth,
  highlight,
}: FieldProps) {
  const displayValue = value ?? '—';
  return (
    <div className={clsx(fullWidth && 'col-span-2')}>
      <div className='text-[10px] font-medium tracking-wider text-slate-500 uppercase dark:text-slate-400'>
        {label}
      </div>
      <div
        className={clsx(
          'mt-0.5 text-xs font-semibold wrap-break-word text-slate-800 dark:text-slate-200',
          mono && 'font-mono tracking-tight',
          highlight && 'text-orange-600 dark:text-orange-400',
        )}
      >
        {displayValue}
      </div>
    </div>
  );
}

interface SectionProps {
  icon?: ReactNode;
  title: string;
  children: ReactNode;
  variant?: 'default' | 'highlighted';
  fullWidth?: boolean;
}

export function Section({
  icon,
  title,
  children,
  variant = 'default',
  fullWidth = false,
}: SectionProps) {
  return (
    <div
      className={clsx(
        'mb-5 rounded-xl border p-4 shadow-xs',
        variant === 'highlighted'
          ? 'border-slate-200 bg-linear-to-br from-white to-slate-50 dark:border-slate-700 dark:from-slate-800 dark:to-slate-800'
          : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800',
      )}
    >
      <div className='mb-3 flex items-center gap-2 border-b border-slate-100 pb-2 dark:border-slate-700'>
        {icon && <span className='text-slate-400'>{icon}</span>}
        <h3 className='text-xs font-semibold tracking-wider text-slate-600 uppercase dark:text-slate-400'>
          {title}
        </h3>
      </div>
      <div
        className={clsx(
          'grid gap-x-4 gap-y-3',
          fullWidth ? 'grid-cols-1' : 'grid-cols-2',
        )}
      >
        {children}
      </div>
    </div>
  );
}
