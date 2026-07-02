'use client';

import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';

export type AdminToastType = 'success' | 'error' | 'info';

export interface AdminToastItem {
  id: string;
  type: AdminToastType;
  title: string;
  message?: string;
}

interface AdminToastOptions {
  persist?: boolean;
}

interface AdminToastContextValue {
  showSuccess: (title: string, message?: string, options?: AdminToastOptions) => void;
  showError: (title: string, message?: string, options?: AdminToastOptions) => void;
  showInfo: (title: string, message?: string, options?: AdminToastOptions) => void;
}

const STORAGE_KEY = 'dompis_admin_toasts';

const AdminToastContext = createContext<AdminToastContextValue | null>(null);

function safeReadPersistedToasts(): AdminToastItem[] {
  if (typeof window === 'undefined') return [];

  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as AdminToastItem[];
    window.sessionStorage.removeItem(STORAGE_KEY);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function safePersistToast(toast: AdminToastItem) {
  if (typeof window === 'undefined') return;

  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    const current = raw ? (JSON.parse(raw) as AdminToastItem[]) : [];
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...current, toast]));
  } catch {
    // noop
  }
}

function ToastCard({
  toast,
  onDismiss,
}: {
  toast: AdminToastItem;
  onDismiss: (id: string) => void;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const enter = window.requestAnimationFrame(() => setVisible(true));
    const timer = window.setTimeout(() => {
      setVisible(false);
      window.setTimeout(() => onDismiss(toast.id), 220);
    }, 3600);

    return () => {
      window.cancelAnimationFrame(enter);
      window.clearTimeout(timer);
    };
  }, [onDismiss, toast.id]);

  const styles = {
    success: {
      wrap: 'border-emerald-200 bg-white shadow-[0_12px_40px_rgba(16,185,129,0.18)] dark:border-emerald-500/20 dark:bg-slate-900',
      icon: <CheckCircle2 className='h-5 w-5' />,
      accent: 'bg-emerald-500',
      title: 'text-emerald-800 dark:text-emerald-300',
    },
    error: {
      wrap: 'border-rose-200 bg-white shadow-[0_12px_40px_rgba(244,63,94,0.18)] dark:border-rose-500/20 dark:bg-slate-900',
      icon: <AlertCircle className='h-5 w-5' />,
      accent: 'bg-rose-500',
      title: 'text-rose-800 dark:text-rose-300',
    },
    info: {
      wrap: 'border-sky-200 bg-white shadow-[0_12px_40px_rgba(14,165,233,0.18)] dark:border-sky-500/20 dark:bg-slate-900',
      icon: <Info className='h-5 w-5' />,
      accent: 'bg-sky-500',
      title: 'text-sky-800 dark:text-sky-300',
    },
  }[toast.type];

  return (
    <div
      className={clsx(
        'pointer-events-auto relative overflow-hidden rounded-2xl border px-4 py-3.5 transition-all duration-300',
        styles.wrap,
        visible ? 'translate-y-0 opacity-100' : '-translate-y-3 opacity-0',
      )}
    >
      <div className={clsx('absolute inset-x-0 bottom-0 h-0.75', styles.accent)} />
      <div className='flex items-start gap-3'>
        <div className={clsx('mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl', styles.accent, 'text-white')}>
          {styles.icon}
        </div>
        <div className='min-w-0 flex-1'>
          <p className={clsx('text-sm font-semibold', styles.title)}>{toast.title}</p>
          {toast.message ? (
            <p className='mt-0.5 text-xs leading-snug text-slate-500 dark:text-slate-400'>
              {toast.message}
            </p>
          ) : null}
        </div>
        <button
          type='button'
          onClick={() => onDismiss(toast.id)}
          className='shrink-0 rounded-full p-1 text-slate-300 transition hover:bg-slate-100 hover:text-slate-600 dark:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300'
          aria-label='Dismiss toast'
        >
          <X className='h-4 w-4' />
        </button>
      </div>
    </div>
  );
}

export function AdminToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<AdminToastItem[]>([]);

  useEffect(() => {
    setToasts(safeReadPersistedToasts());
  }, []);

  const addToast = useCallback((type: AdminToastType, title: string, message?: string, options?: AdminToastOptions) => {
    const toast: AdminToastItem = {
      id: `toast-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      type,
      title,
      message,
    };

    setToasts((prev) => [...prev, toast]);
    if (options?.persist) {
      safePersistToast(toast);
    }
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const value = useMemo<AdminToastContextValue>(() => ({
    showSuccess: (title, message, options) => addToast('success', title, message, options),
    showError: (title, message, options) => addToast('error', title, message, options),
    showInfo: (title, message, options) => addToast('info', title, message, options),
  }), [addToast]);

  return (
    <AdminToastContext.Provider value={value}>
      {children}
      <AdminToastViewport toasts={toasts} onDismiss={dismissToast} />
    </AdminToastContext.Provider>
  );
}

export function useAdminToast() {
  const context = useContext(AdminToastContext);

  return context ?? {
    showSuccess: () => {},
    showError: () => {},
    showInfo: () => {},
  };
}

export function AdminToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: AdminToastItem[];
  onDismiss: (id: string) => void;
}) {
  if (!toasts.length) return null;

  return (
    <div className='pointer-events-none fixed left-1/2 top-4 z-[120] flex w-[calc(100vw-1.5rem)] max-w-sm -translate-x-1/2 flex-col gap-2 sm:top-6'>
      {toasts.map((toast) => (
        <ToastCard key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}
