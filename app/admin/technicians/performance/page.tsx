'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import flatpickr from 'flatpickr';
import { CalendarDays, Download, SlidersHorizontal, X } from 'lucide-react';
import AdminLayout from '@/app/components/layout/AdminLayout';
import Button from '@/app/components/ui/Button';
import SearchableSelect from '@/app/components/form/SearchableSelect';
import { fetchWithAuth } from '@/app/libs/fetcher';
import { useAutoRefresh } from '@/app/hooks/useAutoRefresh';

type Mode = 'daily' | 'monthly';
type Spesialisasi = 'b2b' | 'b2c';
type CountKey = 'CUS' | 'PRO' | 'MAN' | 'OHI' | 'REP' | 'LAIN';

const BUCKET_COLS: Exclude<CountKey, 'LAIN'>[] = [
  'CUS',
  'PRO',
  'OHI',
  'REP',
  'MAN',
];

const BUCKET_LABEL: Record<Exclude<CountKey, 'LAIN'>, string> = {
  CUS: 'CUST',
  PRO: 'PROC',
  OHI: 'U-OHI',
  REP: 'OBST',
  MAN: 'MNUL',
};

const COL_LABEL: Record<CountKey, string> = { ...BUCKET_LABEL, LAIN: 'LAIN' };

/** Bersihkan placeholder sumber (#N/A dsb). */
const clean = (v: unknown): string => {
  const s = String(v ?? '').trim();
  return !s || /^#(n\/a|ref!?|value!?)$/i.test(s) ? '' : s;
};

interface RecapRow {
  id_user: number;
  nama: string;
  nik: string | null;
  witel: string;
  service_area: string;
  hari_hadir: number;
  counts: Record<CountKey, number>;
  total_close: number;
  bobot: number;
  bobot_avg: number | null;
  produktivitas: 'Tinggi' | 'Sedang' | 'Rendah' | null;
  realisasi: number;
  produktivitas_jam: number;
  target: number;
}
interface BobotConfig {
  bucket_key: Exclude<CountKey, 'LAIN'>;
  label: string;
  bobot: number;
  sort_order: number;
}
interface Thresholds {
  tinggi_min: number;
  sedang_min: number;
}

const fmt = (d: Date) => format(d, 'yyyy-MM-dd');
const monthRange = () => ({
  from: fmt(startOfMonth(new Date())),
  to: fmt(endOfMonth(new Date())),
});

const PROD_BADGE: Record<string, string> = {
  Tinggi:
    'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  Sedang: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
  Rendah: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
};

