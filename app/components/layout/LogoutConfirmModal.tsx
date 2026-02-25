'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface Props {
  isOpen: boolean;
  title?: string;
  description?: string;
  hint?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  loading?: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export default function LogoutConfirmModal({
  isOpen,
  title = 'Logout',
  description = 'You will need to sign in again to access the dashboard.',
  hint,
  confirmLabel = 'Yes, logout',
  cancelLabel = 'Cancel',
  loading = false,
  onClose,
  onConfirm,
}: Props) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (isOpen) cancelRef.current?.focus();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && isOpen && !loading) onClose();
    }

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen, loading, onClose]);

  if (!isOpen) return null;

  if (!mounted) return null;

  return createPortal(
    <div
      className='fixed inset-0 z-[1000] grid place-items-center bg-black/40 p-4 backdrop-blur-sm'
      onClick={() => {
        if (!loading) onClose();
      }}
      role='dialog'
      aria-modal='true'
      aria-label={title}
    >
      <div
        className='w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl'
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h3 className='text-lg font-semibold text-slate-900'>{title}</h3>
          <p className='mt-2 text-sm text-slate-500'>{description}</p>
        </div>

        <div className='mt-6 flex gap-3'>
          <button
            ref={cancelRef}
            onClick={onClose}
            disabled={loading}
            className='flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60'
          >
            {cancelLabel}
          </button>

          <button
            onClick={onConfirm}
            disabled={loading}
            className='flex flex-1 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60'
          >
            {loading && (
              <span className='h-4 w-4 animate-spin rounded-full border-2 border-white/80 border-t-transparent' />
            )}
            {confirmLabel}
          </button>
        </div>

        {hint && (
          <p className='mt-4 text-center text-xs text-slate-400'>{hint}</p>
        )}
      </div>
    </div>,
    document.body,
  );
}
