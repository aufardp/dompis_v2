'use client';

import { useState, useCallback, useMemo } from 'react';
import { format, subMonths, startOfMonth } from 'date-fns';
import * as XLSX from 'xlsx';
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
  Users,
  Calendar,
  Settings,
  BarChart3,
} from 'lucide-react';
import AdminLayout from '@/app/components/layout/AdminLayout';
import Button from '@/app/components/ui/Button';
import { fetchWithAuth } from '@/app/libs/fetcher';
import { JENIS_LABELS, JenisKey } from '@/app/libs/tickets/jenis';

type Step = 1 | 2 | 3;

interface ParsedRow {
  incident: string;
  resolveDate: string | null;
  technician: string | null;
  teknisi_user_id: number | null;
  status: string | null;
  workzone: string | null;
  customer_type: string | null;
  summary: string | null;
  reported_date: string | null;
  owner_group: string | null;
  service_no: string | null;
  contact_name: string | null;
  description_actual_solution: string | null;
  rk_information: string | null;
  symptom: string | null;
  lapul: string | null;
  gaul: string | null;
  valid: boolean;
  error?: string;
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

function findColumn(
  row: Record<string, any>,
  candidates: string[],
): string | null {
  for (const key of Object.keys(row)) {
    const normalizedKey = key.trim().toUpperCase().replace(/\s+/g, ' ');
    for (const candidate of candidates) {
      if (normalizedKey === candidate.toUpperCase()) {
        return row[key];
      }
    }
  }
  return null;
}

function parseResolveDate(raw: any): string | null {
  if (!raw) return null;

  if (raw instanceof Date && !isNaN(raw.getTime())) {
    return format(raw, 'yyyy-MM-dd HH:mm:ss');
  }

  const str = String(raw).trim();
  if (!str) return null;

  const ddMmYyyy = str.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/,
  );
  if (ddMmYyyy) {
    const [, d, m, y, h = '0', min = '0'] = ddMmYyyy;
    const date = new Date(
      parseInt(y),
      parseInt(m) - 1,
      parseInt(d),
      parseInt(h),
      parseInt(min),
    );
    return format(date, 'yyyy-MM-dd HH:mm:ss');
  }

  const isoDate = new Date(str);
  if (!isNaN(isoDate.getTime())) {
    return format(isoDate, 'yyyy-MM-dd HH:mm:ss');
  }

  return null;
}

function normalizeValue(value: any): string | null {
  if (value === null || value === undefined || value === '') return null;
  return String(value).trim();
}

function matchTeknisi(
  nameFromExcel: string | null,
  teknisiList: TeknisiUser[],
): { matched: boolean; id_user?: number; nama?: string } {
  if (!nameFromExcel?.trim()) return { matched: false };

  const searchName = nameFromExcel
    .trim()
    .toLowerCase()
    .replace(/\s*\(ggn\)/gi, '')
    .replace(/\s*ggn\s*/gi, '')
    .replace(/\s*mitra\s*/gi, '')
    .trim();

  for (const user of teknisiList) {
    const userName = (user.nama ?? '').toLowerCase().trim();
    if (
      userName === searchName ||
      userName.includes(searchName) ||
      searchName.includes(userName)
    ) {
      return { matched: true, id_user: user.id_user, nama: user.nama ?? '' };
    }
  }

  return { matched: false };
}

