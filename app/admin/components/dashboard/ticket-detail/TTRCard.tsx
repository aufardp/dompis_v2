'use client';

import { getTTRUrgency } from './helpers';

interface TTRCardProps {
  label: string;
  value: string;
}

export function TTRCard({ label, value }: TTRCardProps) {
  const urgency = getTTRUrgency(value);

  const styles = {
    overdue: 'border-red-200 bg-red-50 dark:border-red-500/30 dark:bg-red-500/10',
    warning:
      'border-amber-200 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10',
    safe: 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800',
  };

  const textStyles = {
    overdue: 'text-red-700 dark:text-red-400',
    warning: 'text-amber-700 dark:text-amber-400',
    safe: 'text-slate-700 dark:text-slate-200',
  };

  return (
    <div className={`rounded-lg border p-3 ${styles[urgency]}`}>
      <div className='text-[10px] font-medium text-slate-500 uppercase dark:text-slate-400'>{label}</div>
      <div className={`mt-0.5 text-sm font-bold ${textStyles[urgency]}`}>{value}</div>
    </div>
  );
}
