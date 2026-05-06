'use client';

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
        'fixed top-20 left-1/2 z-[9999] -translate-x-1/2 transform transition-all duration-300',
        visible ? 'translate-y-0 opacity-100' : '-translate-y-4 opacity-0',
      )}
    >
      <div
        className={clsx(
          'flex items-center gap-4 rounded-2xl px-6 py-4 text-base font-semibold shadow-2xl',
          type === 'success'
            ? 'bg-emerald-600 text-white'
            : 'bg-amber-500 text-white',
        )}
      >
        <span className='text-lg'>{type === 'success' ? '✓' : '⚠'}</span>
        <span>{message}</span>
      </div>
    </div>
  );
}
