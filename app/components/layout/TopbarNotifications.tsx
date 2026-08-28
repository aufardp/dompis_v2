'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Inbox, Sparkles } from 'lucide-react';
import { cn } from '@/app/libs/utils';
import { useTopbarNotifications } from '@/app/hooks/useTopbarNotifications';
import NotificationCenter from './NotificationCenter';

type Props = {
  selectedWorkzone?: string;
};

type ActiveTab = 'inbox' | 'diamond';

export default function TopbarNotifications({ selectedWorkzone }: Props) {
  const router = useRouter();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>('inbox');

  const {
    inboxItems,
    diamondAlerts,
    inboxUnreadCount,
    diamondUnreadCount,
    diamondCriticalCount,
    totalUnreadCount,
    loading,
    error,
    refetch,
    markItemRead,
    markAllRead,
  } = useTopbarNotifications(selectedWorkzone);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent | PointerEvent) => {
      if (!wrapperRef.current) return;
      if (wrapperRef.current.contains(event.target as Node)) return;
      setOpen(false);
    };

    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    const onOpenNotifications = (event: Event) => {
      const detail = (event as CustomEvent).detail as ActiveTab | undefined;
      if (detail === 'inbox' || detail === 'diamond') setActiveTab(detail);
      setOpen(true);
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onEscape);
    window.addEventListener('dompis:open-notifications' as any, onOpenNotifications);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onEscape);
      window.removeEventListener('dompis:open-notifications' as any, onOpenNotifications);
    };
  }, []);

  const handleOpen = (tab: ActiveTab) => {
    setActiveTab(tab);
    setOpen((current) => (current && activeTab === tab ? !current : true));
  };

  const handleItemClick = useCallback(
    async (scope: ActiveTab, ticketCode: string, targetPath: string) => {
      await markItemRead(scope, ticketCode);
      setOpen(false);
      router.push(targetPath);
    },
    [markItemRead, router],
  );

  return (
    <div ref={wrapperRef} className='relative flex items-center gap-1.5'>
      <button
        type='button'
        onClick={() => handleOpen('inbox')}
        className={cn(
          'inline-flex min-h-11 items-center gap-2 rounded-2xl border px-2.5 py-2 text-sm font-semibold transition-colors',
          'border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10',
          open &&
            activeTab === 'inbox' &&
            'border-sky-300 bg-sky-50 text-sky-900 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-50',
        )}
        aria-label='Open alert B2B notifications'
      >
        <Inbox className='h-4 w-4' />
        <span className='hidden sm:inline'>Alert B2B</span>
        <span
          className={cn(
            'inline-flex min-w-6 items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] leading-none font-bold',
            inboxUnreadCount > 0
              ? 'bg-sky-500 text-white'
              : 'bg-slate-200 text-slate-600 dark:bg-white/10 dark:text-slate-300',
          )}
        >
          {inboxUnreadCount}
        </span>
      </button>

      <button
        type='button'
        onClick={() => handleOpen('diamond')}
        className={cn(
          'relative inline-flex min-h-11 items-center gap-2 rounded-2xl border px-2.5 py-2 text-sm font-semibold transition-colors',
          'border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10',
          open &&
            activeTab === 'diamond' &&
            'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-50',
        )}
        aria-label={`Open alert B2C alerts${diamondCriticalCount > 0 ? `, ${diamondCriticalCount} critical` : ''}`}
      >
        <Sparkles className='h-4 w-4' />
        <span className='hidden sm:inline'>Alert B2C</span>
        {diamondCriticalCount > 0 ? (
          <span
            className='absolute top-2 right-2.5 h-2.5 w-2.5 rounded-full border border-white bg-rose-500 shadow-[0_0_0_2px_rgba(255,255,255,0.8)] dark:border-slate-950 dark:shadow-[0_0_0_2px_rgba(2,6,23,0.9)]'
            aria-hidden='true'
            title={`${diamondCriticalCount} critical diamond alert${diamondCriticalCount > 1 ? 's' : ''}`}
          />
        ) : null}
        <span
          className={cn(
            'inline-flex min-w-6 items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] leading-none font-bold',
            diamondUnreadCount > 0
              ? 'bg-amber-500 text-white'
              : 'bg-slate-200 text-slate-600 dark:bg-white/10 dark:text-slate-300',
          )}
        >
          {diamondUnreadCount}
        </span>
      </button>

      {open && (
        <button
          type='button'
          aria-hidden='true'
          tabIndex={-1}
          onClick={close}
          className='fixed inset-0 z-[59] bg-black/20 backdrop-blur-[1px] sm:hidden'
        />
      )}
      <NotificationCenter
        open={open}
        activeTab={activeTab}
        inboxItems={inboxItems}
        diamondAlerts={diamondAlerts}
        inboxUnreadCount={inboxUnreadCount}
        diamondUnreadCount={diamondUnreadCount}
        totalUnreadCount={totalUnreadCount}
        loading={loading}
        error={error}
        onClose={close}
        onSwitchTab={setActiveTab}
        onMarkAllRead={() => markAllRead('all')}
        onItemClick={handleItemClick}
        onRetry={refetch}
      />
    </div>
  );
}
