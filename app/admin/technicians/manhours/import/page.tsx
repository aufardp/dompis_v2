'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import { format, subMonths, startOfMonth } from 'date-fns';
import Link from 'next/link';
import {
  Upload,
  FileSpreadsheet,
  Check,
  X,
  AlertTriangle,
  ArrowRight,
  ArrowLeft,
  Loader2,
  BarChart3,
  RotateCcw,
} from 'lucide-react';
import AdminLayout from '@/app/components/layout/AdminLayout';
import Button from '@/app/components/ui/Button';
import { fetchWithAuth } from '@/app/libs/fetcher';
import { JENIS_LABELS, JenisKey } from '@/app/libs/tickets/jenis';

type Step = 1 | 2 | 3;

interface PreviewResponse {
  total_rows: number;
  unique_technicians: { name: string; count: number }[];
  sample: Record<string, string | null>[];
  tech_column_detected: string | null;
  headers: string[];
}

interface UniqueTeknisi {
  nameFromExcel: string;
  ticketCount: number;
  resolvedId: number | null;
  resolvedName: string | null;
  confidence: 'auto' | 'saved' | 'manual' | null;
}

interface TeknisiUser {
  id_user: number;
  nama: string | null;
  nik: string | null;
}

interface ImportResult {
  success: boolean;
  data?: {
    inserted: number;
    updated: number;
    skipped: number;
    failed: number;
    errors: string[];
    import_batch: string;
  };
  message?: string;
}

const JENIS_OPTIONS = Object.entries(JENIS_LABELS).map(([key, label]) => ({
  value: key,
  label,
}));

const STORAGE_KEY = 'dompis:teknisi_name_mapping_v1';

