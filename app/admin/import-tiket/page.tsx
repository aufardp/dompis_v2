'use client';

import { useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import {
  Upload,
  FileSpreadsheet,
  Download,
  Check,
  X,
  AlertTriangle,
  ArrowRight,
  ArrowLeft,
  Loader2,
  RotateCcw,
} from 'lucide-react';
import AdminLayout from '@/app/components/layout/AdminLayout';
import Button from '@/app/components/ui/Button';
import { fetchWithAuth } from '@/app/libs/fetcher';
import { TICKET_RAW_FIELDS } from '@/app/libs/ticket-raw-columns';
import {
  TICKET_IMPORT_TEMPLATE_HEADERS,
  TICKET_IMPORT_TEMPLATE_REQUIRED_HEADERS,
} from '@/app/libs/ticket-import-template';

type Step = 'upload' | 'result';

interface PreviewData {
  total_rows: number;
  valid_rows: number;
  invalid_rows: number;
  errors: { row: number; field: string; message: string }[];
  headers: string[];
  auto_mapping: Record<string, string | null>;
  sample: Record<string, any>[];
  missing_required: { key: string; label: string }[];
}

interface ImportResult {
  inserted: number;
  updated: number;
  skipped: number;
  failed: number;
  errors: string[];
  import_batch: string;
}

export default function ImportTiketPage() {
  const [step, setStep] = useState<Step>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [mapping, setMapping] = useState<Record<string, string | null>>({});
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState('');
  const [mappingCollapsed, setMappingCollapsed] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const truncatePreviewCell = useCallback((value: unknown, max = 160) => {
    const text = String(value ?? '').trim();
    if (!text) return '-';
    if (text.length <= max) return text;
    return `${text.slice(0, max - 1)}…`;
  }, []);

  const handleFileSelect = useCallback(async (selectedFile: File | null) => {
    if (!selectedFile) return;
    const ext = selectedFile.name.split('.').pop()?.toLowerCase();
    if (!['xlsx', 'xls', 'csv'].includes(ext ?? '')) {
      setError('Format file harus .xlsx, .xls, atau .csv');
      return;
    }

    setFile(selectedFile);
    setError('');
    setLoading(true);
    setPreview(null);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      const res = await fetchWithAuth('/api/import-tiket/preview', {
        method: 'POST',
        body: formData,
      });

      if (!res) throw new Error('Gagal terhubung ke server');
      const json = await res.json();
      if (!json.success) throw new Error(json.message);

      setPreview(json.data);
      setMapping(json.data.auto_mapping);
      setMappingCollapsed(true);
    } catch (e: any) {
      setError(e.message || 'Gagal preview file');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const droppedFile = e.dataTransfer.files[0];
      handleFileSelect(droppedFile);
    },
    [handleFileSelect],
  );

  const handleImport = useCallback(async () => {
    if (!file || !preview) return;
    setImporting(true);
    setError('');

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('mapping', JSON.stringify(mapping));

      const res = await fetchWithAuth('/api/import-tiket/run', {
        method: 'POST',
        body: formData,
      });

      if (!res) throw new Error('Gagal terhubung ke server');
      const json = await res.json();
      if (!json.success) throw new Error(json.message);

      setResult(json.data);
      setStep('result');
    } catch (e: any) {
      setError(e.message || 'Gagal import file');
    } finally {
      setImporting(false);
    }
  }, [file, preview, mapping]);

  const handleDownloadTemplate = useCallback(async () => {
    const XLSX = await import('xlsx');
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet([
      [...TICKET_IMPORT_TEMPLATE_HEADERS],
      TICKET_IMPORT_TEMPLATE_HEADERS.map((header) =>
        TICKET_IMPORT_TEMPLATE_REQUIRED_HEADERS.includes(
          header as (typeof TICKET_IMPORT_TEMPLATE_REQUIRED_HEADERS)[number],
        )
          ? 'WAJIB'
          : '',
      ),
    ]);

    XLSX.utils.book_append_sheet(workbook, worksheet, 'Template');
    worksheet['!cols'] = TICKET_IMPORT_TEMPLATE_HEADERS.map(() => ({
      wch: 22,
    }));

    const buffer = XLSX.write(workbook, {
      type: 'array',
      bookType: 'xlsx',
    }) as ArrayBuffer;
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'template_import_tiket_raw.xlsx';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }, []);

  const handleReset = useCallback(() => {
    setStep('upload');
    setFile(null);
    setPreview(null);
    setMapping({});
    setResult(null);
    setError('');
    setMappingCollapsed(true);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const updateMapping = useCallback(
    (header: string, fieldKey: string | null) => {
      setMapping((prev) => {
        const next = { ...prev };

        const oldField = Object.entries(next).find(
          ([, v]) => v === fieldKey,
        )?.[0];
        if (oldField && oldField !== header) {
          next[oldField] = null;
        }

        next[header] = fieldKey;
        return next;
      });
    },
    [],
  );

  const unusedFields = TICKET_RAW_FIELDS.filter(
    (f) => !Object.values(mapping).includes(f.key),
  );

  const mappedCount = Object.values(mapping).filter(Boolean).length;

  return (
    <AdminLayout>
      <div className='mx-auto max-w-5xl space-y-6 p-4 sm:p-6'>
        <div className='overflow-hidden rounded-3xl border border-(--border) bg-(--surface) shadow-sm'>
          <div className='flex flex-col gap-5 border-b border-(--border) bg-(--surface-2) px-5 py-5 md:px-6 lg:flex-row lg:items-end lg:justify-between'>
            <div className='max-w-3xl space-y-3'>
              <div className='flex flex-wrap items-center gap-2'>
                <span className='rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-1 text-[10px] font-bold tracking-[0.18em] text-blue-500 uppercase'>
                  Import Tiket
                </span>
                <span className='rounded-full border border-(--border) bg-(--surface) px-3 py-1 text-[10px] font-semibold tracking-[0.16em] text-(--text-muted) uppercase'>
                  Wizard
                </span>
              </div>
              <div>
                <h1 className='text-2xl font-bold tracking-[-0.3px] text-(--text-primary) md:text-4xl'>
                  Import data tiket
                </h1>
                <p className='mt-2 max-w-2xl text-sm leading-6 text-(--text-secondary)'>
                  Upload file Excel/CSV, preview mapping, validate columns, lalu
                  jalankan import ke ticket_raw dan projection.
                </p>
              </div>
            </div>
            <Link
              href='/admin'
              className='inline-flex items-center rounded-full border border-(--border) bg-(--surface) px-4 py-2 text-sm font-semibold text-(--text-secondary) transition hover:border-blue-400/30 hover:text-blue-500'
            >
              ← Kembali ke Dashboard
            </Link>
          </div>

          <div className='grid gap-3 px-5 py-4 sm:grid-cols-3 md:px-6'>
            <div className='rounded-2xl border border-(--border) bg-(--bg) px-4 py-3'>
              <p className='text-[10px] font-bold tracking-[0.18em] text-(--text-muted) uppercase'>
                Step 1
              </p>
              <p className='mt-1 text-sm font-semibold text-(--text-primary)'>
                Template
              </p>
            </div>
            <div className='rounded-2xl border border-(--border) bg-(--bg) px-4 py-3'>
              <p className='text-[10px] font-bold tracking-[0.18em] text-(--text-muted) uppercase'>
                Step 2
              </p>
              <p className='mt-1 text-sm font-semibold text-(--text-primary)'>
                Preview & Mapping
              </p>
            </div>
            <div className='rounded-2xl border border-(--border) bg-(--bg) px-4 py-3'>
              <p className='text-[10px] font-bold tracking-[0.18em] text-(--text-muted) uppercase'>
                Step 3
              </p>
              <p className='mt-1 text-sm font-semibold text-(--text-primary)'>
                Validate & Import
              </p>
            </div>
          </div>
        </div>

        <div className='overflow-hidden rounded-3xl border border-(--border) bg-(--surface) shadow-sm'>
          <div className='border-b border-(--border) bg-(--surface-2) px-5 py-4 md:px-6'>
            <div className='flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between'>
              <div className='space-y-2'>
                <p className='text-[10px] font-bold tracking-[0.18em] text-(--text-muted) uppercase'>
                  Template Excel final
                </p>
                <h2 className='text-lg font-semibold text-(--text-primary)'>
                  Unduh header resmi agar file langsung terbaca
                </h2>
                <p className='max-w-2xl text-sm leading-6 text-(--text-secondary)'>
                  Template mengikuti kolom `ticket_raw`. Pastikan empat field
                  wajib terisi: `INCIDENT`, `STATUS`, `REPORTED DATE`, dan
                  `WORKZONE`.
                </p>
              </div>
              <Button
                onClick={handleDownloadTemplate}
                variant='outline'
                className='shrink-0'
              >
                <Download className='h-4 w-4' />
                Download Template Excel
              </Button>
            </div>
            <div className='mt-4 flex flex-wrap gap-2'>
              {TICKET_IMPORT_TEMPLATE_REQUIRED_HEADERS.map((header) => (
                <span
                  key={header}
                  className='rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-1 text-xs font-medium text-blue-600 dark:text-blue-300'
                >
                  {header}
                </span>
              ))}
              <span className='rounded-full border border-(--border) bg-(--bg) px-3 py-1 text-xs font-medium text-(--text-secondary)'>
                {TICKET_IMPORT_TEMPLATE_HEADERS.length} kolom total
              </span>
            </div>
          </div>
        </div>

        {step === 'upload' && (
          <>
            <div
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              className='flex cursor-pointer flex-col items-center justify-center rounded-3xl border-2 border-dashed border-(--border) bg-(--surface) p-12 transition-colors hover:border-blue-400/50 hover:bg-blue-500/5'
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type='file'
                accept='.xlsx,.xls,.csv'
                className='hidden'
                onChange={(e) => handleFileSelect(e.target.files?.[0] ?? null)}
              />
              <Upload className='mb-4 h-10 w-10 text-(--text-muted)' />
              <p className='text-sm font-medium text-(--text-secondary)'>
                Drop file Excel/CSV di sini
              </p>
              <p className='mt-1 text-xs text-(--text-muted)'>
                atau klik untuk memilih file
              </p>
              <p className='mt-4 text-xs text-(--text-muted)'>
                Format: .xlsx, .xls, .csv (maks 50MB)
              </p>
            </div>

            {error && (
              <div className='flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400'>
                <AlertTriangle className='mt-0.5 h-4 w-4 shrink-0' />
                <span>{error}</span>
              </div>
            )}

            {loading && (
              <div className='flex items-center justify-center gap-3 py-12 text-slate-500'>
                <Loader2 className='h-5 w-5 animate-spin' />
                <span className='text-sm'>Memproses file...</span>
              </div>
            )}

            {preview && !loading && (
              <>
                {(() => {
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
                            setMappingCollapsed((current) => !current)
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
                          <table className='w-full min-w-[1480px] table-fixed border-separate border-spacing-0 text-left text-xs'>
                            <colgroup>
                              <col className='w-14' />
                              <col className='w-40' />
                              <col className='w-28' />
                              <col className='w-[420px]' />
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
                                      className='px-3 py-3 align-top leading-5 break-words whitespace-normal text-slate-700 dark:text-slate-200'
                                    >
                                      {truncatePreviewCell(row[mapping[h] ?? h])}
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
                                <Loader2 className='mr-1.5 h-4 w-4 animate-spin' />
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
                })()}
              </>
            )}
          </>
        )}

        {step === 'result' && result && (
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
        )}
      </div>
    </AdminLayout>
  );
}
