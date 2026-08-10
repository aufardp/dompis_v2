'use client';

import { ArrowRight, X, AlertTriangle, RotateCcw, Upload } from 'lucide-react';
import Button from '@/app/components/ui/Button';
import { TICKET_RAW_FIELDS } from '@/app/libs/ticket-raw-columns';
import type { PreviewData } from './types';

interface ImportPreviewPanelProps {
  preview: PreviewData;
  mapping: Record<string, string | null>;
  mappedCount: number;
  importing: boolean;
  mappingCollapsed: boolean;
  setMappingCollapsed: (collapsed: boolean) => void;
  updateMapping: (header: string, fieldKey: string | null) => void;
  handleReset: () => void;
  handleImport: () => void;
  truncatePreviewCell: (value: unknown, max?: number) => string;
}

export default function ImportPreviewPanel({
  preview,
  mapping,
  mappedCount,
  importing,
  mappingCollapsed,
  setMappingCollapsed,
  updateMapping,
  handleReset,
  handleImport,
  truncatePreviewCell,
}: ImportPreviewPanelProps) {
  const previewColumns = preview.headers.slice(0, 12);

  return (
    <>
      <div className='grid grid-cols-2 gap-4 sm:grid-cols-4'>
        <div className='rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950'>
          <p className='text-2xl font-bold'>
            {preview.total_rows}
          </p>
          <p className='text-xs text-slate-500'>Total Baris</p>
        </div>
        <div className='rounded-2xl border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-950/20'>
          <p className='text-2xl font-bold text-green-700 dark:text-green-400'>
            {preview.valid_rows}
          </p>
          <p className='text-xs text-green-600 dark:text-green-500'>
            Valid
          </p>
        </div>
        <div className='rounded-2xl border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950/20'>
          <p className='text-2xl font-bold text-red-700 dark:text-red-400'>
            {preview.invalid_rows}
          </p>
          <p className='text-xs text-red-600 dark:text-red-500'>
            Gagal Validasi
          </p>
        </div>
        <div className='rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950'>
          <p className='text-2xl font-bold'>{mappedCount}</p>
          <p className='text-xs text-slate-500'>
            Kolom Ter Mapping
          </p>
        </div>
      </div>

      {preview.missing_required.length > 0 && (
        <div className='rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/20'>
          <p className='flex items-center gap-2 text-sm font-medium text-amber-800 dark:text-amber-400'>
            <AlertTriangle className='h-4 w-4' />
            Field wajib belum ter mapping
          </p>
          <p className='mt-1 text-xs text-amber-700 dark:text-amber-500'>
            {preview.missing_required
              .map((f) => f.label)
              .join(', ')}
          </p>
        </div>
      )}

      <div className='rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950'>
        <button
          type='button'
          onClick={() =>
            setMappingCollapsed(!mappingCollapsed)
          }
          className='flex w-full items-center justify-between gap-3 border-b border-slate-200 p-4 text-left transition-colors hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-900/50'
        >
          <div>
            <h2 className='text-sm font-semibold'>
              Mapping Kolom
            </h2>
            <p className='mt-1 text-xs text-slate-500 dark:text-slate-400'>
              {mappingCollapsed
                ? 'Klik untuk buka daftar mapping.'
                : 'Klik untuk menyembunyikan daftar mapping.'}
            </p>
          </div>
          <span className='rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[10px] font-semibold tracking-[0.16em] text-slate-600 uppercase dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'>
            {mappingCollapsed ? 'Expand' : 'Collapse'}
          </span>
        </button>
        {!mappingCollapsed && (
          <div className='divide-y divide-slate-100 dark:divide-slate-800'>
            {preview.headers.map((header) => {
              const mappedField = mapping[header];
              const fieldDef = TICKET_RAW_FIELDS.find(
                (f) => f.key === mappedField,
              );
              return (
                <div
                  key={header}
                  className='flex items-center gap-3 px-4 py-2.5'
                >
                  <span className='w-40 shrink-0 truncate text-sm font-medium text-slate-700 dark:text-slate-300'>
                    {header}
                  </span>
                  <ArrowRight className='h-3.5 w-3.5 shrink-0 text-slate-400' />
                  <select
                    value={mappedField ?? ''}
                    onChange={(e) =>
                      updateMapping(
                        header,
                        e.target.value || null,
                      )
                    }
                    className='block w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 dark:border-slate-700 dark:bg-slate-900 dark:focus:border-blue-600'
                  >
                    <option value=''>— Skip kolom ini —</option>
                    {TICKET_RAW_FIELDS.map((f) => {
                      const alreadyUsed =
                        Object.values(mapping).includes(
                          f.key,
                        ) && mapping[header] !== f.key;
                      return (
                        <option
                          key={f.key}
                          value={f.key}
                          disabled={alreadyUsed}
                        >
                          {f.label}
                          {f.required ? ' *' : ''}
                        </option>
                      );
                    })}
                  </select>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {preview.errors.length > 0 && (
        <div className='rounded-2xl border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950/20'>
          <p className='mb-2 flex items-center gap-2 text-sm font-medium text-red-800 dark:text-red-400'>
            <X className='h-4 w-4' />
            {preview.invalid_rows} baris gagal validasi
          </p>
          <div className='max-h-32 space-y-1 overflow-y-auto'>
            {preview.errors.slice(0, 10).map((err, i) => (
              <p
                key={i}
                className='text-xs text-red-700 dark:text-red-500'
              >
                Baris {err.row}: {err.message}
              </p>
            ))}
          </div>
        </div>
      )}

      <div className='rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950'>
        <div className='border-b border-slate-200 p-4 dark:border-slate-800'>
          <h2 className='text-sm font-semibold'>
            Preview (20 baris pertama)
          </h2>
          <p className='mt-1 text-xs text-slate-500 dark:text-slate-400'>
            Fokus ke 12 kolom inti. Baris yang panjang akan
            membungkus teks agar tetap terbaca tanpa merapat.
          </p>
        </div>
        <div className='overflow-x-auto bg-slate-50/40 dark:bg-slate-950/40'>
          <table className='w-full min-w-370 table-fixed border-separate border-spacing-0 text-left text-xs'>
            <colgroup>
              <col className='w-14' />
              <col className='w-40' />
              <col className='w-28' />
              <col className='w-105' />
              <col className='w-36' />
              <col className='w-40' />
              <col className='w-32' />
              <col className='w-32' />
              <col className='w-36' />
              <col className='w-32' />
              <col className='w-28' />
              <col className='w-28' />
              <col className='w-36' />
            </colgroup>
            <thead>
              <tr className='border-b border-slate-100 dark:border-slate-800'>
                <th className='sticky left-0 z-10 border-b border-slate-100 bg-white px-3 py-3 font-semibold text-slate-500 shadow-[1px_0_0_0_rgba(148,163,184,0.18)] dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300'>
                  #
                </th>
                {previewColumns.map((h) => (
                  <th
                    key={h}
                    className='border-b border-slate-100 px-3 py-3 align-top font-semibold text-slate-500 dark:border-slate-800 dark:text-slate-300'
                  >
                    {mapping[h] ?? h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className='divide-y divide-slate-100 dark:divide-slate-800'>
              {preview.sample.map((row, i) => (
                <tr
                  key={i}
                  className='transition-colors odd:bg-white even:bg-slate-50/60 hover:bg-slate-100/80 dark:odd:bg-slate-950 dark:even:bg-slate-900/60 dark:hover:bg-slate-900'
                >
                  <td className='sticky left-0 z-10 bg-white px-3 py-2 font-medium text-slate-400 shadow-[1px_0_0_0_rgba(148,163,184,0.12)] dark:bg-slate-950 dark:text-slate-500'>
                    {i + 1}
                  </td>
                  {previewColumns.map((h) => (
                    <td
                      key={h}
                      title={String(
                        row[mapping[h] ?? h] ?? '-',
                      )}
                      className='px-3 py-3 align-top leading-5 wrap-break-word whitespace-normal text-slate-700 dark:text-slate-200'
                    >
                      {truncatePreviewCell(
                        row[mapping[h] ?? h],
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className='border-t border-slate-200 px-4 py-3 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400'>
          Tampilkan 12 kolom pertama. Geser horizontal untuk
          melihat kolom lain yang panjang.
        </div>
      </div>

      {preview.missing_required.length === 0 && (
        <div className='flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 p-4 shadow-sm sm:flex-row sm:items-center sm:justify-end dark:border-slate-800 dark:bg-slate-900/70'>
          <Button
            variant='outline'
            onClick={handleReset}
            className='min-w-32'
          >
            <RotateCcw className='mr-1.5 h-3.5 w-3.5' />
            Reset
          </Button>
          <Button
            onClick={handleImport}
            disabled={importing}
            className='shadow-brand-500/20 dark:shadow-brand-950/40 min-w-44 shadow-sm'
          >
            {importing ? (
              <>
                <span className='mr-1.5 inline-block h-4 w-4 rounded-full border-2 border-current border-t-transparent opacity-70' />
                Mengimport...
              </>
            ) : (
              <>
                <Upload className='mr-1.5 h-4 w-4' />
                Import {preview.valid_rows} Tiket
              </>
            )}
          </Button>
        </div>
      )}
    </>
  );
}