function RangePicker({
  from,
  to,
  onPick,
}: {
  from: string;
  to: string;
  onPick: (from: string, to: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;

  useEffect(() => {
    if (!inputRef.current) return;
    void import('flatpickr/dist/flatpickr.css').catch(() => {});
    const fp = flatpickr(inputRef.current, {
      mode: 'range',
      dateFormat: 'Y-m-d',
      defaultDate: [from, to],
      onChange: (dates) => {
        if (dates.length === 2) {
          onPickRef.current(fmt(dates[0]), fmt(dates[1]));
        }
      },
    });
    return () => fp.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to]);

  return (
    <div className='relative'>
      <input
        ref={inputRef}
        readOnly
        placeholder='Pilih rentang tanggal'
        className='h-11 w-full cursor-pointer rounded-lg border border-slate-300 px-3 pr-9 text-sm dark:border-slate-600 dark:bg-slate-900'
      />
      <CalendarDays
        size={16}
        className='pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-slate-400'
      />
    </div>
  );
}

function SaCell({ value }: { value: string }) {
  const parts = value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length <= 2) return <>{value || '–'}</>;
  return (
    <span title={value} className='whitespace-nowrap'>
      {parts.slice(0, 2).join(', ')}{' '}
      <span className='rounded bg-slate-100 px-1 text-[11px] text-slate-500 dark:bg-slate-700'>
        +{parts.length - 2}
      </span>
    </span>
  );
}

export default function RekapCloseTeknisiPage() {
  const initial = monthRange();
  const [mode, setMode] = useState<Mode>('monthly');
  const [dateFrom, setDateFrom] = useState(initial.from);
  const [dateTo, setDateTo] = useState(initial.to);
  const [serviceArea, setServiceArea] = useState('');
  const [spesialisasi, setSpesialisasi] = useState<Spesialisasi>('b2b');
  const [q, setQ] = useState('');
  const [includeEmpty, setIncludeEmpty] = useState(false);

  const [rows, setRows] = useState<RecapRow[]>([]);
  const [serviceAreas, setServiceAreas] = useState<string[]>([]);
  const [configs, setConfigs] = useState<BobotConfig[]>([]);
  const [thresholds, setThresholds] = useState<Thresholds>({
    tinggi_min: 4,
    sedang_min: 2,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [showConfig, setShowConfig] = useState(false);

  const [detail, setDetail] = useState<{
    open: boolean;
    tech: string;
    bucket: string;
    tickets: any[];
    loading: boolean;
  }>({ open: false, tech: '', bucket: '', tickets: [], loading: false });

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const applyMode = (next: Mode) => {
    setMode(next);
    if (next === 'daily') {
      const t = fmt(new Date());
      setDateFrom(t);
      setDateTo(t);
    } else {
      const r = monthRange();
      setDateFrom(r.from);
      setDateTo(r.to);
    }
  };

  const onRangePick = useCallback((f: string, t: string) => {
    setDateFrom(f);
    setDateTo(t);
  }, []);

  const fetchData = useCallback(async () => {
    if (!mounted.current) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        date_from: dateFrom,
        date_to: dateTo,
        spesialisasi,
      });
      if (serviceArea) params.set('service_area', serviceArea);
      if (q.trim()) params.set('q', q.trim());
      if (includeEmpty) params.set('include_empty', '1');

      const res = await fetchWithAuth(
        `/api/technicians/performance?${params.toString()}`,
      );
      const json = res ? await res.json().catch(() => null) : null;
      if (!res?.ok || !json?.success) {
        throw new Error(json?.message || 'Gagal memuat rekap');
      }
      if (!mounted.current) return;
      setRows((json.data?.rows ?? []) as RecapRow[]);
      setServiceAreas((json.data?.serviceAreas ?? []) as string[]);
      setConfigs((json.data?.configs ?? []) as BobotConfig[]);
      if (json.data?.thresholds) setThresholds(json.data.thresholds);
    } catch (e: any) {
      if (!mounted.current) return;
      setError(e?.message || 'Gagal memuat rekap');
      setRows([]);
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [dateFrom, dateTo, serviceArea, spesialisasi, q, includeEmpty]);

  useEffect(() => {
    const t = setTimeout(fetchData, 250);
    return () => clearTimeout(t);
  }, [fetchData]);

  useAutoRefresh({
    intervalMs: 120_000,
    refreshers: [fetchData],
    pauseWhen: [exporting, detail.open, showConfig],
  });

  const saOptions = useMemo(
    () => [
      { value: '', label: 'Semua Service Area' },
      ...serviceAreas.map((s) => ({ value: s, label: s })),
    ],
    [serviceAreas],
  );

  const openDetail = useCallback(
    async (row: RecapRow, bucket: CountKey | 'ALL') => {
      setDetail({
        open: true,
        tech: row.nama,
        bucket:
          bucket === 'ALL'
            ? 'Semua'
            : (BUCKET_LABEL[bucket as Exclude<CountKey, 'LAIN'>] ?? bucket),
        tickets: [],
        loading: true,
      });
      try {
        const params = new URLSearchParams({
          tech_id: String(row.id_user),
          date_from: dateFrom,
          date_to: dateTo,
        });
        if (bucket !== 'ALL') params.set('bucket', bucket);
        if (serviceArea) params.set('service_area', serviceArea);
        const res = await fetchWithAuth(
          `/api/technicians/performance/tickets?${params.toString()}`,
        );
        const json = res ? await res.json().catch(() => null) : null;
        setDetail((p) => ({
          ...p,
          tickets: json?.success ? json.data.tickets : [],
          loading: false,
        }));
      } catch {
        setDetail((p) => ({ ...p, loading: false }));
      }
    },
    [dateFrom, dateTo, serviceArea],
  );

  const downloadExcel = useCallback(async () => {
    setExporting(true);
    try {
      const params = new URLSearchParams({
        date_from: dateFrom,
        date_to: dateTo,
        spesialisasi,
      });
      if (serviceArea) params.set('service_area', serviceArea);
      if (q.trim()) params.set('q', q.trim());
      if (includeEmpty) params.set('include_empty', '1');
      const res = await fetchWithAuth(
        `/api/technicians/performance/export-excel?${params.toString()}`,
      );
      if (!res?.ok) throw new Error('Export gagal');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Rekap_Close_Teknisi_${dateFrom}_sd_${dateTo}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      alert(e?.message || 'Export gagal');
    } finally {
      setExporting(false);
    }
  }, [dateFrom, dateTo, serviceArea, spesialisasi, q, includeEmpty]);

  return (
    <AdminLayout>
      <div className='space-y-5'>
        {/* Header */}
        <div className='flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between'>
          <div>
            <h1 className='text-xl font-semibold text-gray-800 sm:text-2xl dark:text-gray-100'>
              Rekap Close Teknisi
            </h1>
            <p className='text-sm text-gray-500 dark:text-gray-400'>
              Produktivitas teknisi dari tiket close dompis
            </p>
            <Link
              href='/admin/technicians'
              className='mt-1 inline-flex text-sm text-blue-600 hover:underline dark:text-blue-400'
            >
              ← Kembali ke Monitoring Teknisi
            </Link>
          </div>
          <div className='flex flex-wrap items-center gap-2'>
            <Button
              variant='outline'
              size='sm'
              onClick={() => setShowConfig((v) => !v)}
            >
              <SlidersHorizontal size={15} className='mr-1.5' />
              Bobot &amp; Ambang
            </Button>
            <Button
              variant='outline'
              size='sm'
              onClick={downloadExcel}
              disabled={exporting || loading || rows.length === 0}
            >
              <Download size={15} className='mr-1.5' />
              {exporting ? 'Mengunduh…' : 'Export Excel'}
            </Button>
          </div>
        </div>

        {/* Filter bar */}
        <div className='grid gap-4 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-4 dark:border-slate-700 dark:bg-slate-800'>
          <div>
            <span className='mb-1 block text-xs font-semibold text-slate-500 dark:text-slate-400'>
              Rentang tanggal
            </span>
            <RangePicker from={dateFrom} to={dateTo} onPick={onRangePick} />
          </div>

          <div>
            <span className='mb-1 block text-xs font-semibold text-slate-500 dark:text-slate-400'>
              Mode
            </span>
            <div className='inline-flex h-11 overflow-hidden rounded-lg border border-slate-300 dark:border-slate-600'>
              {(['daily', 'monthly'] as Mode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => applyMode(m)}
                  className={`px-4 text-sm ${
                    mode === m
                      ? 'bg-emerald-500 text-white'
                      : 'bg-white text-slate-600 dark:bg-slate-900 dark:text-slate-300'
                  }`}
                >
                  {m === 'daily' ? 'Daily' : 'Monthly'}
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className='mb-1 block text-xs font-semibold text-slate-500 dark:text-slate-400'>
              Spesialisasi
            </span>
            <div className='inline-flex h-11 overflow-hidden rounded-lg border border-slate-300 dark:border-slate-600'>
              {(['b2b', 'b2c'] as Spesialisasi[]).map((s) => (
                <button
                  key={s}
                  onClick={() => setSpesialisasi(s)}
                  className={`px-5 text-sm font-medium uppercase ${
                    spesialisasi === s
                      ? 'bg-emerald-500 text-white'
                      : 'bg-white text-slate-600 dark:bg-slate-900 dark:text-slate-300'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className='mb-1 block text-xs font-semibold text-slate-500 dark:text-slate-400'>
              Service Area
            </span>
            <SearchableSelect
              key={serviceAreas.length}
              options={saOptions}
              defaultValue={serviceArea}
              onChange={setServiceArea}
              placeholder='Cari Service Area…'
            />
          </div>

          <div className='sm:col-span-2 lg:col-span-2'>
            <span className='mb-1 block text-xs font-semibold text-slate-500 dark:text-slate-400'>
              Cari teknisi
            </span>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder='Nama / NIK…'
              className='h-11 w-full rounded-lg border border-slate-300 px-3 text-sm dark:border-slate-600 dark:bg-slate-900'
            />
          </div>

          <label className='flex items-end gap-2 pb-2 text-sm text-slate-600 lg:col-span-2 dark:text-slate-300'>
            <input
              type='checkbox'
              checked={includeEmpty}
              onChange={(e) => setIncludeEmpty(e.target.checked)}
              className='h-4 w-4 rounded border-slate-300'
            />
            Tampilkan teknisi tanpa tiket close
          </label>
        </div>

        {/* Config panel */}
        {showConfig && (
          <BobotConfigPanel
            configs={configs}
            thresholds={thresholds}
            onSaved={(c, t) => {
              setConfigs(c);
              setThresholds(t);
              fetchData();
            }}
            onClose={() => setShowConfig(false)}
          />
        )}

        {error && (
          <div className='rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400'>
            {error}
          </div>
        )}

        {/* Table */}
        <div className='overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800'>
          <div className='max-h-[70vh] overflow-auto'>
            <table className='w-full text-sm'>
              <thead className='sticky top-0 z-10 bg-slate-50 text-xs font-semibold tracking-wide text-slate-500 uppercase dark:bg-slate-700 dark:text-slate-300'>
                <tr>
                  <th className='px-3 py-3 text-left'>No</th>
                  <th className='px-3 py-3 text-left'>Teknisi</th>
                  <th className='px-3 py-3 text-left'>Branch</th>
                  <th className='px-3 py-3 text-left'>SA</th>
                  <th className='px-3 py-3 text-center'>Absensi</th>
                  {BUCKET_COLS.map((c) => (
                    <th key={c} className='px-2 py-3 text-center'>
                      {BUCKET_LABEL[c]}
                    </th>
                  ))}
                  <th className='px-2 py-3 text-center text-slate-400'>Lain</th>
                  <th className='px-3 py-3 text-center'>Bobot</th>
                  <th className='px-3 py-3 text-center'>Bobot Avg</th>
                  <th className='px-3 py-3 text-center'>Productivity</th>
                </tr>
              </thead>
              <tbody className='divide-y divide-slate-100 dark:divide-slate-700'>
                {loading ? (
                  <tr>
                    <td
                      colSpan={13}
                      className='px-4 py-10 text-center text-slate-400'
                    >
                      Memuat…
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={13}
                      className='px-4 py-10 text-center text-slate-400'
                    >
                      Tidak ada data
                    </td>
                  </tr>
                ) : (
                  rows.map((r, i) => (
                    <tr
                      key={r.id_user}
                      className='odd:bg-white even:bg-slate-50/50 hover:bg-blue-50/40 dark:odd:bg-slate-800 dark:even:bg-slate-800/60 dark:hover:bg-slate-700/40'
                    >
                      <td className='px-3 py-2.5 text-slate-500'>{i + 1}</td>
                      <td className='px-3 py-2.5'>
                        <button
                          onClick={() => openDetail(r, 'ALL')}
                          className='text-left font-medium text-slate-800 hover:text-blue-600 dark:text-slate-100 dark:hover:text-blue-400'
                        >
                          {r.nama}
                        </button>
                        <div className='text-[11px] text-slate-400'>
                          {r.nik || '-'}
                        </div>
                      </td>
                      <td className='px-3 py-2.5 whitespace-nowrap text-slate-600 dark:text-slate-300'>
                        {r.witel}
                      </td>
                      <td className='px-3 py-2.5 text-slate-600 dark:text-slate-300'>
                        <SaCell value={r.service_area} />
                      </td>
                      <td className='px-3 py-2.5 text-center whitespace-nowrap'>
                        <span className='inline-flex items-center gap-1 text-slate-600 dark:text-slate-300'>
                          <span
                            className={`h-2 w-2 rounded-full ${
                              r.hari_hadir > 0
                                ? 'bg-emerald-500'
                                : 'bg-slate-300'
                            }`}
                          />
                          {r.hari_hadir} Hadir
                        </span>
                      </td>
                      {BUCKET_COLS.map((c) => (
                        <td key={c} className='px-2 py-2.5 text-center'>
                          {r.counts[c] > 0 ? (
                            <button
                              onClick={() => openDetail(r, c)}
                              className='rounded px-1.5 font-semibold text-slate-700 tabular-nums hover:bg-blue-100 hover:text-blue-700 dark:text-slate-200 dark:hover:bg-blue-500/10'
                            >
                              {r.counts[c]}
                            </button>
                          ) : (
                            <span className='text-slate-300 dark:text-slate-600'>
                              0
                            </span>
                          )}
                        </td>
                      ))}
                      <td className='px-2 py-2.5 text-center text-xs text-slate-400 tabular-nums'>
                        {r.counts.LAIN || '·'}
                      </td>
                      <td className='px-3 py-2.5 text-center font-semibold text-slate-800 tabular-nums dark:text-slate-100'>
                        {r.bobot}
                      </td>
                      <td className='px-3 py-2.5 text-center font-semibold text-emerald-600 tabular-nums dark:text-emerald-400'>
                        {r.bobot_avg == null ? '–' : r.bobot_avg.toFixed(2)}
                      </td>
                      <td className='px-3 py-2.5 text-center'>
                        {r.produktivitas ? (
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                              PROD_BADGE[r.produktivitas]
                            }`}
                          >
                            {r.produktivitas}
                          </span>
                        ) : (
                          <span className='text-slate-300'>–</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
        <p className='text-xs text-slate-400'>
          {rows.length} teknisi · rentang {dateFrom} s/d {dateTo} ·{' '}
          {spesialisasi.toUpperCase()}
        </p>
      </div>

      {/* Drilldown modal */}
      {detail.open && (
        <div
          className='fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4'
          onClick={() => setDetail((p) => ({ ...p, open: false }))}
        >
          <div
            className='flex max-h-[85vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-slate-800'
            onClick={(e) => e.stopPropagation()}
          >
            <div className='flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-700'>
              <div>
                <h3 className='text-lg font-semibold text-slate-800 dark:text-slate-100'>
                  {detail.tech} — {detail.bucket}
                </h3>
                <p className='text-sm text-slate-500'>
                  {dateFrom} s/d {dateTo} · {detail.tickets.length} tiket
                </p>
              </div>
              <button
                onClick={() => setDetail((p) => ({ ...p, open: false }))}
                className='rounded-lg border border-slate-200 p-2 hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-700'
              >
                <X size={14} />
              </button>
            </div>
            <div className='flex-1 overflow-y-auto'>
              {detail.loading ? (
                <div className='py-16 text-center text-slate-400'>Memuat…</div>
              ) : detail.tickets.length === 0 ? (
                <div className='py-16 text-center text-slate-400'>
                  Tidak ada tiket
                </div>
              ) : (
                <table className='w-full text-sm'>
                  <thead className='sticky top-0 bg-slate-50 text-xs font-semibold text-slate-500 uppercase dark:bg-slate-700/80 dark:text-slate-400'>
                    <tr>
                      <th className='px-4 py-2.5 text-left'>No Tiket</th>
                      <th className='px-3 py-2.5 text-left'>Source</th>
                      <th className='px-4 py-2.5 text-left'>Customer</th>
                      <th className='px-4 py-2.5 text-left'>Service No</th>
                      <th className='px-3 py-2.5 text-left'>Jenis</th>
                      <th className='px-3 py-2.5 text-left'>Workzone</th>
                      <th className='px-3 py-2.5 text-right'>Resolve (j)</th>
                      <th className='px-4 py-2.5 text-left'>Selesai</th>
                    </tr>
                  </thead>
                  <tbody className='divide-y divide-slate-100 dark:divide-slate-700'>
                    {detail.tickets.map((t) => (
                      <tr
                        key={t.idTicket}
                        className='odd:bg-white even:bg-slate-50/50 dark:odd:bg-slate-800 dark:even:bg-slate-800/50'
                      >
                        <td className='px-4 py-2 font-mono text-xs font-semibold text-blue-600 dark:text-blue-400'>
                          {t.incident}
                        </td>
                        <td className='px-3 py-2'>
                          <span className='rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-600 dark:bg-slate-700 dark:text-slate-300'>
                            {COL_LABEL[t.column as CountKey] ?? t.column}
                          </span>
                        </td>
                        <td className='px-4 py-2 text-slate-700 dark:text-slate-300'>
                          {clean(t.contactName) || '–'}
                        </td>
                        <td className='px-4 py-2 font-mono text-xs text-slate-500'>
                          {clean(t.serviceNo) || '–'}
                        </td>
                        <td className='px-3 py-2 text-slate-600 dark:text-slate-400'>
                          {clean(t.jenisTiket) || '–'}
                        </td>
                        <td className='px-3 py-2 text-xs text-slate-500'>
                          {clean(t.workzone) || '–'}
                        </td>
                        <td className='px-3 py-2 text-right text-xs text-slate-500 tabular-nums'>
                          {t.resolveHours ?? '–'}
                        </td>
                        <td className='px-4 py-2 text-xs text-slate-500'>
                          {t.closedAt
                            ? new Date(t.closedAt).toLocaleString('id-ID', {
                                day: '2-digit',
                                month: 'short',
                                hour: '2-digit',
                                minute: '2-digit',
                              })
                            : '–'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}

function BobotConfigPanel({
  configs,
  thresholds,
  onSaved,
  onClose,
}: {
  configs: BobotConfig[];
  thresholds: Thresholds;
  onSaved: (c: BobotConfig[], t: Thresholds) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<BobotConfig[]>(configs);
  const [th, setTh] = useState<Thresholds>(thresholds);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => setDraft(configs), [configs]);
  useEffect(() => setTh(thresholds), [thresholds]);

  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetchWithAuth('/api/technicians/bobot-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          weights: draft.map((d) => ({
            bucket_key: d.bucket_key,
            bobot: d.bobot,
          })),
          thresholds: th,
        }),
      });
      const json = res ? await res.json().catch(() => null) : null;
      if (!res?.ok || !json?.success)
        throw new Error(json?.message || 'Gagal menyimpan');
      onSaved(json.data.weights, json.data.thresholds);
      setMsg('Tersimpan');
    } catch (e: any) {
      setMsg(e?.message || 'Gagal menyimpan');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className='rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800'>
      <div className='mb-3 flex items-center justify-between'>
        <h3 className='text-sm font-semibold text-slate-700 dark:text-slate-200'>
          Bobot per kategori &amp; ambang produktivitas
        </h3>
        <button
          onClick={onClose}
          className='text-slate-400 hover:text-slate-600'
        >
          <X size={16} />
        </button>
      </div>
      <div className='flex flex-wrap gap-4'>
        {[...draft]
          .sort(
            (a, b) =>
              BUCKET_COLS.indexOf(a.bucket_key) -
              BUCKET_COLS.indexOf(b.bucket_key),
          )
          .map((d) => (
            <label
              key={d.bucket_key}
              className='flex flex-col text-xs font-semibold text-slate-500 dark:text-slate-400'
            >
              {BUCKET_LABEL[d.bucket_key]} · {d.label}
              <input
                type='number'
                step='0.5'
                min={0}
                value={d.bobot}
                onChange={(e) =>
                  setDraft((prev) =>
                    prev.map((p) =>
                      p.bucket_key === d.bucket_key
                        ? { ...p, bobot: Number(e.target.value) }
                        : p,
                    ),
                  )
                }
                className='mt-1 w-24 rounded-lg border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900'
              />
            </label>
          ))}
        <span className='mx-1 w-px self-stretch bg-slate-200 dark:bg-slate-600' />
        <label className='flex flex-col text-xs font-semibold text-slate-500 dark:text-slate-400'>
          Ambang Tinggi ≥
          <input
            type='number'
            step='0.5'
            value={th.tinggi_min}
            onChange={(e) =>
              setTh((p) => ({ ...p, tinggi_min: Number(e.target.value) }))
            }
            className='mt-1 w-24 rounded-lg border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900'
          />
        </label>
        <label className='flex flex-col text-xs font-semibold text-slate-500 dark:text-slate-400'>
          Ambang Sedang ≥
          <input
            type='number'
            step='0.5'
            value={th.sedang_min}
            onChange={(e) =>
              setTh((p) => ({ ...p, sedang_min: Number(e.target.value) }))
            }
            className='mt-1 w-24 rounded-lg border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900'
          />
        </label>
      </div>
      <div className='mt-4 flex items-center gap-3'>
        <Button variant='primary' size='sm' onClick={save} disabled={saving}>
          {saving ? 'Menyimpan…' : 'Simpan'}
        </Button>
        {msg && <span className='text-xs text-slate-500'>{msg}</span>}
      </div>
    </div>
  );
}
