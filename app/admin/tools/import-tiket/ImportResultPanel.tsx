'use client';

import Link from 'next/link';
import { Check, RotateCcw, FileSpreadsheet, Loader2, AlertTriangle } from 'lucide-react';
import Button from '@/app/components/ui/Button';
import type { ImportProjectionStatus, ImportResult, LastUploadInfo } from './types';

interface ImportResultPanelProps {
  result: ImportResult;
  lastUpload: LastUploadInfo | null;
  projectionStatus: ImportProjectionStatus | null;
  handleReset: () => void;
}

export default function ImportResultPanel({
  result,
  lastUpload,
  projectionStatus,
  handleReset,
}: ImportResultPanelProps) {
  const status = projectionStatus?.projection_status ?? 'queued';
  const statusLabel = {
    queued: 'Queued',
    running: 'Processing',
    done: 'Ready',
    failed: 'Failed',
    aborted: 'Aborted',
    disabled: 'Disabled',
  }[status];

  const statusTone = {
    queued: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/20 dark:text-amber-300',
    running: 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950/20 dark:text-blue-300',
    done: 'border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950/20 dark:text-green-300',
    failed: 'border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/20 dark:text-red-300',
    aborted: 'border-slate-200 bg-slate-50 text-slate-800 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-300',
    disabled: 'border-slate-200 bg-slate-50 text-slate-800 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-300',
  }[status];

  const statusIcon = {
    queued: <Loader2 className='h-4 w-4 animate-spin' />,
    running: <Loader2 className='h-4 w-4 animate-spin' />,
    done: <Check className='h-4 w-4' />,
    failed: <AlertTriangle className='h-4 w-4' />,
    aborted: <AlertTriangle className='h-4 w-4' />,
    disabled: <AlertTriangle className='h-4 w-4' />,
  }[status];

  const statusMessage = {
    queued: 'Data sudah masuk staging, projection menunggu worker.',
    running: 'Data sedang diproyeksikan ke tabel utama.',
    done: 'Data sudah siap tampil di dashboard.',
    failed: 'Projection gagal. Silakan cek worker atau coba import ulang.',
    aborted: 'Projection dihentikan.',
    disabled: 'Projection sedang nonaktif.',
  }[status];

  return (
    <div className='space-y-6'>
      <div className={`rounded-2xl border p-8 text-center ${statusTone}`}>
        <div className='mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-white/70 dark:bg-black/20'>
          {statusIcon}
        </div>
        <h2 className='text-xl font-bold'>
          Import Berhasil
        </h2>
        <p className='mt-2 text-sm'>
          {statusMessage}
        </p>
        <div className='mt-4 inline-flex items-center rounded-full border border-current/20 bg-white/60 px-3 py-1 text-[10px] font-semibold tracking-[0.16em] uppercase'>
          {statusLabel}
        </div>
      </div>

      <div className='grid grid-cols-2 gap-4 sm:grid-cols-4'>
        <div className='rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950'>
          <p className='text-2xl font-bold text-blue-600'>
            {result.inserted}
          </p>
          <p className='text-xs text-slate-500'>Baru</p>
        </div>
        <div className='rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950'>
          <p className='text-2xl font-bold text-amber-600'>
            {result.updated}
          </p>
          <p className='text-xs text-slate-500'>Diperbarui</p>
        </div>
        <div className='rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950'>
          <p className='text-2xl font-bold text-slate-500'>
            {result.skipped}
          </p>
          <p className='text-xs text-slate-500'>Dilewati</p>
        </div>
        <div className='rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950'>
          <p className='text-2xl font-bold text-red-600'>
            {result.failed}
          </p>
          <p className='text-xs text-slate-500'>Gagal</p>
        </div>
      </div>

      <div className='rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950'>
        <p className='text-xs text-slate-500'>
          Nama Batch:{' '}
          <span className='font-mono font-medium text-slate-700 dark:text-slate-300'>
            {result.import_batch}
          </span>
        </p>
        {projectionStatus?.projection_status && (
          <p className='mt-1 text-xs text-slate-500'>
            Projection:{' '}
            <span className='font-medium text-slate-700 dark:text-slate-300'>
              {projectionStatus.projection_status}
            </span>
          </p>
        )}
        <p className='mt-1 text-xs text-slate-500'>
          Diunggah oleh:{' '}
          <span className='font-medium text-slate-700 dark:text-slate-300'>
            {result.uploaded_by || lastUpload?.uploaded_by || 'Tidak diketahui'}
          </span>
        </p>
      </div>

      {result.errors.length > 0 && (
        <div className='rounded-2xl border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950/20'>
          <p className='mb-2 text-sm font-medium text-red-800 dark:text-red-400'>
            Error Detail
          </p>
          <div className='max-h-40 space-y-1 overflow-y-auto'>
            {result.errors.map((err, i) => (
              <p
                key={i}
                className='text-xs text-red-700 dark:text-red-500'
              >
                {err}
              </p>
            ))}
          </div>
        </div>
      )}

      <div className='flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 p-4 shadow-sm sm:flex-row sm:items-center sm:justify-center dark:border-slate-800 dark:bg-slate-900/70'>
        <Button onClick={handleReset} className='min-w-40'>
          <RotateCcw className='mr-1.5 h-3.5 w-3.5' />
          Import Lagi
        </Button>
        <Link href='/admin'>
          <Button variant='outline' className='min-w-40'>
            <FileSpreadsheet className='mr-1.5 h-3.5 w-3.5' />
            Ke Dashboard
          </Button>
        </Link>
      </div>
    </div>
  );
}
