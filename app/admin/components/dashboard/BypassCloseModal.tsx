'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ShieldAlert, X } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  ticketCode?: string | null;
  loading?: boolean;
}

export default function BypassCloseModal({
  open,
  onClose,
  onConfirm,
  ticketCode,
  loading = false,
}: Props) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;

    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) onClose();
      if (e.key === 'Enter' && !loading) {
        e.preventDefault();
        onConfirm();
      }
    };

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [loading, onClose, onConfirm, open]);

  if (!open || !mounted) return null;

  return createPortal(
    <div
      className='fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm'
      onClick={() => {
        if (!loading) onClose();
      }}
      role='dialog'
      aria-modal='true'
      aria-label='Bypass Close'
    >
      <div
        className='animate-in fade-in zoom-in-95 flex w-full max-w-sm flex-col overflow-hidden rounded-2xl bg-white shadow-2xl duration-200 dark:bg-slate-900'
        onClick={(e) => e.stopPropagation()}
      >
        <div className='border-b border-amber-200 bg-amber-50 px-6 py-5 dark:border-amber-500/20 dark:bg-amber-500/10'>
          <div className='flex items-start justify-between gap-3'>
            <div className='flex items-start gap-3'>
              <div className='mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-300'>
                <ShieldAlert className='h-5 w-5' />
              </div>
              <div>
                <h2 className='text-lg font-semibold text-amber-950 dark:text-amber-100'>
                  Bypass Close
                </h2>
                <p className='mt-0.5 text-xs text-amber-800/80 dark:text-amber-200/80'>
                  Ticket akan ditandai close via bypass dan masuk alur validasi.
                </p>
              </div>
            </div>
            <button
              type='button'
              onClick={onClose}
              disabled={loading}
              className='inline-flex h-9 w-9 items-center justify-center rounded-xl border border-amber-200 bg-white text-amber-700 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-amber-500/20 dark:bg-slate-800 dark:text-amber-300 dark:hover:bg-slate-700'
              aria-label='Close'
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className='space-y-3 px-6 py-5'>
          <p className='text-sm leading-relaxed text-slate-600 dark:text-slate-300'>
            {ticketCode ? (
              <>
                Ticket{' '}
                <span className='font-semibold text-slate-900 dark:text-slate-100'>
                  {ticketCode}
                </span>{' '}
                akan di-bypass close.
              </>
            ) : (
              'Ticket ini akan di-bypass close.'
            )}
          </p>
          <p className='rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-100'>
            Yang berubah hanya{' '}
            <span className='font-semibold'>Status Dompis</span> menjadi{' '}
            <span className='font-semibold'>close</span>. Status utama ticket
            tetap tidak diubah. Dan ticket akan berpindah ke Tab Validasi
          </p>
        </div>

        <div className='flex gap-3 border-t border-slate-200 bg-white px-6 py-5 dark:border-slate-700 dark:bg-slate-900'>
          <button
            onClick={onClose}
            disabled={loading}
            className='flex-1 rounded-xl border border-slate-300 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800'
          >
            Batal
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className='flex-1 rounded-xl bg-amber-600 py-2.5 text-sm font-semibold text-white transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-amber-500 dark:hover:bg-amber-400'
          >
            {loading ? 'Memproses...' : 'Bypass Close'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
