'use client';

import { useEffect, useRef } from 'react';

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

  useEffect(() => {
    if (isOpen) cancelRef.current?.focus();
  }, [isOpen]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && isOpen && !loading) onClose();
    }

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen, loading, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className='fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4'
      onClick={() => {
        if (!loading) onClose();
      }}
      role='dialog'
      aria-modal='true'
      aria-label={title}
    >
      <div
        className='w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/10'
        onClick={(e) => e.stopPropagation()}
      >
        <div className='bg-gradient-to-br from-slate-900 to-slate-700 p-5'>
          <div className='flex items-start gap-3'>
            <div className='flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/15'>
              <svg
                className='h-5 w-5 text-white'
                viewBox='0 0 24 24'
                fill='none'
                stroke='currentColor'
              >
                <path
                  strokeLinecap='round'
                  strokeLinejoin='round'
                  strokeWidth={2}
                  d='M17 16l4-4m0 0l-4-4m4 4H9m4 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1'
                />
              </svg>
            </div>
            <div className='min-w-0 flex-1'>
              <h3 className='text-base font-semibold text-white'>{title}</h3>
              <p className='mt-1 text-sm text-white/80'>{description}</p>
            </div>
          </div>
        </div>

        <div className='p-5'>
          <div className='flex gap-3'>
            <button
              ref={cancelRef}
              onClick={onClose}
              disabled={loading}
              className='flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-60'
            >
              {cancelLabel}
            </button>
            <button
              onClick={onConfirm}
              disabled={loading}
              className='flex flex-1 items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-red-700 disabled:opacity-60'
            >
              {loading && (
                <span className='h-4 w-4 animate-spin rounded-full border-2 border-white/80 border-t-transparent' />
              )}
              {confirmLabel}
            </button>
          </div>
          {hint && (
            <p className='mt-3 text-center text-xs text-slate-500'>{hint}</p>
          )}
        </div>
      </div>
    </div>
  );
}