// ─── Utility: normalize nama teknisi ────────────────────────────────
function normalizeTeknisiName(raw: string): string {
  return raw
    .trim()
    .replace(/\s*\(GGN\)/gi, '')
    .replace(/\bGGN\b/gi, '')
    .replace(/\bSE\b/gi, '')
    .replace(/\bST\b/gi, '')
    .replace(/\bMITRA\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// ─── Smart Matching Berlapis ────────────────────────────────────────
function matchTeknisi(
  nameFromExcel: string,
  teknisiList: TeknisiUser[],
): { id_user: number; nama: string } | null {
  const excelNorm = normalizeTeknisiName(nameFromExcel);
  if (!excelNorm) return null;

  // Layer 1: Exact match setelah normalisasi
  for (const user of teknisiList) {
    const dbNorm = normalizeTeknisiName(user.nama ?? '');
    if (excelNorm === dbNorm) {
      return { id_user: user.id_user, nama: user.nama ?? '' };
    }
  }

  // Layer 2: Token match — semua kata dari Excel ada di nama DB
  const excelTokens = excelNorm.split(' ').filter((t) => t.length > 2);
  if (excelTokens.length > 0) {
    let bestMatch: { id_user: number; nama: string } | null = null;
    let bestScore = 0;

    for (const user of teknisiList) {
      const dbNorm = normalizeTeknisiName(user.nama ?? '');
      const matchedTokens = excelTokens.filter((t) => dbNorm.includes(t));
      const score = matchedTokens.length / excelTokens.length;

      if (score === 1.0 && score > bestScore) {
        bestScore = score;
        bestMatch = { id_user: user.id_user, nama: user.nama ?? '' };
      }
    }
    if (bestMatch) return bestMatch;
  }

  // Layer 3: DB name adalah subset dari Excel name
  for (const user of teknisiList) {
    const dbNorm = normalizeTeknisiName(user.nama ?? '');
    if (dbNorm.length > 3 && excelNorm.includes(dbNorm)) {
      return { id_user: user.id_user, nama: user.nama ?? '' };
    }
  }

  return null;
}

// ─── localStorage persistent mapping ────────────────────────────────
function saveMapping(entries: UniqueTeknisi[]) {
  const existing = loadMapping();
  const updated = { ...existing };
  for (const entry of entries) {
    if (entry.nameFromExcel && entry.resolvedId !== null) {
      updated[entry.nameFromExcel] = entry.resolvedId;
    }
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // localStorage penuh — silent fail
  }
}

function loadMapping(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
  } catch {
    return {};
  }
}

function clearMapping() {
  localStorage.removeItem(STORAGE_KEY);
}

// ─── Main Component ─────────────────────────────────────────────────
export default function ImportPage() {
  const [step, setStep] = useState<Step>(1);
  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [defaultJenis, setDefaultJenis] = useState<string>('reguler');
  const [onlyClosed, setOnlyClosed] = useState(true);
  const [syncDate, setSyncDate] = useState<string>(() => {
    const d = subMonths(new Date(), 1);
    return format(startOfMonth(d), 'yyyy-MM-dd');
  });
  const [importBatch, setImportBatch] = useState<string>(
    () => `IMPORT_EXCEL_${format(new Date(), 'yyyy-MM')}`,
  );

  const [previewData, setPreviewData] = useState<PreviewResponse | null>(null);
  const [uniqueNames, setUniqueNames] = useState<UniqueTeknisi[]>([]);
  const [teknisiList, setTeknisiList] = useState<TeknisiUser[]>([]);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingTeknisi, setLoadingTeknisi] = useState(false);

  // Fetch teknisi list on mount
  useEffect(() => {
    const fetchTeknisiList = async () => {
      setLoadingTeknisi(true);
      try {
        const res = await fetchWithAuth('/api/users/teknisi');
        if (res?.ok) {
          const json = await res.json();
          setTeknisiList(json.data || []);
        }
      } catch (err) {
        console.error('Failed to fetch teknisi:', err);
      } finally {
        setLoadingTeknisi(false);
      }
    };
    fetchTeknisiList();
  }, []);

  const savedMapping = useMemo(() => loadMapping(), []);
  const savedMappingCount = Object.keys(savedMapping).length;

  // ─── Step 1 → 2: Upload ke /preview endpoint ────────────────────
  const handlePreview = useCallback(async () => {
    if (!file || teknisiList.length === 0) return;
    setLoading(true);
    setImportResult(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetchWithAuth(
        '/api/technicians/manhours/import/preview',
        { method: 'POST', body: formData },
      );

      const json = await res?.json();
      if (json?.success) {
        setPreviewData(json.data);

        // Build uniqueNames dari data server + apply saved mapping + auto-match
        const saved = loadMapping();
        const names: UniqueTeknisi[] = json.data.unique_technicians.map(
          (item: { name: string; count: number }) => {
            // Cek localStorage dulu
            const savedId = saved[item.name];
            if (savedId) {
              const user = teknisiList.find((t) => t.id_user === savedId);
              if (user) {
                return {
                  nameFromExcel: item.name,
                  ticketCount: item.count,
                  resolvedId: savedId,
                  resolvedName: user.nama ?? null,
                  confidence: 'saved' as const,
                };
              }
            }
            // Auto-match
            const match = matchTeknisi(item.name, teknisiList);
            if (match) {
              return {
                nameFromExcel: item.name,
                ticketCount: item.count,
                resolvedId: match.id_user,
                resolvedName: match.nama,
                confidence: 'auto' as const,
              };
            }
            // No match
            return {
              nameFromExcel: item.name,
              ticketCount: item.count,
              resolvedId: null,
              resolvedName: null,
              confidence: null,
            };
          },
        );
        setUniqueNames(names);
        setStep(2);
      } else {
        setImportResult({
          success: false,
          message: json?.message || 'Gagal mempreview file',
        });
        setStep(3);
      }
    } catch (err) {
      setImportResult({
        success: false,
        message: err instanceof Error ? err.message : 'Gagal mempreview file',
      });
      setStep(3);
    }
    setLoading(false);
  }, [file, teknisiList]);

  // ─── Handle manual teknisi select for a unique name ──────────────
  const handleManualSelect = useCallback(
    (nameFromExcel: string, userId: number | null) => {
      setUniqueNames((prev) =>
        prev.map((entry) => {
          if (entry.nameFromExcel !== nameFromExcel) return entry;
          if (userId === null) {
            return {
              ...entry,
              resolvedId: null,
              resolvedName: null,
              confidence: null,
            };
          }
          const user = teknisiList.find((t) => t.id_user === userId);
          return {
            ...entry,
            resolvedId: userId,
            resolvedName: user?.nama ?? null,
            confidence: 'manual' as const,
          };
        }),
      );
    },
    [teknisiList],
  );

  // ─── Step 2 → 3: Submit import ──────────────────────────────────
  const handleImport = useCallback(async () => {
    if (!file) return;
    setImporting(true);

    // Simpan mapping ke localStorage sebelum import
    saveMapping(uniqueNames);

    const mappingObject: Record<string, number> = {};
    for (const u of uniqueNames) {
      if (u.resolvedId !== null) mappingObject[u.nameFromExcel] = u.resolvedId;
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('mapping', JSON.stringify(mappingObject));
    formData.append('default_jenis', defaultJenis);
    formData.append('sync_date', syncDate);
    formData.append('import_batch', importBatch);
    formData.append('only_closed', String(onlyClosed));

    try {
      const res = await fetchWithAuth('/api/technicians/manhours/import/run', {
        method: 'POST',
        body: formData,
      });

      const json = await res?.json();
      if (json?.success) {
        setImportResult(json);
        setStep(3);
      } else {
        setImportResult({
          success: false,
          message: json?.message || 'Gagal import data',
        });
        setStep(3);
      }
    } catch (err) {
      setImportResult({
        success: false,
        message: err instanceof Error ? err.message : 'Gagal import data',
      });
      setStep(3);
    }
    setImporting(false);
  }, [file, uniqueNames, defaultJenis, syncDate, importBatch, onlyClosed]);

  // ─── Computed stats ──────────────────────────────────────────────
  const stats = useMemo(() => {
    const resolved = uniqueNames.filter((u) => u.resolvedId !== null);
    const unresolved = uniqueNames.filter((u) => u.resolvedId === null);
    const readyCount = resolved.reduce((sum, u) => sum + u.ticketCount, 0);
    const unresolvedCount = unresolved.reduce(
      (sum, u) => sum + u.ticketCount,
      0,
    );
    return {
      resolvedCount: resolved.length,
      unresolvedNames: unresolved.length,
      readyCount,
      unresolvedCount,
      totalNames: uniqueNames.length,
      totalRows: previewData?.total_rows ?? 0,
    };
  }, [uniqueNames, previewData]);

  const syncDateValid = useMemo(() => {
    const inputDate = new Date(syncDate);
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    return inputDate <= today;
  }, [syncDate]);

  // ─── Reset all ───────────────────────────────────────────────────
  const handleReset = useCallback(() => {
    setStep(1);
    setFile(null);
    setFileName('');
    setPreviewData(null);
    setUniqueNames([]);
    setImportResult(null);
  }, []);

  // ─── Clear saved mapping ─────────────────────────────────────────
  const handleClearMapping = useCallback(() => {
    clearMapping();
    // Re-apply mapping reset to current uniqueNames
    setUniqueNames((prev) =>
      prev.map((entry) => {
        if (entry.confidence === 'saved') {
          // Re-attempt auto-match
          const match = matchTeknisi(entry.nameFromExcel, teknisiList);
          if (match) {
            return {
              ...entry,
              resolvedId: match.id_user,
              resolvedName: match.nama,
              confidence: 'auto' as const,
            };
          }
          return {
            ...entry,
            resolvedId: null,
            resolvedName: null,
            confidence: null,
          };
        }
        return entry;
      }),
    );
    // Force re-render by updating savedMappingCount workaround
    window.location.reload();
  }, [teknisiList]);

  return (
    <AdminLayout>
      <div className='mx-auto max-w-4xl space-y-6 p-6'>
        {/* Breadcrumb */}
        <div className='flex items-center gap-2 text-sm text-slate-500'>
          <Link
            href='/admin/technicians/manhours'
            className='hover:text-teal-600'
          >
            ManHours
          </Link>
          <span>/</span>
          <span className='text-slate-800 dark:text-slate-200'>
            Import Excel
          </span>
        </div>

        <div className='rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-800'>
          {/* Header */}
          <div className='mb-6 flex items-center justify-between'>
            <h1 className='text-xl font-semibold text-gray-800 dark:text-gray-100'>
              Import Data Tiket Historis
            </h1>
            <div className='flex items-center gap-2'>
              {[1, 2, 3].map((s) => (
                <div
                  key={s}
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium ${
                    step === s
                      ? 'bg-teal-500 text-white'
                      : step > s
                        ? 'bg-teal-100 text-teal-700 dark:bg-teal-900 dark:text-teal-300'
                        : 'bg-slate-100 text-slate-500 dark:bg-slate-700'
                  }`}
                >
                  {step > s ? <Check size={16} /> : s}
                </div>
              ))}
            </div>
          </div>

          {/* ════════════════════ STEP 1 ════════════════════ */}
          {step === 1 && (
            <div className='space-y-6'>
              {/* File Upload */}
              <div className='rounded-lg border-2 border-dashed border-slate-300 p-8 text-center dark:border-slate-600'>
                <input
                  type='file'
                  accept='.xlsx,.xls,.csv'
                  onChange={(e) => {
                    const selectedFile = e.target.files?.[0];
                    if (selectedFile) {
                      setFile(selectedFile);
                      setFileName(selectedFile.name);
                      setImportResult(null);
                    }
                  }}
                  className='hidden'
                  id='import-file'
                />
                <label htmlFor='import-file' className='cursor-pointer'>
                  {fileName ? (
                    <div className='flex flex-col items-center'>
                      <FileSpreadsheet size={48} className='text-teal-500' />
                      <p className='mt-2 font-medium text-slate-700 dark:text-slate-200'>
                        {fileName}
                      </p>
                      <p className='text-sm text-slate-500'>
                        Klik untuk ganti file
                      </p>
                    </div>
                  ) : (
                    <div className='flex flex-col items-center'>
                      <Upload size={48} className='text-slate-400' />
                      <p className='mt-2 font-medium text-slate-700 dark:text-slate-200'>
                        Klik atau drag &amp; drop file Excel
                      </p>
                      <p className='text-sm text-slate-500'>
                        Format: .xlsx, .xls, .csv (maks 50MB)
                      </p>
                    </div>
                  )}
                </label>
              </div>

              {/* Configuration */}
              <div className='grid grid-cols-1 gap-4 md:grid-cols-2'>
                <div>
                  <label className='mb-1.5 block text-xs font-semibold text-slate-600 uppercase dark:text-slate-300'>
                    Jenis Tiket Default *
                  </label>
                  <select
                    value={defaultJenis}
                    onChange={(e) => setDefaultJenis(e.target.value)}
                    className='w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-teal-500 dark:border-slate-600 dark:bg-slate-700'
                  >
                    {JENIS_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className='mb-1.5 block text-xs font-semibold text-slate-600 uppercase dark:text-slate-300'>
                    Sync Date (Periode Data) *
                  </label>
                  <input
                    type='date'
                    value={syncDate}
                    onChange={(e) => setSyncDate(e.target.value)}
                    max={format(new Date(), 'yyyy-MM-dd')}
                    className='w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-teal-500 dark:border-slate-600 dark:bg-slate-700'
                  />
                  {!syncDateValid && (
                    <p className='mt-1 text-xs text-red-500'>
                      Tanggal tidak boleh lebih dari hari ini
                    </p>
                  )}
                </div>

                <div>
                  <label className='mb-1.5 block text-xs font-semibold text-slate-600 uppercase dark:text-slate-300'>
                    Import Batch
                  </label>
                  <input
                    type='text'
                    value={importBatch}
                    onChange={(e) => setImportBatch(e.target.value)}
                    className='w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-teal-500 dark:border-slate-600 dark:bg-slate-700'
                  />
                </div>

                <div className='flex items-center gap-3 pt-5'>
                  <input
                    type='checkbox'
                    id='only-closed'
                    checked={onlyClosed}
                    onChange={(e) => setOnlyClosed(e.target.checked)}
                    className='h-4 w-4 rounded border-slate-300 text-teal-500 focus:ring-teal-500'
                  />
                  <label
                    htmlFor='only-closed'
                    className='text-sm text-slate-700 dark:text-slate-300'
                  >
                    Hanya import STATUS: CLOSED
                  </label>
                </div>
              </div>

              {importResult && !importResult.success && (
                <div className='rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20'>
                  <p className='font-medium text-red-700 dark:text-red-300'>
                    {importResult.message}
                  </p>
                </div>
              )}

              <div className='flex justify-end'>
                <Button
                  onClick={handlePreview}
                  disabled={
                    !file ||
                    !syncDateValid ||
                    loading ||
                    loadingTeknisi ||
                    teknisiList.length === 0
                  }
                >
                  {loading ? (
                    <>
                      <Loader2 size={16} className='mr-2 animate-spin' />
                      Memproses...
                    </>
                  ) : (
                    <>
                      <ArrowRight size={16} className='mr-2' />
                      Lanjut ke Preview
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* ════════════════════ STEP 2 ════════════════════ */}
          {step === 2 && (
            <div className='space-y-6'>
              {/* Summary Stats */}
              <div className='grid grid-cols-2 gap-4 md:grid-cols-4'>
                <div className='rounded-lg bg-slate-50 p-4 text-center dark:bg-slate-700'>
                  <BarChart3 className='mx-auto mb-2 text-teal-500' />
                  <p className='text-2xl font-bold text-slate-800 dark:text-slate-100'>
                    {stats.totalRows}
                  </p>
                  <p className='text-xs text-slate-500'>Total Baris</p>
                </div>
                <div className='rounded-lg bg-green-50 p-4 text-center dark:bg-green-900/30'>
                  <Check className='mx-auto mb-2 text-green-500' />
                  <p className='text-2xl font-bold text-green-700 dark:text-green-400'>
                    {stats.readyCount}
                  </p>
                  <p className='text-xs text-green-600 dark:text-green-400'>
                    Siap Import
                  </p>
                </div>
                <div className='rounded-lg bg-yellow-50 p-4 text-center dark:bg-yellow-900/30'>
                  <AlertTriangle className='mx-auto mb-2 text-yellow-500' />
                  <p className='text-2xl font-bold text-yellow-700 dark:text-yellow-400'>
                    {stats.unresolvedCount}
                  </p>
                  <p className='text-xs text-yellow-600 dark:text-yellow-400'>
                    Teknisi Tidak Ditemukan
                  </p>
                </div>
                <div className='rounded-lg bg-blue-50 p-4 text-center dark:bg-blue-900/30'>
                  <FileSpreadsheet className='mx-auto mb-2 text-blue-500' />
                  <p className='text-2xl font-bold text-blue-700 dark:text-blue-400'>
                    {stats.totalNames}
                  </p>
                  <p className='text-xs text-blue-600 dark:text-blue-400'>
                    Nama Unik
                  </p>
                </div>
              </div>

              {/* Saved mapping info */}
              {savedMappingCount > 0 && (
                <div className='flex items-center justify-between rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 dark:border-blue-800 dark:bg-blue-900/20'>
                  <div className='flex items-center gap-2 text-xs text-blue-700 dark:text-blue-300'>
                    <span>
                      💾 {savedMappingCount} mapping tersimpan dari import
                      sebelumnya
                    </span>
                  </div>
                  <button
                    onClick={handleClearMapping}
                    className='flex items-center gap-1 text-xs text-red-500 hover:underline'
                  >
                    <RotateCcw size={12} />
                    Reset
                  </button>
                </div>
              )}

              {/* Warning for unresolved */}
              {stats.unresolvedCount > 0 && (
                <div className='rounded-lg border border-yellow-200 bg-yellow-50 p-4 dark:border-yellow-800 dark:bg-yellow-900/20'>
                  <p className='font-medium text-yellow-800 dark:text-yellow-200'>
                    {stats.unresolvedCount} nama teknisi tidak cocok dengan data
                    di sistem ({stats.unresolvedCount} baris akan dilewati)
                  </p>
                  <p className='mt-1 text-sm text-yellow-700 dark:text-yellow-300'>
                    Pilih teknisi manual dari dropdown atau data akan dilewati
                    saat import.
                  </p>
                </div>
              )}

              {/* Table: Unique Names */}
              <div className='max-h-96 overflow-auto rounded-lg border border-slate-200 dark:border-slate-700'>
                <table className='w-full text-sm'>
                  <thead className='sticky top-0 bg-slate-50 dark:bg-slate-800'>
                    <tr>
                      <th className='px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300'>
                        Nama di Excel
                      </th>
                      <th className='px-3 py-2 text-center font-medium text-slate-600 dark:text-slate-300'>
                        Jumlah Tiket
                      </th>
                      <th className='px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300'>
                        Teknisi di Dompis
                      </th>
                      <th className='px-3 py-2 text-center font-medium text-slate-600 dark:text-slate-300'>
                        Conf.
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {uniqueNames.map((entry, idx) => (
                      <tr
                        key={idx}
                        className={`border-t border-slate-100 dark:border-slate-700 ${
                          entry.resolvedId === null
                            ? 'bg-yellow-50 dark:bg-yellow-900/20'
                            : ''
                        }`}
                      >
                        <td className='px-3 py-2 font-medium text-slate-700 dark:text-slate-200'>
                          {entry.nameFromExcel}
                        </td>
                        <td className='px-3 py-2 text-center text-slate-600 dark:text-slate-300'>
                          {entry.ticketCount}
                        </td>
                        <td className='px-3 py-2'>
                          {entry.resolvedId !== null ? (
                            <span className='text-green-600 dark:text-green-400'>
                              {entry.resolvedName}
                            </span>
                          ) : (
                            <select
                              value=''
                              onChange={(e) =>
                                handleManualSelect(
                                  entry.nameFromExcel,
                                  e.target.value
                                    ? parseInt(e.target.value)
                                    : null,
                                )
                              }
                              className='w-full rounded border border-slate-200 bg-white px-2 py-1 text-xs dark:border-slate-600 dark:bg-slate-700'
                            >
                              <option value=''>Pilih Teknisi</option>
                              {teknisiList.map((t) => (
                                <option key={t.id_user} value={t.id_user}>
                                  {t.nama}
                                </option>
                              ))}
                            </select>
                          )}
                        </td>
                        <td className='px-3 py-2 text-center'>
                          {entry.confidence === 'auto' && (
                            <span className='rounded-full bg-green-100 px-2 py-0.5 text-[10px] text-green-700 dark:bg-green-900/40 dark:text-green-300'>
                              Auto
                            </span>
                          )}
                          {entry.confidence === 'saved' && (
                            <span className='rounded-full bg-blue-100 px-2 py-0.5 text-[10px] text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'>
                              💾 Tersimpan
                            </span>
                          )}
                          {entry.confidence === 'manual' && (
                            <span className='rounded-full bg-amber-100 px-2 py-0.5 text-[10px] text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'>
                              Manual
                            </span>
                          )}
                          {entry.confidence === null && (
                            <span className='rounded-full bg-red-100 px-2 py-0.5 text-[10px] text-red-700 dark:bg-red-900/40 dark:text-red-300'>
                              -
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className='flex justify-between'>
                <Button variant='outline' onClick={() => setStep(1)}>
                  <ArrowLeft size={16} className='mr-2' />
                  Kembali
                </Button>
                <Button
                  onClick={handleImport}
                  disabled={stats.readyCount === 0}
                >
                  <Upload size={16} className='mr-2' />
                  Mulai Import ({stats.readyCount} tiket siap)
                </Button>
              </div>
            </div>
          )}

          {/* ════════════════════ STEP 3 ════════════════════ */}
          {step === 3 && (
            <div className='space-y-6'>
              {importing && (
                <div className='rounded-lg border border-slate-200 bg-slate-50 p-6 dark:border-slate-700 dark:bg-slate-800'>
                  <div className='flex items-center gap-4'>
                    <Loader2
                      className='animate-spin text-teal-500'
                      size={32}
                    />
                    <div className='flex-1'>
                      <p className='font-medium text-slate-700 dark:text-slate-200'>
                        Mengimport data...
                      </p>
                      <p className='text-sm text-slate-500'>
                        Mohon tunggu, proses bisa memakan waktu beberapa menit
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {importResult && (
                <div
                  className={`rounded-lg border p-6 ${
                    importResult.success
                      ? 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20'
                      : 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20'
                  }`}
                >
                  <div className='flex items-start gap-4'>
                    {importResult.success ? (
                      <Check className='text-green-500' size={32} />
                    ) : (
                      <X className='text-red-500' size={32} />
                    )}
                    <div className='flex-1'>
                      <h3
                        className={`font-semibold ${
                          importResult.success
                            ? 'text-green-700 dark:text-green-300'
                            : 'text-red-700 dark:text-red-300'
                        }`}
                      >
                        {importResult.success
                          ? 'Import Berhasil'
                          : 'Import Gagal'}
                      </h3>
                      <p className='mt-1 text-sm text-slate-600 dark:text-slate-300'>
                        {importResult.message}
                      </p>

                      {importResult.success && importResult.data && (
                        <div className='mt-4 grid grid-cols-2 gap-4 md:grid-cols-4'>
                          <div className='rounded bg-white/50 p-3 dark:bg-black/20'>
                            <p className='text-2xl font-bold text-green-600'>
                              {importResult.data.inserted}
                            </p>
                            <p className='text-xs text-green-600'>Diinsert</p>
                          </div>
                          <div className='rounded bg-white/50 p-3 dark:bg-black/20'>
                            <p className='text-2xl font-bold text-blue-600'>
                              {importResult.data.updated}
                            </p>
                            <p className='text-xs text-blue-600'>Diupdate</p>
                          </div>
                          <div className='rounded bg-white/50 p-3 dark:bg-black/20'>
                            <p className='text-2xl font-bold text-yellow-600'>
                              {importResult.data.skipped}
                            </p>
                            <p className='text-xs text-yellow-600'>Dilewati</p>
                          </div>
                          <div className='rounded bg-white/50 p-3 dark:bg-black/20'>
                            <p className='text-2xl font-bold text-red-600'>
                              {importResult.data.failed}
                            </p>
                            <p className='text-xs text-red-600'>Gagal</p>
                          </div>
                        </div>
                      )}

                      {importResult.data?.errors &&
                        importResult.data.errors.length > 0 && (
                          <div className='mt-4 rounded bg-red-100 p-3 dark:bg-red-900/30'>
                            <p className='font-medium text-red-700 dark:text-red-300'>
                              Error:
                            </p>
                            <ul className='mt-1 list-inside list-disc text-sm text-red-600 dark:text-red-400'>
                              {importResult.data.errors
                                .slice(0, 5)
                                .map((err, i) => (
                                  <li key={i}>{err}</li>
                                ))}
                            </ul>
                          </div>
                        )}

                      {importResult.success && (
                        <div className='mt-4'>
                          <Link
                            href={`/admin/technicians/manhours?date_from=${syncDate}&date_to=${syncDate}`}
                            className='inline-flex items-center rounded-lg bg-teal-500 px-4 py-2 text-sm font-medium text-white hover:bg-teal-600'
                          >
                            <BarChart3 size={16} className='mr-2' />
                            Buka Laporan ManHours
                          </Link>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <div className='flex justify-start'>
                <Button variant='outline' onClick={handleReset}>
                  Import Lagi
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
