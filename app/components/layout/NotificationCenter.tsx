'use client';

import { cn } from '@/app/libs/utils';
import { BellRing, Inbox, Sparkles, CheckCheck, X } from 'lucide-react';
import NotificationItem from './NotificationItem';
import type {
  TopbarDiamondAlertItem,
  TopbarInboxItem,
} from '@/app/hooks/useTopbarNotifications';

type ActiveTab = 'inbox' | 'diamond';

type Props = {
  open: boolean;
  activeTab: ActiveTab;
  inboxItems: TopbarInboxItem[];
  diamondAlerts: TopbarDiamondAlertItem[];
  inboxUnreadCount: number;
  diamondUnreadCount: number;
  totalUnreadCount: number;
  loading?: boolean;
  error?: string | null;
  onClose: () => void;
  onSwitchTab: (tab: ActiveTab) => void;
  onMarkAllRead: () => void;
  onItemClick: (
    scope: ActiveTab,
    ticketCode: string,
    targetPath: string,
  ) => void;
  onRetry: () => void;
};

function EmptyState({ title, hint }: { title: string; hint: string }) {
  return (
    <div className='rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 px-4 py-5 text-center dark:border-white/10 dark:bg-white/5'>
      <div className='mx-auto grid h-10 w-10 place-items-center rounded-2xl bg-white text-slate-400 shadow-sm dark:bg-white/5'>
        <BellRing className='h-4 w-4' />
      </div>
      <p className='mt-3 text-sm font-semibold text-slate-900 dark:text-white'>
        {title}
      </p>
      <p className='mt-1 text-xs text-slate-500 dark:text-slate-300'>{hint}</p>
    </div>
  );
}

