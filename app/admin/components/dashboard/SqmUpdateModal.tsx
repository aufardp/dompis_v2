'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

const SQM_OPTIONS = [
  { value: 'CABUT', label: 'Cabut' },
  { value: 'ISOLIR', label: 'Isolir' },
  { value: 'ALAMAT_TIDAK_DITEMUKAN', label: 'Alamat tidak ditemukan' },
  { value: 'PELANGGAN_TIDAK_MAU_DIKUNJUNGI', label: 'Pelanggan tidak mau dikunjungi' },
  { value: 'LOKASI_KOSONG', label: 'Lokasi kosong' },
  { value: 'ONT_DIMATIKAN', label: 'ONT dimatikan' },
];

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}

export default function SqmUpdateModal({ open, onClose, onConfirm }: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (open) setSelected(null);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Enter' && selected) {
        e.preventDefault();
        onConfirm(selected);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, selected, onClose, onConfirm]);

  if (!open || !mounted) return null;

  return createPortal(
    <div
      className='fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm'
      onClick={onClose}
      role='dialog'
      aria-modal='true'
      aria-label='SQM Update'
    >
      <div
        className='animate-in fade-in zoom-in-95 flex w-full max-w-sm flex-col overflow-hidden rounded-2xl bg-white shadow-2xl duration-200 dark:bg-slate-900'
        onClick={(e) => e.stopPropagation()}
      >
        <div className='border-b border-gray-200 bg-gray-50 px-6 py-5 dark:border-slate-700 dark:bg-slate-900/70'>
          <div className='flex items-start justify-between gap-3'>
            <div>
              <h2 className='text-lg font-semibold text-gray-800 dark:text-slate-100'>
                SQM Update
              </h2>
              <p className='mt-0.5 text-xs text-gray-500 dark:text-slate-400'>
                Pilih alasan update
              </p>
            </div>
            <button
              type='button'
              onClick={onClose}
              className='inline-flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-500 transition hover:bg-gray-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700'
              aria-label='Close'
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div ref={listRef} className='space-y-1 px-4 py-4'>
          {SQM_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type='button'
              onClick={() => setSelected(opt.value)}
              className={`
                flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-medium transition
                ${
                  selected === opt.value
                    ? 'bg-violet-50 text-violet-700 ring-2 ring-violet-300 dark:bg-violet-500/20 dark:text-violet-300 dark:ring-violet-500/40'
                    : 'bg-gray-50 text-gray-700 hover:bg-gray-100 dark:bg-slate-800/70 dark:text-slate-300 dark:hover:bg-slate-700'
                }
              `}
            >
              <span
                className={`
                  flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition
                  ${
                    selected === opt.value
                      ? 'border-violet-500 bg-violet-500 dark:border-violet-400 dark:bg-violet-400'
                      : 'border-gray-300 dark:border-slate-500'
                  }
                `}
              >
                {selected === opt.value && (
                  <span className='h-2 w-2 rounded-full bg-white' />
                )}
              </span>
              {opt.label}
            </button>
          ))}
        </div>

        <div className='flex gap-3 border-t border-gray-200 bg-white px-6 py-5 dark:border-slate-700 dark:bg-slate-900'>
          <button
            onClick={onClose}
            className='flex-1 rounded-xl border border-gray-300 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 active:bg-gray-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800 dark:active:bg-slate-700'
          >
            Cancel
          </button>
          <button
            onClick={() => selected && onConfirm(selected)}
            disabled={!selected}
            className='flex-1 rounded-xl bg-violet-600 py-2.5 text-sm font-medium text-white transition hover:bg-violet-700 disabled:opacity-50 dark:bg-violet-700 dark:hover:bg-violet-600'
          >
            OK
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
