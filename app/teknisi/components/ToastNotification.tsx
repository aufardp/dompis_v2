'use client';
import { useEffect, useState } from 'react';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastItem {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
}

interface Props {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}

export default function ToastNotification({ toasts, onDismiss }: Props) {
  if (!toasts.length) return null;

  return (
    <div className='fixed top-4 left-1/2 z-[100] flex -translate-x-1/2 flex-col gap-2 w-[calc(100vw-2rem)] max-w-sm'>
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function ToastItem({ toast, onDismiss }: { toast: ToastItem; onDismiss: (id: string) => void }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Slide in
    requestAnimationFrame(() => setVisible(true));
    // Auto dismiss after 3.5s
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(() => onDismiss(toast.id), 300); // wait for slide-out
    }, 3500);
    return () => clearTimeout(timer);
  }, [toast.id, onDismiss]);

  const styles = {
    success: {
      wrap: 'border-green-200 bg-white shadow-[0_8px_30px_rgba(22,163,74,0.18)]',
      icon: '✅',
      bar: 'bg-green-500',
      title: 'text-green-800',
    },
    error: {
      wrap: 'border-red-200 bg-white shadow-[0_8px_30px_rgba(220,38,38,0.18)]',
      icon: '❌',
      bar: 'bg-red-500',
      title: 'text-red-800',
    },
    info: {
      wrap: 'border-blue-200 bg-white shadow-[0_8px_30px_rgba(59,130,246,0.18)]',
      icon: 'ℹ️',
      bar: 'bg-blue-500',
      title: 'text-blue-800',
    },
  }[toast.type];

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border px-4 py-3.5 transition-all duration-300 ${styles.wrap} ${
        visible ? 'translate-y-0 opacity-100' : '-translate-y-4 opacity-0'
      }`}
    >
      {/* Progress bar auto-dismiss */}
      <div className={`absolute bottom-0 left-0 h-[3px] w-full ${styles.bar} animate-[shrink_3.5s_linear_forwards]`} />
      
      <div className='flex items-start gap-3'>
        <span className='text-xl leading-none'>{styles.icon}</span>
        <div className='min-w-0 flex-1'>
          <p className={`text-sm font-black ${styles.title}`}>{toast.title}</p>
          {toast.message && (
            <p className='mt-0.5 text-xs text-slate-500 leading-snug'>{toast.message}</p>
          )}
        </div>
        <button
          onClick={() => onDismiss(toast.id)}
          className='shrink-0 text-slate-300 hover:text-slate-500'
        >
          ✕
        </button>
      </div>
    </div>
  );
}
