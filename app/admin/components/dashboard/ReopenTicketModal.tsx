'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { RotateCcw, X } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  ticketCode?: string | null;
  loading?: boolean;
}

export default function ReopenTicketModal({
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
      className='fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm'
      onClick={() => {
        if (!loading) onClose();
      }}
      role='dialog'
      aria-modal='true'
      aria-label='Reopen Ticket'
    >
      <div
        className='animate-in fade-in zoom-in-95 flex w-full max-w-sm flex-col overflow-hidden rounded-2xl bg-white shadow-2xl duration-200 dark:bg-slate-900'
        onClick={(e) => e.stopPropagation()}
      >
        <div className='border-b border-sky-200 bg-sky-50 px-6 py-5 dark:border-sky-500/20 dark:bg-sky-500/10'>
          <div className='flex items-start justify-between gap-3'>
            <div className='flex items-start gap-3'>
              <div className='mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-sky-500/10 text-sky-600 dark:text-sky-300'>
                <RotateCcw className='h-5 w-5' />
              </div>
              <div>
                <h2 className='text-lg font-semibold text-sky-950 dark:text-sky-100'>
                  Reopen Ticket
                </h2>
                <p className='mt-0.5 text-xs text-sky-800/80 dark:text-sky-200/80'>
                  Ticket akan dikembalikan ke open dan keluar dari validasi.
                </p>
              </div>
            </div>
            <button
              type='button'
              onClick={onClose}
              disabled={loading}
              className='inline-flex h-9 w-9 items-center justify-center rounded-xl border border-sky-200 bg-white text-sky-700 transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-sky-500/20 dark:bg-slate-800 dark:text-sky-300 dark:hover:bg-slate-700'
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
                akan direopen.
              </>
            ) : (
              'Ticket ini akan direopen.'
            )}
          </p>
          <p className='rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-xs text-sky-900 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-100'>
            Yang berubah: <span className='font-semibold'>status_update</span>{' '}
            menjadi <span className='font-semibold'>open</span>,{' '}
            <span className='font-semibold'>closed_at</span> dikosongkan, dan{' '}
            <span className='font-semibold'>teknisi_user_id</span> dilepas.
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
            className='flex-1 rounded-xl bg-sky-600 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-sky-500 dark:hover:bg-sky-400'
          >
            {loading ? 'Memproses...' : 'Reopen Ticket'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