function SkeletonList() {
  return (
    <div className='space-y-2.5'>
      {Array.from({ length: 3 }).map((_, index) => (
        <div
          key={index}
          className='rounded-2xl border border-slate-200 bg-slate-50/70 p-3 dark:border-white/10 dark:bg-white/5'
        >
          <div className='flex items-start gap-3'>
            <div className='h-10 w-10 rounded-2xl bg-slate-200/80 dark:bg-white/10' />
            <div className='min-w-0 flex-1 space-y-2'>
              <div className='h-3.5 w-32 rounded-full bg-slate-200/80 dark:bg-white/10' />
              <div className='h-3 w-24 rounded-full bg-slate-200/80 dark:bg-white/10' />
              <div className='h-3 w-full rounded-full bg-slate-200/80 dark:bg-white/10' />
              <div className='h-3 w-2/3 rounded-full bg-slate-200/80 dark:bg-white/10' />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function NotificationCenter({
  open,
  activeTab,
  inboxItems,
  diamondAlerts,
  inboxUnreadCount,
  diamondUnreadCount,
  totalUnreadCount,
  loading = false,
  error = null,
  onClose,
  onSwitchTab,
  onMarkAllRead,
  onItemClick,
  onRetry,
}: Props) {
  if (!open) return null;

  const activeItems = activeTab === 'inbox' ? inboxItems : diamondAlerts;
  const isInbox = activeTab === 'inbox';
  const activeUnread = isInbox ? inboxUnreadCount : diamondUnreadCount;

  return (
    <div
      role='dialog'
      aria-modal='true'
      aria-label='Topbar notifications'
      className={cn(
        'fixed inset-x-3 top-18 z-60 sm:absolute sm:inset-x-auto sm:top-full sm:right-0 sm:mt-3',
        'w-auto sm:w-[24rem] lg:w-104',
      )}
    >
      <div className='overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_24px_60px_rgba(15,23,42,0.16)] backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/95 dark:shadow-[0_24px_60px_rgba(0,0,0,0.35)]'>
        <div className='border-b border-slate-200/80 bg-linear-to-b from-white to-slate-50 px-4 py-4 dark:border-white/10 dark:from-slate-950 dark:to-slate-900'>
          <div className='flex items-start justify-between gap-3'>
            <div className='min-w-0'>
              <div className='flex items-center gap-2'>
                <div className='grid h-8 w-8 place-items-center rounded-2xl bg-slate-900 text-white dark:bg-white dark:text-slate-950'>
                  <BellRing className='h-4 w-4' />
                </div>
                <div>
                  <p className='text-sm font-semibold tracking-tight text-slate-950 dark:text-white'>
                    Notifications
                  </p>
                  <p className='text-[11px] text-slate-500 dark:text-slate-300'>
                    Alert B2B (DATIN K1/K2, TSEL, TOP OLO) and Alert B2C
                    (Diamond/Platinum)
                  </p>
                </div>
              </div>
            </div>

            <div className='flex items-center gap-2'>
              <span className='inline-flex items-center rounded-full bg-slate-900 px-2.5 py-1 text-[10px] font-semibold tracking-[0.18em] text-white uppercase dark:bg-white dark:text-slate-950'>
                {totalUnreadCount}
              </span>
              <button
                type='button'
                onClick={onMarkAllRead}
                className='inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-700 transition-colors hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10'
              >
                <CheckCheck className='h-3.5 w-3.5' />
                Mark all
              </button>
              <button
                type='button'
                onClick={onClose}
                className='rounded-full border border-slate-200 bg-white p-2 text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-900 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white'
                aria-label='Close notifications'
              >
                <X className='h-4 w-4' />
              </button>
            </div>
          </div>

          <div className='mt-4 grid grid-cols-2 gap-2'>
            <button
              type='button'
              onClick={() => onSwitchTab('inbox')}
              className={cn(
                'flex items-center justify-between rounded-2xl border px-3 py-2.5 text-left transition-colors',
                isInbox
                  ? 'border-sky-300 bg-sky-50 text-sky-900 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-50'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10',
              )}
            >
              <span className='inline-flex items-center gap-2 text-sm font-semibold'>
                <Inbox className='h-4 w-4' />
                Alert B2B
              </span>
              <span className='text-[11px] font-semibold'>
                {inboxUnreadCount}
              </span>
            </button>

            <button
              type='button'
              onClick={() => onSwitchTab('diamond')}
              className={cn(
                'flex items-center justify-between rounded-2xl border px-3 py-2.5 text-left transition-colors',
                !isInbox
                  ? 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-50'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10',
              )}
            >
              <span className='inline-flex items-center gap-2 text-sm font-semibold'>
                <Sparkles className='h-4 w-4' />
                Alert B2C
              </span>
              <span className='text-[11px] font-semibold'>
                {diamondUnreadCount}
              </span>
            </button>
          </div>
        </div>

        <div className='[ -webkit-overflow-scrolling:touch] max-h-[min(60dvh,34rem)] space-y-3 overflow-y-auto overscroll-contain px-4 py-4'>
          {error ? (
            <div className='rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-900 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-50'>
              <p className='font-semibold'>Failed to load notifications.</p>
              <p className='mt-1 text-xs opacity-80'>{error}</p>
              <button
                type='button'
                onClick={onRetry}
                className='mt-3 inline-flex items-center gap-1 rounded-full bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-rose-700'
              >
                Retry
              </button>
            </div>
          ) : loading ? (
            <SkeletonList />
          ) : (
            <>
              <div className='flex items-center justify-between'>
                <div>
                  <p className='text-[10px] font-bold tracking-[0.22em] text-slate-500 uppercase dark:text-slate-400'>
                    {isInbox ? 'Alert B2B' : 'Alert B2C'}
                  </p>
                  <p className='mt-1 text-xs text-slate-500 dark:text-slate-300'>
                    {isInbox
                      ? 'Ticket B2B Customer (K1/K2, TSEL Premium/Critical, TOP OLO) OPEN hari ini.'
                      : 'Ticket Diamond & Platinum Customer OPEN hari ini.'}
                  </p>
                </div>
                <span className='rounded-full border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-600 dark:border-white/10 dark:text-slate-300'>
                  {activeUnread} unread
                </span>
              </div>

              {activeItems.length === 0 ? (
                <EmptyState
                  title={
                    isInbox ? 'No alert B2B tickets' : 'No alert B2C alerts'
                  }
                  hint={
                    isInbox
                      ? 'Ticket B2B Customer (K1/K2, Premium, Critical, TOP OLO) OPEN hari ini akan muncul di sini.'
                      : 'Ticket Diamond & Platinum Customer OPEN hari ini akan muncul di sini.'
                  }
                />
              ) : (
                <div className='space-y-2.5'>
                  {activeItems.map((item) => (
                    <NotificationItem
                      key={item.id}
                      kind={item.kind}
                      ticketCode={item.ticketCode}
                      bucketLabel={item.bucketLabel}
                      summary={item.summary}
                      reportedAt={item.reportedAt}
                      ageLabel={item.ageLabel}
                      isRead={item.isRead}
                      priority={
                        item.kind === 'inbox' ? item.priority : undefined
                      }
                      severity={
                        item.kind === 'diamond' ? item.severity : undefined
                      }
                      reason={item.kind === 'diamond' ? item.reason : undefined}
                      title={item.kind === 'diamond' ? item.title : undefined}
                      onClick={() =>
                        onItemClick(item.kind, item.ticketCode, item.targetPath)
                      }
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
