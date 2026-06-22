'use client';

import Link from 'next/link';
import { Check, RotateCcw, FileSpreadsheet } from 'lucide-react';
import Button from '@/app/components/ui/Button';
import type { ImportResult, LastUploadInfo } from './types';

interface ImportResultPanelProps {
  result: ImportResult;
  lastUpload: LastUploadInfo | null;
  handleReset: () => void;
}

export default function ImportResultPanel({
  result,
  lastUpload,
  handleReset,
}: ImportResultPanelProps) {
  return (
    <div className='space-y-6'>
      <div className='rounded-2xl border border-green-200 bg-green-50 p-8 text-center dark:border-green-800 dark:bg-green-950/20'>
        <div className='mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/40'>
          <Check className='h-8 w-8 text-green-600 dark:text-green-400' />
        </div>
        <h2 className='text-xl font-bold text-green-800 dark:text-green-300'>
          Import Berhasil
        </h2>
        <p className='mt-2 text-sm text-green-700 dark:text-green-400'>
          Data akan muncul di dashboard dalam ~1 menit
        </p>
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
