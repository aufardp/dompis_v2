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
  title = 'Keluar dari aplikasi?',
  description = 'Anda harus login kembali untuk mengakses aplikasi.',
  hint,
  confirmLabel = 'Ya, keluar',
  cancelLabel = 'Batal',
  loading = false,
  onClose,
  onConfirm,
}: Props) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Focus cancel on open
  useEffect(() => {
    if (isOpen) cancelRef.current?.focus();
  }, [isOpen]);

  // Lock scroll
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  // Escape key
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !loading) onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen, loading, onClose]);

  if (!mounted || !isOpen) return null;

  return createPortal(
    <div
      className='fixed inset-0 z-1000 flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center'
      onClick={() => {
        if (!loading) onClose();
      }}
      role='dialog'
      aria-modal='true'
      aria-label={title}
    >
      {/* Sheet / Card */}
      <div
        className='animate-slide-up bg-surface shadow-theme-xl w-full max-w-sm rounded-t-3xl px-5 pt-4 pb-10 sm:rounded-2xl sm:pb-6'
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle — visible only as bottom sheet on mobile */}
        <div className='bg-surface-3 mx-auto mb-5 h-1 w-10 rounded-full sm:hidden' />

        {/* Icon */}
        <div className='bg-error-50 dark:bg-error-500/10 mb-4 flex h-12 w-12 items-center justify-center rounded-2xl'>
          <svg
            className='text-error-500 h-6 w-6'
            viewBox='0 0 24 24'
            fill='none'
            stroke='currentColor'
            strokeWidth='2'
            strokeLinecap='round'
            strokeLinejoin='round'
          >
            <path d='M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4' />
            <polyline points='16 17 21 12 16 7' />
            <line x1='21' y1='12' x2='9' y2='12' />
          </svg>
        </div>

        {/* Text */}
        <h3 className='text-text-primary text-[17px] leading-snug font-black'>
          {title}
        </h3>
        <p className='text-text-secondary mt-1.5 text-[13.5px] leading-relaxed font-medium'>
          {description}
        </p>

        {/* Buttons */}
        <div className='mt-6 flex gap-2.5'>
          {/* Cancel */}
          <button
            ref={cancelRef}
            onClick={onClose}
            disabled={loading}
            className='border-border bg-surface-2 text-text-primary hover:bg-surface-3 flex h-12.5 flex-1 items-center justify-center rounded-2xl border text-[13.5px] font-bold transition-colors disabled:opacity-50'
          >
            {cancelLabel}
          </button>

          {/* Confirm — destructive */}
          <button
            onClick={onConfirm}
            disabled={loading}
            className='bg-error-500 hover:bg-error-600 flex h-12.5 flex-1 items-center justify-center gap-2 rounded-2xl text-[13.5px] font-black text-white shadow-[0_4px_14px_rgba(240,68,56,0.30)] transition-all active:scale-[0.97] disabled:opacity-60 disabled:shadow-none'
          >
            {loading && (
              <span className='h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white' />
            )}
            {confirmLabel}
          </button>
        </div>

        {/* Hint */}
        {hint && (
          <p className='text-text-muted mt-3 text-center text-[11px] font-medium'>
            {hint}
          </p>
        )}
      </div>
    </div>,
    document.body,
  );
}
