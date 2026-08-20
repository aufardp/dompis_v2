'use client';

import type { ReactNode } from 'react';
import { Camera, CheckCircle2, MapPin, Smartphone, Wrench } from 'lucide-react';

interface CloseConfirmationSheetProps {
  isOpen: boolean;
  summary: {
    alamat: string;
    deviceName: string;
    rca: string;
    subRca: string;
    detailPerbaikan: string;
    photoCount: number;
  };
  loading?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

function SummaryRow({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className='flex items-start gap-3 rounded-xl border border-(--border) bg-(--surface-2) px-3.5 py-2.5'>
      <span className='mt-0.5 shrink-0 text-(--text-tertiary)'>{icon}</span>
      <div className='min-w-0 flex-1'>
        <p className='text-[10px] font-bold tracking-wide text-(--text-tertiary) uppercase'>
          {label}
        </p>
        <p className='mt-0.5 text-[13px] leading-snug font-semibold break-words text-(--text-primary)'>
          {value}
        </p>
      </div>
    </div>
  );
}

export default function CloseConfirmationSheet({
  isOpen,
  summary,
  loading = false,
  onCancel,
  onConfirm,
}: CloseConfirmationSheetProps) {
  if (!isOpen) return null;

  return (
    <div
      className='fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm'
      onClick={onCancel}
    >
      <div
        className='w-full max-w-2xl rounded-t-3xl border-t border-(--border) bg-(--surface) p-5 shadow-2xl'
        style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className='mb-4 flex items-center gap-2'>
          <div className='bg-green-500/10 text-green-600 flex h-9 w-9 items-center justify-center rounded-xl dark:text-green-400'>
            <CheckCircle2 size={20} />
          </div>
          <div>
            <p className='text-sm font-bold text-(--text-primary)'>
              Ringkasan Sebelum Ditutup
            </p>
            <p className='text-xs text-(--text-secondary)'>
              Pastikan data di bawah sudah benar sebelum menutup ticket.
            </p>
          </div>
        </div>

        <div className='space-y-2'>
          <SummaryRow
            icon={<MapPin size={16} />}
            label='Alamat'
            value={summary.alamat}
          />
          <SummaryRow
            icon={<Smartphone size={16} />}
            label='Device Name (ODP)'
            value={summary.deviceName}
          />
          <SummaryRow
            icon={<Wrench size={16} />}
            label='RCA'
            value={`${summary.rca} — ${summary.subRca}`}
          />
          <SummaryRow
            icon={<CheckCircle2 size={16} />}
            label='Detail Perbaikan'
            value={summary.detailPerbaikan}
          />
          <SummaryRow
            icon={<Camera size={16} />}
            label='Evidence'
            value={`${summary.photoCount} foto terlampir`}
          />
        </div>

        <div className='mt-5 flex flex-col gap-2'>
          <button
            type='button'
            onClick={onCancel}
            disabled={loading}
            className='flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-2xl border border-(--border) bg-(--surface-2) text-sm font-bold text-(--text-secondary) transition-all active:scale-[0.98] disabled:opacity-50'
          >
            Ada yang perlu diubah
          </button>
          <button
            type='button'
            onClick={onConfirm}
            disabled={loading}
            className='flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-linear-to-br from-green-600 to-emerald-600 text-sm font-bold text-white shadow-md transition-all active:scale-[0.98] disabled:opacity-60'
          >
            {loading ? (
              <span className='h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white' />
            ) : (
              <CheckCircle2 size={18} />
            )}
            {loading ? 'Menutup...' : 'Ya, Tutup Ticket Sekarang'}
          </button>
        </div>
      </div>
    </div>
  );
}
