'use client';

import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import clsx from 'clsx';

interface SearchToastProps {
  message: string | null;
  type: 'success' | 'error' | 'idle';
  onDismiss: () => void;
}

export default function SearchToast({
  message,
  type,
  onDismiss,
}: SearchToastProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!message) {
      setVisible(false);
      return;
    }
    setVisible(true);
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(onDismiss, 300);
    }, 3000);
    return () => clearTimeout(timer);
  }, [message, onDismiss]);

  if (!message) return null;

  return (
    <div
      className={clsx(
        'fixed top-20 left-1/2 z-[9999] w-[min(92vw,34rem)] -translate-x-1/2 transform transition-all duration-300',
        visible ? 'translate-y-0 opacity-100' : '-translate-y-4 opacity-0',
      )}
    >
      <div
        className={clsx(
          'flex items-start gap-4 rounded-3xl border px-5 py-4.5 text-sm font-semibold shadow-2xl backdrop-blur-xl md:px-6 md:py-5 md:text-base',
          type === 'success'
            ? 'border-emerald-400/30 bg-emerald-600/95 text-white'
            : 'border-amber-400/30 bg-amber-500/95 text-white',
        )}
      >
        <span className='flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/15 text-lg ring-1 ring-white/10'>
          {type === 'success' ? (
            <CheckCircle2 size={18} />
          ) : (
            <AlertTriangle size={18} />
          )}
        </span>
        <div className='min-w-0 flex-1'>
          <p className='text-[10px] font-bold tracking-[0.24em] uppercase text-white/75'>
            {type === 'success' ? 'Search Result' : 'Search Error'}
          </p>
          <p className='mt-0.5 break-words font-semibold'>{message}</p>
          <p className='mt-1 text-xs font-medium text-white/80'>
            {type === 'success'
              ? 'Bucket sudah dibuka.'
              : 'Coba kata kunci lain.'}
          </p>
        </div>
      </div>
    </div>
  );
}
