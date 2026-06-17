'use client';

import { cn } from '@/app/libs/utils';
import {
  ArrowUpRight,
  AlertTriangle,
  Inbox,
  Sparkles,
  Clock3,
} from 'lucide-react';

type NotificationKind = 'inbox' | 'diamond';

type Props = {
  kind: NotificationKind;
  ticketCode: string;
  bucketLabel: string;
  summary: string;
  reportedAt: string;
  ageLabel?: string;
  isRead: boolean;
  priority?: 'normal' | 'warning' | 'high';
  severity?: 'warning' | 'high' | 'critical';
  reason?: string;
  title?: string;
  onClick: () => void;
};

function getAccent(kind: NotificationKind, severity?: Props['severity']) {
  if (kind === 'diamond') {
    if (severity === 'critical') {
      return {
        wrapper:
          'border-rose-200 bg-rose-50/80 ring-1 ring-rose-300/50 dark:border-rose-500/25 dark:bg-rose-500/8 dark:ring-rose-400/20',
        icon: 'text-rose-600 dark:text-rose-300',
        pill: 'bg-rose-600 text-white dark:bg-rose-500 dark:text-white',
      };
    }
    if (severity === 'high') {
      return {
        wrapper:
          'border-amber-200 bg-amber-50/80 dark:border-amber-500/25 dark:bg-amber-500/8',
        icon: 'text-amber-600 dark:text-amber-300',
        pill: 'bg-amber-500/10 text-amber-700 dark:bg-amber-400/10 dark:text-amber-100',
      };
    }
    return {
      wrapper:
        'border-sky-200 bg-sky-50/80 dark:border-sky-500/25 dark:bg-sky-500/8',
      icon: 'text-sky-600 dark:text-sky-300',
      pill: 'bg-sky-500/10 text-sky-700 dark:bg-sky-400/10 dark:text-sky-100',
    };
  }

  return {
    wrapper:
      'border-slate-200 bg-white/85 dark:border-white/10 dark:bg-white/5',
    icon: 'text-slate-500 dark:text-slate-300',
    pill: 'bg-slate-900/5 text-slate-700 dark:bg-white/10 dark:text-slate-100',
  };
}

export default function NotificationItem({
  kind,
  ticketCode,
  bucketLabel,
  summary,
  reportedAt,
  ageLabel,
  isRead,
  priority,
  severity,
  reason,
  title,
  onClick,
}: Props) {
  const accent = getAccent(kind, severity);
  const Icon = kind === 'diamond' ? AlertTriangle : Inbox;
  const isCriticalDiamond = kind === 'diamond' && severity === 'critical';
  const severityLabel =
    kind === 'diamond'
      ? severity === 'critical'
        ? 'Critical'
        : severity === 'high'
          ? 'High'
          : 'Warning'
      : priority === 'high'
        ? 'High'
        : priority === 'warning'
          ? 'Warning'
          : 'Normal';

  return (
    <button
      type='button'
      onClick={onClick}
      className={cn(
        'group w-full rounded-2xl border p-3 text-left transition-all duration-200',
        'hover:-translate-y-0.5 hover:shadow-md',
        accent.wrapper,
        isRead
          ? 'opacity-75'
          : 'shadow-[0_6px_22px_rgba(15,23,42,0.06)] dark:shadow-none',
      )}
    >
      <div className='flex items-start gap-3'>
        <div
          className={cn(
            'grid h-10 w-10 shrink-0 place-items-center rounded-2xl border',
            kind === 'diamond'
              ? 'border-current/10 bg-white/80 dark:bg-white/5'
              : 'border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-white/5',
            accent.icon,
          )}
        >
          <Icon className='h-4 w-4' />
        </div>

        <div className='min-w-0 flex-1'>
          <div className='flex items-start justify-between gap-2'>
            <div className='min-w-0'>
              <p className='truncate text-sm font-semibold tracking-tight text-slate-950 dark:text-white'>
                {ticketCode}
              </p>
              <p className='mt-0.5 truncate text-[11px] font-medium text-slate-500 dark:text-slate-300'>
                {bucketLabel}
                {title ? ` · ${title}` : ''}
              </p>
            </div>

            <span
              className={cn(
                'inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-[0.14em] uppercase',
                accent.pill,
              )}
            >
              {severityLabel}
            </span>
          </div>

          <p className='mt-2 line-clamp-2 text-sm leading-5 text-slate-700 dark:text-slate-200'>
            {summary}
          </p>

          {kind === 'diamond' && reason ? (
            <div
              className={cn(
                'mt-2 rounded-2xl border border-dashed px-3 py-2 text-[11px]',
                isCriticalDiamond
                  ? 'border-rose-200 bg-rose-50/80 text-rose-900 dark:border-rose-500/25 dark:bg-rose-500/12 dark:text-rose-50'
                  : 'border-amber-200 bg-amber-50/70 text-amber-900 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-50',
              )}
            >
              <div className='flex items-center gap-1.5 font-semibold tracking-[0.16em] uppercase'>
                {isCriticalDiamond ? (
                  <AlertTriangle className='h-3.5 w-3.5' />
                ) : (
                  <Sparkles className='h-3 w-3' />
                )}
                {isCriticalDiamond ? 'Immediate attention' : 'Perhatian'}
              </div>
              <p
                className={cn(
                  'mt-1 leading-5',
                  isCriticalDiamond
                    ? 'text-rose-900/90 dark:text-rose-50/95'
                    : 'text-amber-900/85 dark:text-amber-50/90',
                )}
              >
                {reason}
              </p>
            </div>
          ) : reason ? (
            <p className='mt-1 truncate text-[11px] text-slate-500 dark:text-slate-300'>
              {reason}
            </p>
          ) : null}

          <div className='mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-500 dark:text-slate-300'>
            <span className='inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 dark:border-white/10 dark:bg-white/5'>
              <Clock3 className='h-3 w-3' />
              {ageLabel || reportedAt}
            </span>
            <span className='inline-flex items-center rounded-full border border-slate-200 bg-white px-2 py-0.5 dark:border-white/10 dark:bg-white/5'>
              {isRead ? 'Read' : 'New'}
            </span>
            <span className='inline-flex items-center gap-1 text-[11px] font-semibold text-slate-900 dark:text-white'>
              Buka
              <ArrowUpRight className='h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5' />
            </span>
          </div>
        </div>
      </div>
    </button>
  );
}
