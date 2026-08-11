'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Upload,
  Map,
  Check,
  X,
  AlertTriangle,
  ArrowRight,
  ArrowLeft,
  RotateCcw,
  Layers,
  MapPin,
  Cable,
} from 'lucide-react';
import AdminLayout from '@/app/components/layout/AdminLayout';
import Button from '@/app/components/ui/Button';
import { fetchWithAuth } from '@/app/libs/fetcher';
import { useCurrentUser } from '@/app/hooks/useCurrentUser';
import type { KmlPreviewData, KmlImportResult } from './types';

type Step = 'upload' | 'preview' | 'result';

const MAX_FILE_SIZE = 20 * 1024 * 1024;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function formatCoord(value: number | null): string {
  if (value === null) return '-';
  return value.toFixed(6);
}

export default function ImportKmlPage() {
  const { user } = useCurrentUser();
  const canManage =
    user?.role_key === 'admin' ||
    user?.role_key === 'superadmin' ||
    user?.role_key === 'super_admin';

  const [step, setStep] = useState<Step>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<KmlPreviewData | null>(null);
  const [title, setTitle] = useState('');
  const [workzoneTag, setWorkzoneTag] = useState('');
  const [sublayerVisibility, setSublayerVisibility] = useState<
    Record<string, boolean>
  >({});
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<KmlImportResult | null>(null);
  const [error, setError] = useState('');
  const [workzoneOptions, setWorkzoneOptions] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetchWithAuth(
          '/api/war-map/kml-layers/workzones',
        );
        const json = res ? await res.json() : null;
        if (!cancelled && json?.success) {
          setWorkzoneOptions(json.data ?? []);
        }
      } catch {
        // datalist opsional — abaikan error
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleFileSelect = useCallback(async (selectedFile: File | null) => {
    if (!selectedFile) return;
    const ext = selectedFile.name.split('.').pop()?.toLowerCase();
    if (ext !== 'kml') {
      setError('Format file harus .kml');
      return;
    }
    if (selectedFile.size > MAX_FILE_SIZE) {
      setError('File terlalu besar (maks 20MB)');
      return;
    }

    setFile(selectedFile);
    setError('');
    setLoading(true);
    setPreview(null);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      const res = await fetchWithAuth('/api/war-map/kml-layers/preview', {
        method: 'POST',
        body: formData,
      });
      if (!res) throw new Error('Gagal terhubung ke server');
      const json = await res.json();
      if (!json.success) throw new Error(json.message);

      setPreview(json.data);
      setTitle(json.data.title || selectedFile.name);
      const vis: Record<string, boolean> = {};
      for (const s of json.data.sublayers) {
        vis[s.folder_path] = true;
      }
      setSublayerVisibility(vis);
      setStep('preview');
    } catch (e: any) {
      setError(e.message || 'Gagal preview file KML');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      handleFileSelect(e.dataTransfer.files[0]);
    },
    [handleFileSelect],
  );

  const toggleSublayer = useCallback((folderPath: string) => {
    setSublayerVisibility((prev) => ({
      ...prev,
      [folderPath]: !(prev[folderPath] ?? true),
    }));
  }, []);

  const handleImport = useCallback(async () => {
    if (!file || !preview) return;
    if (!workzoneTag.trim()) {
      setError('Workzone wajib diisi');
      return;
    }
    setImporting(true);
    setError('');

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('title', title);
      formData.append('workzone_tag', workzoneTag);
      formData.append(
        'sublayer_visibility',
        JSON.stringify(sublayerVisibility),
      );

      const res = await fetchWithAuth('/api/war-map/kml-layers/run', {
        method: 'POST',
        body: formData,
      });
      if (!res) throw new Error('Gagal terhubung ke server');
      const json = await res.json();
      if (!json.success) throw new Error(json.message);

      setResult(json.data);
      setStep('result');
    } catch (e: any) {
      setError(e.message || 'Gagal import file KML');
    } finally {
      setImporting(false);
    }
  }, [file, preview, title, workzoneTag, sublayerVisibility]);

  const handleReset = useCallback(() => {
    setStep('upload');
    setFile(null);
    setPreview(null);
    setTitle('');
    setWorkzoneTag('');
    setSublayerVisibility({});
    setResult(null);
    setError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const visibleCount = Object.values(sublayerVisibility).filter(Boolean).length;
  const totalFeatures = preview?.total_parsed ?? 0;

  return (
    <AdminLayout>
      <div className='mx-auto max-w-5xl space-y-6 p-4 sm:p-6'>
        <div className='overflow-hidden rounded-3xl border border-(--border) bg-(--surface) shadow-sm'>
          <div className='flex flex-col gap-4 border-b border-(--border) bg-(--surface-2) px-5 py-4 md:px-6 lg:flex-row lg:items-start lg:justify-between'>
            <div className='max-w-3xl space-y-3'>
              <div className='flex flex-wrap items-center gap-2'>
                <span className='rounded-full border border-indigo-500/20 bg-indigo-500/10 px-3 py-1 text-[10px] font-bold tracking-[0.18em] text-indigo-500 uppercase'>
                  Import KML
                </span>
                <span className='rounded-full border border-(--border) bg-(--surface) px-3 py-1 text-[10px] font-semibold tracking-[0.16em] text-(--text-muted) uppercase'>
                  Wizard
                </span>
              </div>
              <div>
                <h1 className='text-2xl font-bold tracking-[-0.3px] text-(--text-primary) md:text-4xl'>
                  Import skema KML
                </h1>
                <p className='mt-2 max-w-2xl text-sm leading-6 text-(--text-secondary)'>
                  Upload file KML topologi jaringan (ODC/ODP/kabel distribusi),
                  preview struktur, lalu tambahkan sebagai skema overlay di War
                  Map.
                </p>
              </div>
            </div>
            <div className='flex flex-col items-end gap-2 lg:pt-1'>
              <Link
                href='/admin'
                className='inline-flex items-center rounded-full border border-(--border) bg-(--surface) px-4 py-2 text-sm font-semibold text-(--text-secondary) transition hover:border-blue-400/30 hover:text-blue-500'
              >
                ← Kembali ke Dashboard
              </Link>
            </div>
          </div>

          <div className='grid gap-3 px-5 py-2.5 sm:grid-cols-3 md:px-6'>
            <div className='rounded-2xl border border-(--border) bg-(--bg) px-4 py-2.5'>
              <p className='text-[10px] font-bold tracking-[0.18em] text-(--text-muted) uppercase'>
                Step 1
              </p>
              <p className='mt-1 text-sm font-semibold text-(--text-primary)'>
                Upload
              </p>
            </div>
            <div className='rounded-2xl border border-(--border) bg-(--bg) px-4 py-2.5'>
              <p className='text-[10px] font-bold tracking-[0.18em] text-(--text-muted) uppercase'>
                Step 2
              </p>
              <p className='mt-1 text-sm font-semibold text-(--text-primary)'>
                Preview & Konfigurasi
              </p>
            </div>
            <div className='rounded-2xl border border-(--border) bg-(--bg) px-4 py-2.5'>
              <p className='text-[10px] font-bold tracking-[0.18em] text-(--text-muted) uppercase'>
                Step 3
              </p>
              <p className='mt-1 text-sm font-semibold text-(--text-primary)'>
                Hasil
              </p>
            </div>
          </div>
        </div>

        {!canManage ? (
          <div className='rounded-2xl border border-(--border) bg-(--surface) px-6 py-10 text-center'>
            <p className='text-sm font-semibold text-(--text-primary)'>
              Akses dibatasi
            </p>
            <p className='mt-1 text-xs text-(--text-secondary)'>
              Halaman ini khusus admin/superadmin. Anda dapat melihat skema KML
              yang sudah diimpor di War Map.
            </p>
          </div>
        ) : (
          step === 'upload' && (
            <>
              <div
                onDrop={handleDrop}
                onDragOver={(e) => e.preventDefault()}
                className='flex cursor-pointer flex-col items-center justify-center rounded-3xl border-2 border-dashed border-(--border) bg-(--surface) p-12 transition-colors hover:border-indigo-400/50 hover:bg-indigo-500/5'
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type='file'
                  accept='.kml'
                  className='hidden'
                  onChange={(e) =>
                    handleFileSelect(e.target.files?.[0] ?? null)
                  }
                />
                <Map className='mb-4 h-10 w-10 text-(--text-muted)' />
                <p className='text-sm font-medium text-(--text-secondary)'>
                  Tarik file .kml ke sini atau klik untuk pilih file
                </p>
                <p className='mt-1 text-xs text-(--text-muted)'>
                  File hasil export Google Earth / GIS Anda
                </p>
                <p className='mt-4 text-xs text-(--text-muted)'>
                  Format: .kml (maks 20MB)
                </p>
              </div>

              {error && (
                <div className='flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400'>
                  <AlertTriangle className='mt-0.5 h-4 w-4 shrink-0' />
                  <span>{error}</span>
                </div>
              )}

              {loading && (
                <div className='flex items-center justify-center gap-3 rounded-2xl border border-(--border) bg-(--surface) p-10 text-sm text-(--text-secondary)'>
                  <span className='h-4 w-4 animate-spin rounded-full border-2 border-indigo-300 border-t-indigo-600' />
                  Menganalisis struktur file KML...
                </div>
              )}
            </>
          )
        )}

        {step === 'preview' && preview && (
          <>
            <div className='grid grid-cols-2 gap-4 sm:grid-cols-4'>
              <div className='rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950'>
                <p className='text-2xl font-bold'>{preview.total_parsed}</p>
                <p className='text-xs text-slate-500'>Fitur Valid</p>
              </div>
              <div className='rounded-2xl border border-indigo-200 bg-indigo-50 p-4 dark:border-indigo-800 dark:bg-indigo-950/20'>
                <p className='text-2xl font-bold text-indigo-700 dark:text-indigo-400'>
                  {preview.sublayers
                    .filter((s) => s.geometry_kind === 'point')
                    .reduce((a, s) => a + s.feature_count, 0)}
                </p>
                <p className='text-xs text-indigo-600 dark:text-indigo-500'>
                  Titik (ODC/ODP)
                </p>
              </div>
              <div className='rounded-2xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-800 dark:bg-emerald-950/20'>
                <p className='text-2xl font-bold text-emerald-700 dark:text-emerald-400'>
                  {preview.sublayers
                    .filter((s) => s.geometry_kind === 'line')
                    .reduce((a, s) => a + s.feature_count, 0)}
                </p>
                <p className='text-xs text-emerald-600 dark:text-emerald-500'>
                  Kabel (Line)
                </p>
              </div>
              <div className='rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950'>
                <p className='text-2xl font-bold'>
                  {formatBytes(preview.file_size_bytes)}
                </p>
                <p className='text-xs text-slate-500'>Ukuran File</p>
              </div>
            </div>

            <div className='rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950'>
              <h2 className='text-sm font-semibold'>Konfigurasi Skema</h2>
              <div className='mt-3 grid gap-3 sm:grid-cols-2'>
                <label className='block'>
                  <span className='mb-1 block text-[11px] font-bold tracking-wide text-slate-500 uppercase'>
                    Judul Skema
                  </span>
                  <input
                    type='text'
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    maxLength={150}
                    className='block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-900'
                  />
                </label>
                <label className='block'>
                  <span className='mb-1 block text-[11px] font-bold tracking-wide text-slate-500 uppercase'>
                    Workzone <span className='text-red-500'>*</span>
                  </span>
                  <input
                    type='text'
                    value={workzoneTag}
                    onChange={(e) =>
                      setWorkzoneTag(e.target.value.toUpperCase())
                    }
                    maxLength={100}
                    placeholder='mis. RKT'
                    list='kml-workzone-options'
                    className='block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm uppercase outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-900'
                  />
                  <datalist id='kml-workzone-options'>
                    {workzoneOptions.map((w) => (
                      <option key={w} value={w} />
                    ))}
                  </datalist>
                  <span className='mt-1 block text-[11px] text-slate-500'>
                    Wajib — skema hanya terlihat oleh user dengan workzone ini.
                  </span>
                </label>
              </div>
              {preview.bbox && (
                <p className='mt-3 text-[11px] text-slate-500'>
                  Cakupan: {formatCoord(preview.bbox.south)}°S{' '}
                  {formatCoord(preview.bbox.west)}°E —{' '}
                  {formatCoord(preview.bbox.north)}°S{' '}
                  {formatCoord(preview.bbox.east)}°E
                </p>
              )}
            </div>

            <div className='rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950'>
              <div className='border-b border-slate-200 p-4 dark:border-slate-800'>
                <h2 className='text-sm font-semibold'>Sub-skema terdeteksi</h2>
                <p className='mt-1 text-xs text-slate-500 dark:text-slate-400'>
                  Atur sub-skema mana yang tampil secara default di War Map.
                  {visibleCount}/{preview.sublayers.length} aktif
                </p>
              </div>
              <div className='divide-y divide-slate-100 dark:divide-slate-800'>
                {preview.sublayers.map((s) => (
                  <div
                    key={s.folder_path}
                    className='flex items-center gap-3 px-4 py-3'
                  >
                    <button
                      type='button'
                      onClick={() => toggleSublayer(s.folder_path)}
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors ${
                        sublayerVisibility[s.folder_path] !== false
                          ? 'border-indigo-500 bg-indigo-500 text-white'
                          : 'border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-900'
                      }`}
                      aria-label={`Toggle ${s.folder_path}`}
                    >
                      {sublayerVisibility[s.folder_path] !== false && (
                        <Check className='h-3.5 w-3.5' />
                      )}
                    </button>
                    <div className='flex min-w-0 flex-1 items-center gap-2'>
                      {s.geometry_kind === 'point' ? (
                        <MapPin className='h-4 w-4 shrink-0 text-indigo-500' />
                      ) : (
                        <Cable className='h-4 w-4 shrink-0 text-emerald-500' />
                      )}
                      <span className='truncate text-sm font-semibold text-slate-700 dark:text-slate-200'>
                        {s.folder_path}
                      </span>
                      <span className='shrink-0 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-500 uppercase dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400'>
                        {s.geometry_kind === 'point' ? 'Point' : 'Line'} ·{' '}
                        {s.feature_count} fitur
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {preview.warnings.length > 0 && (
              <div className='rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/20'>
                <p className='mb-1 flex items-center gap-2 text-sm font-medium text-amber-800 dark:text-amber-400'>
                  <AlertTriangle className='h-4 w-4' />
                  {preview.total_skipped} placemark dilewati
                </p>
                <div className='max-h-32 space-y-1 overflow-y-auto'>
                  {preview.warnings.slice(0, 8).map((w, i) => (
                    <p
                      key={i}
                      className='text-xs text-amber-700 dark:text-amber-500'
                    >
                      {w}
                    </p>
                  ))}
                </div>
              </div>
            )}

            {error && (
              <div className='flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400'>
                <AlertTriangle className='mt-0.5 h-4 w-4 shrink-0' />
                <span>{error}</span>
              </div>
            )}

            <div className='flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between dark:border-slate-800 dark:bg-slate-900/70'>
              <button
                type='button'
                onClick={() => setStep('upload')}
                className='inline-flex items-center gap-2 rounded-xl border border-(--border) bg-(--surface) px-4 py-2 text-sm font-semibold text-(--text-secondary) transition hover:border-indigo-400/30'
              >
                <ArrowLeft className='h-4 w-4' />
                Kembali
              </button>
              <div className='flex gap-3'>
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
                  disabled={
                    importing || totalFeatures === 0 || !workzoneTag.trim()
                  }
                  className='shadow-brand-500/20 min-w-44 shadow-sm'
                >
                  {importing ? (
                    <>
                      <span className='mr-1.5 inline-block h-4 w-4 rounded-full border-2 border-current border-t-transparent opacity-70' />
                      Mengimport...
                    </>
                  ) : (
                    <>
                      <Upload className='mr-1.5 h-4 w-4' />
                      Import {totalFeatures} Fitur
                    </>
                  )}
                </Button>
              </div>
            </div>
          </>
        )}

        {step === 'result' && result && (
          <div className='rounded-3xl border border-(--border) bg-(--surface) p-6 shadow-sm'>
            <div className='flex items-start gap-4'>
              <div className='grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-600'>
                <Layers className='h-6 w-6' />
              </div>
              <div>
                <h2 className='text-lg font-bold text-(--text-primary)'>
                  Skema KML berhasil diimpor
                </h2>
                <p className='mt-1 text-sm text-(--text-secondary)'>
                  "{result.title}" — {result.feature_count} fitur dalam{' '}
                  {result.sublayer_count} sub-skema ({result.point_count} titik,{' '}
                  {result.line_count} kabel).
                </p>
              </div>
            </div>

            {result.warnings.length > 0 && (
              <div className='mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/20'>
                <p className='text-xs font-medium text-amber-800 dark:text-amber-400'>
                  {result.warnings.length} peringatan:
                </p>
                <div className='mt-1 max-h-24 space-y-1 overflow-y-auto'>
                  {result.warnings.slice(0, 5).map((w, i) => (
                    <p
                      key={i}
                      className='text-xs text-amber-700 dark:text-amber-500'
                    >
                      {w}
                    </p>
                  ))}
                </div>
              </div>
            )}

            <div className='mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end'>
              <Button variant='outline' onClick={handleReset}>
                Import File Lain
              </Button>
              <Link href='/admin/tools/war-map'>
                <Button className='shadow-brand-500/20 w-full shadow-sm'>
                  Lihat di War Map
                  <ArrowRight className='ml-1.5 h-4 w-4' />
                </Button>
              </Link>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