export default function ImportPage() {
  const [step, setStep] = useState<Step>(1);
  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [defaultJenis, setDefaultJenis] = useState<string>('reguler');
  const [onlyImportClosed, setOnlyImportClosed] = useState(true);
  const [syncDate, setSyncDate] = useState<string>(() => {
    const d = subMonths(new Date(), 1);
    return format(startOfMonth(d), 'yyyy-MM-dd');
  });
  const [importBatch, setImportBatch] = useState<string>(
    () => `IMPORT_EXCEL_${format(new Date(), 'yyyy-MM')}`,
  );

  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [teknisiList, setTeknisiList] = useState<TeknisiUser[]>([]);
  const [technicianMap, setTechnicianMap] = useState<
    Map<string, number | null>
  >(new Map());

  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [loadingTeknisi, setLoadingTeknisi] = useState(false);

  const fetchTeknisiList = useCallback(async () => {
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
  }, []);

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFile = e.target.files?.[0];
      if (!selectedFile) return;

      setFile(selectedFile);
      setFileName(selectedFile.name);
      setImportResult(null);

      await fetchTeknisiList();

      const buffer = await selectedFile.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const rawRows: Record<string, any>[] = XLSX.utils.sheet_to_json(sheet, {
        raw: false,
        defval: null,
      });

      const parsed: ParsedRow[] = rawRows.map((raw) => {
        const incident = normalizeValue(
          findColumn(raw, ['INCIDENT', 'incident', 'Ticket ID']),
        );
        const resolveDate = parseResolveDate(
          findColumn(raw, [
            'RESOLVE DATE',
            'RESOLVED DATE',
            'CLOSED DATE',
            'STATUS DATE',
          ]),
        );
        const technician = normalizeValue(
          findColumn(raw, ['TECHNICIAN', 'TEKNISI', 'CLOSED BY']),
        );
        const status = normalizeValue(findColumn(raw, ['STATUS', 'status']));
        const workzone = normalizeValue(
          findColumn(raw, ['WORKZONE', 'WITEL', 'witel']),
        );
        const customer_type = normalizeValue(
          findColumn(raw, ['CUSTOMER TYPE', 'CUSTOMER_TYPE']),
        );
        const summary = normalizeValue(findColumn(raw, ['SUMMARY', 'summary']));
        const reported_date = normalizeValue(
          findColumn(raw, ['REPORTED DATE', 'REPORTED_DATE']),
        );
        const owner_group = normalizeValue(
          findColumn(raw, ['OWNER GROUP', 'OWNER_GROUP']),
        );
        const service_no = normalizeValue(
          findColumn(raw, ['SERVICE NO', 'SERVICE_NO', 'SERVICE ID']),
        );
        const contact_name = normalizeValue(
          findColumn(raw, ['CONTACT NAME', 'CONTACT_NAME', 'CUSTOMER NAME']),
        );
        const description_actual_solution = normalizeValue(
          findColumn(raw, [
            'DESCRIPTION ACTUAL SOLUTION',
            'SOLUTION',
            'RESOLUTION',
          ]),
        );
        const rk_information = normalizeValue(
          findColumn(raw, ['RK INFORMATION', 'RK_INFORMATION']),
        );
        const symptom = normalizeValue(findColumn(raw, ['SYMPTOM', 'symptom']));
        const lapul = normalizeValue(findColumn(raw, ['LAPUL', 'lapul']));
        const gaul = normalizeValue(findColumn(raw, ['GAUL', 'gaul']));

        let valid = true;
        let error = '';

        if (!incident) {
          valid = false;
          error = 'INCIDENT kosong';
        } else if (onlyImportClosed && status?.toUpperCase() !== 'CLOSED') {
          valid = false;
          error = 'Status bukan CLOSED';
        }

        return {
          incident: incident!,
          resolveDate,
          technician,
          teknisi_user_id: null,
          status,
          workzone,
          customer_type,
          summary,
          reported_date,
          owner_group,
          service_no,
          contact_name,
          description_actual_solution,
          rk_information,
          symptom,
          lapul,
          gaul,
          valid,
          error,
        };
      });

      const newTechnicianMap = new Map<string, number | null>();
      parsed.forEach((row) => {
        if (row.technician && row.valid) {
          const match = matchTeknisi(row.technician, teknisiList);
          newTechnicianMap.set(
            row.incident,
            match.matched ? match.id_user! : null,
          );
        }
      });

      setParsedRows(parsed);
      setTechnicianMap(newTechnicianMap);
    },
    [onlyImportClosed, teknisiList, fetchTeknisiList],
  );

  const handleTechnicianSelect = useCallback(
    (incident: string, teknisiId: number | null) => {
      setTechnicianMap((prev) => new Map(prev).set(incident, teknisiId));
    },
    [],
  );

  const handleStartImport = useCallback(async () => {
    const rowsToImport = parsedRows
      .filter((r) => r.valid && technicianMap.get(r.incident))
      .map((r) => ({
        incident: r.incident,
        teknisi_user_id: technicianMap.get(r.incident)!,
        jenis_tiket: defaultJenis,
        closed_at: r.resolveDate || format(new Date(), 'yyyy-MM-dd HH:mm:ss'),
        sync_date: syncDate,
        status_update: 'close',
        workzone: r.workzone,
        customer_type: r.customer_type,
        summary: r.summary,
        reported_date: r.reported_date,
        owner_group: r.owner_group,
        service_no: r.service_no,
        contact_name: r.contact_name,
        description_actual_solution: r.description_actual_solution,
        rk_information: r.rk_information,
        symptom: r.symptom,
        lapul: r.lapul,
        gaul: r.gaul,
      }));

    if (rowsToImport.length === 0) {
      setImportResult({
        success: false,
        message: 'Tidak ada data yang valid untuk diimport',
      });
      return;
    }

    setImporting(true);
    setImportProgress(0);
    setStep(3);

    try {
      const res = await fetchWithAuth('/api/technicians/manhours/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rows: rowsToImport,
          import_batch: importBatch,
        }),
      });

      const result: ImportResult = res?.ok
        ? await res.json()
        : { success: false, message: 'Import gagal' };

      setImportResult(result);
    } catch (err) {
      setImportResult({
        success: false,
        message: err instanceof Error ? err.message : 'Import gagal',
      });
    } finally {
      setImporting(false);
      setImportProgress(100);
    }
  }, [parsedRows, technicianMap, defaultJenis, syncDate, importBatch]);

  const stats = useMemo(() => {
    const total = parsedRows.length;
    const valid = parsedRows.filter(
      (r) => r.valid && technicianMap.get(r.incident),
    ).length;
    const matched = parsedRows.filter(
      (r) => r.valid && technicianMap.get(r.incident),
    ).length;
    const unmatched = parsedRows.filter(
      (r) => r.valid && !technicianMap.get(r.incident),
    ).length;
    const skipped = parsedRows.filter((r) => !r.valid).length;
    return { total, valid, matched, unmatched, skipped };
  }, [parsedRows, technicianMap]);

  const syncDateValid = useMemo(() => {
    const inputDate = new Date(syncDate);
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    return inputDate <= today;
  }, [syncDate]);

  return (
    <AdminLayout>
      <div className='mx-auto max-w-4xl space-y-6 p-6'>
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

          {step === 1 && (
            <div className='space-y-6'>
              <div className='rounded-lg border-2 border-dashed border-slate-300 p-8 text-center dark:border-slate-600'>
                <input
                  type='file'
                  accept='.xlsx,.xls,.csv'
                  onChange={handleFileChange}
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
                        Klik atau drag & drop file Excel
                      </p>
                      <p className='text-sm text-slate-500'>
                        Format: .xlsx, .xls, .csv
                      </p>
                    </div>
                  )}
                </label>
              </div>

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
                    checked={onlyImportClosed}
                    onChange={(e) => setOnlyImportClosed(e.target.checked)}
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

              <div className='flex justify-end'>
                <Button
                  onClick={() => setStep(2)}
                  disabled={!file || !syncDateValid || loadingTeknisi}
                >
                  <ArrowRight size={16} className='mr-2' />
                  Lanjut ke Preview
                </Button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className='space-y-6'>
              <div className='grid grid-cols-2 gap-4 md:grid-cols-4'>
                <div className='rounded-lg bg-slate-50 p-4 text-center dark:bg-slate-700'>
                  <BarChart3 className='mx-auto mb-2 text-teal-500' />
                  <p className='text-2xl font-bold text-slate-800 dark:text-slate-100'>
                    {stats.total}
                  </p>
                  <p className='text-xs text-slate-500'>Total Baris</p>
                </div>
                <div className='rounded-lg bg-green-50 p-4 text-center dark:bg-green-900/30'>
                  <Check className='mx-auto mb-2 text-green-500' />
                  <p className='text-2xl font-bold text-green-700 dark:text-green-400'>
                    {stats.matched}
                  </p>
                  <p className='text-xs text-green-600 dark:text-green-400'>
                    Siap Import
                  </p>
                </div>
                <div className='rounded-lg bg-yellow-50 p-4 text-center dark:bg-yellow-900/30'>
                  <AlertTriangle className='mx-auto mb-2 text-yellow-500' />
                  <p className='text-2xl font-bold text-yellow-700 dark:text-yellow-400'>
                    {stats.unmatched}
                  </p>
                  <p className='text-xs text-yellow-600 dark:text-yellow-400'>
                    Teknisi Tidak Ditemukan
                  </p>
                </div>
                <div className='rounded-lg bg-red-50 p-4 text-center dark:bg-red-900/30'>
                  <X className='mx-auto mb-2 text-red-500' />
                  <p className='text-2xl font-bold text-red-700 dark:text-red-400'>
                    {stats.skipped}
                  </p>
                  <p className='text-xs text-red-600 dark:text-red-400'>
                    Dilewati
                  </p>
                </div>
              </div>

              {stats.unmatched > 0 && (
                <div className='rounded-lg border border-yellow-200 bg-yellow-50 p-4 dark:border-yellow-800 dark:bg-yellow-900/20'>
                  <p className='font-medium text-yellow-800 dark:text-yellow-200'>
                    {stats.unmatched} teknisi tidak cocok dengan data di sistem
                  </p>
                  <p className='mt-1 text-sm text-yellow-700 dark:text-yellow-300'>
                    Pilih teknisi manual dari dropdown atau data akan dilewati
                  </p>
                </div>
              )}

              <div className='max-h-96 overflow-auto rounded-lg border border-slate-200 dark:border-slate-700'>
                <table className='w-full text-sm'>
                  <thead className='sticky top-0 bg-slate-50 dark:bg-slate-800'>
                    <tr>
                      <th className='px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300'>
                        INCIDENT
                      </th>
                      <th className='px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300'>
                        Teknisi
                      </th>
                      <th className='px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300'>
                        Jenis
                      </th>
                      <th className='px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300'>
                        Closed At
                      </th>
                      <th className='px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300'>
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsedRows.slice(0, 20).map((row, idx) => {
                      const matchedTech = technicianMap.get(row.incident);
                      const teknisi = matchedTech
                        ? teknisiList.find((t) => t.id_user === matchedTech)
                        : null;

                      return (
                        <tr
                          key={idx}
                          className={`border-t border-slate-100 dark:border-slate-700 ${
                            !row.valid
                              ? 'bg-red-50 dark:bg-red-900/20'
                              : !matchedTech
                                ? 'bg-yellow-50 dark:bg-yellow-900/20'
                                : ''
                          }`}
                        >
                          <td className='px-3 py-2 font-mono text-xs'>
                            {row.incident}
                          </td>
                          <td className='px-3 py-2'>
                            {row.valid ? (
                              matchedTech ? (
                                <span className='text-green-600 dark:text-green-400'>
                                  {teknisi?.nama || 'Unknown'}
                                </span>
                              ) : (
                                <select
                                  value={matchedTech ?? ''}
                                  onChange={(e) =>
                                    handleTechnicianSelect(
                                      row.incident,
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
                              )
                            ) : (
                              <span className='text-red-500'>{row.error}</span>
                            )}
                          </td>
                          <td className='px-3 py-2 text-xs'>{defaultJenis}</td>
                          <td className='px-3 py-2 text-xs'>
                            {row.resolveDate || '-'}
                          </td>
                          <td className='px-3 py-2 text-xs'>
                            {row.status || '-'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {parsedRows.length > 20 && (
                <p className='text-center text-sm text-slate-500'>
                  Menampilkan 20 dari {parsedRows.length} baris
                </p>
              )}

              <div className='flex justify-between'>
                <Button variant='outline' onClick={() => setStep(1)}>
                  <ArrowLeft size={16} className='mr-2' />
                  Kembali
                </Button>
                <Button
                  onClick={handleStartImport}
                  disabled={stats.matched === 0}
                >
                  <Upload size={16} className='mr-2' />
                  Mulai Import ({stats.matched} data)
                </Button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className='space-y-6'>
              {importing && (
                <div className='rounded-lg border border-slate-200 bg-slate-50 p-6 dark:border-slate-700 dark:bg-slate-800'>
                  <div className='flex items-center gap-4'>
                    <Loader2 className='animate-spin text-teal-500' size={32} />
                    <div className='flex-1'>
                      <p className='font-medium text-slate-700 dark:text-slate-200'>
                        Mengimport data...
                      </p>
                      <div className='mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700'>
                        <div
                          className='h-full bg-teal-500 transition-all duration-300'
                          style={{ width: `${importProgress}%` }}
                        />
                      </div>
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
                <Button
                  variant='outline'
                  onClick={() => {
                    setStep(1);
                    setFile(null);
                    setFileName('');
                    setParsedRows([]);
                    setImportResult(null);
                  }}
                >
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
