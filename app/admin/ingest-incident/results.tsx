'use client';

import { useState } from 'react';
import type {
  BulkIncidentReport,
  IncidentJobStatus,
} from '@/lib/ingestion/incident-input';
import styles from './ingestion.module.css';

export const focusStyle =
  'focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-700 dark:focus-visible:outline-blue-300';
export const secondaryButton = `min-h-11 rounded-lg border border-slate-500 px-4 py-2 text-sm font-semibold text-(--text-primary) hover:bg-(--surface-2) dark:border-slate-400 disabled:cursor-not-allowed disabled:bg-(--surface-2) ${focusStyle}`;

function stateLabel(item: IncidentJobStatus) {
  if (item.terminal) return item.success ? 'Berhasil' : 'Gagal';
  if (item.state === 'active') return 'Sedang diproses';
  if (item.state === 'delayed') return 'Menunggu percobaan ulang';
  if (item.state === 'pending_enqueue') return 'Belum masuk antrean';
  return 'Dalam antrean';
}

export function IncidentResults({
  report,
  busy,
  onRetry,
  onReset,
}: {
  report: BulkIncidentReport;
  busy: boolean;
  onRetry: () => void;
  onReset: () => void;
}) {
  const [filter, setFilter] = useState('all');
  const items = report.items.filter(
    (item) =>
      filter === 'all' ||
      (filter === 'pending' && !item.terminal) ||
      (filter === 'failed' && item.terminal && !item.success) ||
      (filter === 'success' && item.success),
  );
  return (
    <section
      aria-labelledby='results-heading'
      className='space-y-5 border-t border-(--border) pt-8'
    >
      <div>
        <h2
          id='results-heading'
          className='font-outfit text-xl font-bold text-(--text-primary)'
        >
          Hasil penarikan
        </h2>
        <p role='status' className='mt-2 text-sm text-(--text-secondary)'>
          {report.completed} dari {report.total} incident selesai.{' '}
          {report.succeeded} berhasil, {report.failed} gagal.
        </p>
        <progress
          aria-label='Incident selesai'
          value={report.completed}
          max={report.total || 1}
          className={`mt-3 ${styles.progress}`}
        />
        <p className='mt-2 text-sm text-(--text-secondary)'>
          {report.terminal
            ? 'Semua incident sudah selesai diperiksa.'
            : 'Pemrosesan berjalan bertahap. Status diperbarui setiap 5 detik saat halaman aktif.'}
        </p>
      </div>
      <div className='flex flex-wrap items-end justify-between gap-4'>
        <div>
          <label
            htmlFor='result-filter'
            className='mb-1 block text-sm font-medium text-(--text-primary)'
          >
            Tampilkan
          </label>
          <select
            id='result-filter'
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            className={`min-h-11 max-w-full rounded-lg border border-slate-500 bg-(--surface) px-3 text-base text-(--text-primary) dark:border-slate-400 ${focusStyle}`}
          >
            <option value='all'>Semua incident</option>
            <option value='pending'>Belum selesai</option>
            <option value='failed'>Gagal</option>
            <option value='success'>Berhasil</option>
          </select>
        </div>
        {report.terminal && (
          <div className='flex flex-wrap gap-3'>
            {report.failed > 0 && (
              <button
                type='button'
                disabled={busy}
                onClick={onRetry}
                className={secondaryButton}
              >
                Coba ulang {report.failed} yang gagal
              </button>
            )}
            <button
              type='button'
              disabled={busy}
              onClick={onReset}
              className={secondaryButton}
            >
              Daftar baru
            </button>
          </div>
        )}
      </div>
      <ul
        aria-label='Hasil per incident'
        className='divide-y divide-(--border)'
      >
        {items.map((item) => (
          <li
            key={item.incident}
            className='grid min-w-0 gap-2 py-4 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] md:gap-6'
          >
            <div className='min-w-0'>
              <h3 className='text-base font-semibold break-all text-(--text-primary)'>
                {item.incident}
              </h3>
              <p
                className={`mt-1 text-sm font-medium ${item.terminal ? (item.success ? 'text-emerald-800 dark:text-emerald-300' : 'text-red-800 dark:text-red-300') : 'text-(--text-secondary)'}`}
              >
                {stateLabel(item)}
              </p>
            </div>
            <p className='min-w-0 text-sm leading-relaxed wrap-anywhere text-(--text-secondary)'>
              {item.message}
            </p>
          </li>
        ))}
      </ul>
      {!items.length && (
        <p className='py-4 text-sm text-(--text-secondary)'>
          Tidak ada incident pada filter ini.
        </p>
      )}
    </section>
  );
}
