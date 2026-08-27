'use client';

import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  Search,
  RefreshCw,
  Download,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  ListOrdered,
  Clock,
} from 'lucide-react';
import { usePersistentBranchScope } from '@/app/hooks/usePersistentBranchScope';
import BranchFilterSelect from '@/app/components/ui/BranchFilterSelect';

const COLUMNS = [
  'DURASI OPEN',
  'INCIDENT',
  'SUMMARY',
  'REPORTED DATE',
  'OWNER GROUP',
  'SERVICE TYPE',
  'WORKZONE',
  'CONTACT PHONE',
  'CONTACT NAME',
  'CUSTOMER TYPE',
  'CUSTOMER NAME',
  'SERVICE NO',
  'SYMPTOM',
  'DEVICE NAME',
  'STATUS UPDATE',
  'TYPE TIKET',
  'JENIS TIKET',
  'STATUS GAUL',
  'DURASI TIKET',
  'STATUS INSERA',
  'MAX TTR',
  'ALAMAT',
  'TEKNISI',
  'LABOR CODE',
  'STASUS DOMPIS',
  'LAPORAN TEKNISI',
  'RCA',
  'SUB_RCA',
  'Tanggal Order',
  'BOOKING TIME',
  'Tanggal Close',
  'Tanggal Open',
];

const DEPT_OPTIONS = [
  {
    value: 'all',
    label: 'All',
    tone: 'bg-blue-500/15 text-blue-700 ring-1 ring-blue-500/40 dark:text-blue-300 dark:ring-blue-400/40',
  },
  {
    value: 'b2b',
    label: 'B2B',
    tone: 'bg-cyan-500/15 text-cyan-700 ring-1 ring-cyan-500/40 dark:text-cyan-300 dark:ring-cyan-400/40',
  },
  {
    value: 'b2c',
    label: 'B2C',
    tone: 'bg-violet-500/15 text-violet-700 ring-1 ring-violet-500/40 dark:text-violet-300 dark:ring-violet-400/40',
  },
  {
    value: 'netral',
    label: 'Netral',
    tone: 'bg-slate-500/15 text-slate-700 ring-1 ring-slate-500/40 dark:text-slate-300 dark:ring-slate-400/40',
  },
];

const STATUS_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'close', label: 'Close' },
  { value: 'assigned', label: 'Assigned' },
] as const;

const FROZEN_LEFT_PIXELS = [0, 112, 248, 488] as const;

const FROZEN_COL_WIDTHS = [
  'w-[112px]',
  'w-[136px]',
  'w-[240px]',
  'w-[160px]',
] as const;

const COLUMN_WIDTHS = [
  '112px',
  '136px',
  '240px',
  '160px',
  '210px',
  '170px',
  '150px',
  '180px',
  '190px',
  '160px',
  '200px',
  '170px',
  '260px',
  '240px',
  '180px',
  '170px',
  '170px',
  '150px',
  '160px',
  '160px',
  '140px',
  '300px',
  '170px',
  '170px',
  '180px',
  '260px',
  '200px',
  '180px',
  '180px',
  '170px',
  '170px',
  '170px',
] as const;

interface DetailResponse {
  success: boolean;
  data: string[][];
  summary: { total: number; open: number; assigned: number; close: number };
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  message?: string;
}

function getAgeColor(hoursStr: string): string {
  const match = hoursStr.match(/(\d+)d/);
  if (match) {
    const days = parseInt(match[1], 10);
    if (days >= 1) return 'text-red-600 dark:text-red-400 font-semibold';
  }

  const hMatch = hoursStr.match(/(\d+)h/);
  if (hMatch) {
    const hours = parseInt(hMatch[1], 10);
    if (hours >= 24) return 'text-red-600 dark:text-red-400 font-semibold';
    if (hours >= 8) return 'text-amber-600 dark:text-amber-400 font-medium';
  }

  return 'text-emerald-600 dark:text-emerald-400';
}

function getFrozenLeft(index: number): number {
  return FROZEN_LEFT_PIXELS[index as 0 | 1 | 2 | 3] ?? 0;
}

function getFrozenCellBackground(rowIdx: number): string {
  if (rowIdx % 2 === 1) {
    return 'color-mix(in srgb, var(--surface-2) 30%, var(--surface))';
  }

  return 'var(--surface)';
}

function LoadingState() {
  return (
    <phantom-ui suppressHydrationWarning fallback-radius={8}
      loading
      animation='shimmer'
      reveal={0.12}
      loading-label='Loading detail wo hi'
    >
      <div className='space-y-5'>
        <div className='overflow-hidden rounded-3xl border border-(--border) bg-(--surface) shadow-sm'>
          <div className='border-b border-(--border) bg-(--surface-2) px-4 py-4 md:px-6'>
            <div className='flex flex-col gap-3 md:flex-row md:items-end md:justify-between'>
              <div className='max-w-3xl space-y-3'>
                <div className='flex flex-wrap items-center gap-2'>
                  <div className='h-7 w-28 rounded-full bg-slate-200 dark:bg-slate-800' />
                  <div className='h-7 w-20 rounded-full bg-slate-100 dark:bg-slate-800/70' />
                </div>
                <div className='h-7 w-72 rounded-full bg-slate-200 dark:bg-slate-800' />
                <div className='h-4 w-96 max-w-full rounded-full bg-slate-100 dark:bg-slate-800/70' />
              </div>
              <div className='grid gap-2 sm:grid-cols-3 md:min-w-90'>
                {Array.from({ length: 3 }).map((_, i) => (
                  <div
                    key={i}
                    className='rounded-2xl border border-(--border) bg-(--bg) px-4 py-3'
                  >
                    <div className='h-3 w-16 rounded-full bg-slate-200 dark:bg-slate-800' />
                    <div className='mt-2 h-5 w-12 rounded-full bg-slate-200 dark:bg-slate-800' />
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className='border-b border-(--border) bg-(--surface) p-4 md:p-5'>
            <div className='space-y-3'>
              <div className='h-10 w-full max-w-3xl rounded-xl bg-slate-200 dark:bg-slate-800' />
              <div className='flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between'>
                <div className='flex flex-wrap items-center gap-3'>
                  <div className='flex h-10 min-w-0 items-center gap-2 rounded-2xl border border-(--border) bg-(--surface-2) px-3 py-2'>
                    <div className='h-3 w-12 rounded-full bg-slate-200 dark:bg-slate-800' />
                    <div className='h-7 w-36 rounded-full bg-slate-100 dark:bg-slate-800/70' />
                  </div>
                  <div className='flex h-10 min-w-0 items-center gap-2 rounded-2xl border border-(--border) bg-(--surface-2) px-3 py-2'>
                    <div className='h-3 w-14 rounded-full bg-slate-200 dark:bg-slate-800' />
                    <div className='h-7 w-36 rounded-full bg-slate-100 dark:bg-slate-800/70' />
                  </div>
                </div>
                <div className='flex items-center gap-2'>
                  <div className='h-8 w-20 rounded-lg bg-slate-200 dark:bg-slate-800' />
                  <div className='h-8 w-16 rounded-lg bg-slate-200 dark:bg-slate-800' />
                  <div className='h-8 w-8 rounded-lg bg-slate-200 dark:bg-slate-800' />
                </div>
              </div>
            </div>
          </div>

          <div className='relative overflow-auto rounded-b-3xl border border-(--border) bg-(--surface)'>
            <div className='min-w-1050 p-4'>
              <div className='grid gap-3'>
                {Array.from({ length: 8 }).map((_, i) => (
                  <div
                    key={i}
                    className='grid grid-cols-3 gap-3 rounded-xl border border-(--border) bg-(--surface-2) p-4 md:grid-cols-8'
                  >
                    <div className='h-4 w-32 rounded-full bg-slate-200 dark:bg-slate-800 md:col-span-1' />
                    <div className='h-4 w-20 rounded-full bg-slate-200 dark:bg-slate-800 md:col-span-1' />
                    <div className='h-4 w-40 rounded-full bg-slate-200 dark:bg-slate-800 md:col-span-1' />
                    <div className='h-4 w-24 rounded-full bg-slate-200 dark:bg-slate-800 md:col-span-1' />
                    <div className='hidden h-4 w-20 rounded-full bg-slate-200 dark:bg-slate-800 md:block md:col-span-1' />
                    <div className='hidden h-4 w-20 rounded-full bg-slate-200 dark:bg-slate-800 md:block md:col-span-1' />
                    <div className='hidden h-4 w-20 rounded-full bg-slate-200 dark:bg-slate-800 md:block md:col-span-1' />
                    <div className='hidden h-4 w-16 rounded-full bg-slate-200 dark:bg-slate-800 md:block md:col-span-1' />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </phantom-ui>
  );
}

export default function DetailWoHiClient({
  initialBranch = '',
}: {
  initialBranch?: string;
}) {
  const { branch } = usePersistentBranchScope(initialBranch);
  const [search, setSearch] = useState('');
  const [dept, setDept] = useState<'all' | 'b2b' | 'b2c' | 'netral' | 'neutral'>('all');
  const [status, setStatus] = useState<'all' | 'open' | 'close' | 'assigned'>('all');
  const [page, setPage] = useState(1);
  const limit = 100;

  const queryParams = new URLSearchParams();
  if (search) queryParams.set('search', search);
  if (dept !== 'all') queryParams.set('dept', dept === 'neutral' ? 'netral' : dept);
  if (status !== 'all') queryParams.set('status', status);
  if (branch) queryParams.set('branch', branch);
  queryParams.set('page', String(page));
  queryParams.set('limit', String(limit));

  const { data, isLoading, isError, error, refetch, isFetching } =
    useQuery<DetailResponse>({
      queryKey: ['detail-wo-hi', search, dept, status, page, branch || 'all'],
      queryFn: async () => {
        const res = await fetch(
          `/api/tickets/daily/detail-wo-hi?${queryParams.toString()}`,
        );

        if (!res.ok) {
          const err = await res
            .json()
            .catch(() => ({ message: 'Gagal memuat data' }));

          throw new Error(err.message || 'Gagal memuat data');
        }

        return res.json();
      },
      staleTime: 30000,
    });

  const handleSearch = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
  }, []);

  const handleDeptChange = useCallback((value: string) => {
    setDept((value === 'neutral' ? 'netral' : value) as 'all' | 'b2b' | 'b2c' | 'netral');
    setPage(1);
  }, []);

  const handleStatusChange = useCallback((value: 'all' | 'open' | 'close' | 'assigned') => {
    setStatus(value);
    setPage(1);
  }, []);

  const handleExport = useCallback(
    async (format: 'xlsx' | 'csv') => {
      const queryParams = new URLSearchParams();
      if (search) queryParams.set('search', search);
      if (dept !== 'all') queryParams.set('dept', dept === 'neutral' ? 'netral' : dept);
      if (status !== 'all') queryParams.set('status', status);
      if (branch) queryParams.set('branch', branch);
      queryParams.set('format', format);

      try {
        const res = await fetch(
          `/api/tickets/daily/detail-wo-hi/export?${queryParams.toString()}`,
        );

        if (!res.ok) {
          const err = await res
            .json()
            .catch(() => ({ message: 'Export gagal' }));

          alert(err.message || 'Export gagal');
          return;
        }

        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');

        a.href = url;

        const today = new Date().toISOString().slice(0, 10);
        a.download = `Detail_WO_HI_${today}.${format}`;

        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch {
        alert('Export gagal. Coba lagi.');
      }
    },
    [search, dept, status, branch],
  );

  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;
  const rows = data?.data ?? [];
  const summary = data?.summary;

  return (
    <div className='space-y-5'>
      <div className='overflow-hidden rounded-3xl border border-(--border) bg-(--surface) shadow-sm'>
        <div className='border-b border-(--border) bg-(--surface-2) px-4 py-4 md:px-6'>
          <div className='flex flex-col gap-3 md:flex-row md:items-end md:justify-between'>
            <div className='max-w-3xl space-y-2'>
              <div className='flex flex-wrap items-center gap-2'>
                <span className='rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-1 text-[10px] font-bold tracking-[0.18em] text-blue-500 uppercase'>
                  Detail WO HI
                </span>
                <span className='rounded-full border border-(--border) bg-(--surface) px-3 py-1 text-[10px] font-semibold tracking-[0.16em] text-(--text-muted) uppercase'>
                  Harian
                </span>
              </div>

              <h1 className='text-2xl font-bold tracking-[-0.3px] text-(--text-primary) md:text-3xl'>
                Detail Tiket Live
              </h1>

              <p className='max-w-2xl text-sm leading-6 text-(--text-secondary)'>
                Filter, inspect, and export the current WO HI slice without
                losing the operational context.
              </p>
            </div>

            <div className='grid gap-2 sm:grid-cols-3 md:min-w-90'>
              <div className='rounded-2xl border border-(--border) bg-(--bg) px-4 py-3'>
                <p className='text-[12px] font-bold tracking-[0.18em] text-(--text-muted) uppercase'>
                  Total
                </p>
                <p className='mt-1 text-base font-semibold text-(--text-primary)'>
                  {total.toLocaleString()}
                </p>
              </div>

              <div className='rounded-2xl border border-(--border) bg-(--bg) px-4 py-3'>
                <p className='text-[12px] font-bold tracking-[0.18em] text-(--text-muted) uppercase'>
                  Open
                </p>
                <p className='mt-1 text-base font-semibold text-(--text-primary)'>
                  {summary?.open?.toLocaleString() ?? '0'}
                </p>
              </div>

              <div className='rounded-2xl border border-(--border) bg-(--bg) px-4 py-3'>
                <p className='text-[12px] font-bold tracking-[0.18em] text-(--text-muted) uppercase'>
                  Close
                </p>
                <p className='mt-1 text-base font-semibold text-(--text-primary)'>
                  {summary?.close?.toLocaleString() ?? '0'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* ═══ Filter Bar ═══ */}
        <div className='border-b border-(--border) bg-(--surface) p-4 md:p-5'>
          <div className='space-y-3'>
            {/* Search */}
            <form
              onSubmit={handleSearch}
              className='relative max-w-3xl min-w-0'
            >
              <Search className='absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-(--text-muted)' />
              <input
                type='text'
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder='Cari incident, pelanggan...'
                className='w-full rounded-xl border border-(--border) bg-(--surface-2) py-2.5 pr-3 pl-9 text-sm text-(--text-primary) transition-shadow outline-none placeholder:text-(--text-muted) focus:ring-2 focus:ring-blue-500/20'
              />
            </form>

            <div className='flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between'>
              <div className='flex flex-wrap items-center gap-3'>
                <BranchFilterSelect className='py-2.5' />

                <div className='flex items-center gap-1.5 rounded-2xl border border-(--border) bg-(--surface-2) px-3 py-2'>
                  <span className='mr-1 text-[11px] font-semibold tracking-wider text-(--text-muted) uppercase'>
                    Dept:
                  </span>

                  {DEPT_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => handleDeptChange(opt.value)}
                      className={clsx(
                        'rounded-md px-3 py-1.5 text-xs font-semibold transition-all duration-150',
                        dept === opt.value
                          ? opt.tone
                          : 'bg-(--surface) text-(--text-secondary) hover:bg-(--surface-3) hover:text-(--text-primary)',
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>

                <div className='flex items-center gap-1.5 rounded-2xl border border-(--border) bg-(--surface-2) px-3 py-2'>
                  <span className='mr-1 text-[11px] font-semibold tracking-wider text-(--text-muted) uppercase'>
                    Status:
                  </span>

                  {STATUS_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() =>
                        handleStatusChange(
                          opt.value as 'all' | 'open' | 'close' | 'assigned',
                        )
                      }
                      className={clsx(
                        'rounded-md px-3 py-1.5 text-xs font-semibold transition-all duration-150',
                        status === opt.value
                          ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/20'
                          : 'bg-(--surface) text-(--text-secondary) hover:bg-(--surface-3) hover:text-(--text-primary)',
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className='flex items-center gap-2 self-start xl:self-auto'>
                <button
                  onClick={() => handleExport('xlsx')}
                  className='flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition-all hover:bg-emerald-700 active:scale-95'
                >
                  <Download className='h-3.5 w-3.5' />
                  XLSX
                </button>

                <button
                  onClick={() => handleExport('csv')}
                  className='flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition-all hover:bg-emerald-700 active:scale-95'
                >
                  <Download className='h-3.5 w-3.5' />
                  CSV
                </button>

                <button
                  onClick={() => refetch()}
                  disabled={isFetching}
                  className='flex items-center gap-1.5 rounded-lg border border-(--border) bg-(--surface-2) px-3 py-1.5 text-xs font-medium text-(--text-secondary) transition-all hover:bg-(--surface-3) hover:text-(--text-primary) active:scale-95 disabled:opacity-50'
                >
                  <RefreshCw
                    className={clsx(
                      'h-3.5 w-3.5',
                      isFetching && 'animate-spin',
                    )}
                  />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ Summary Stats ═══ */}
      {summary && !isLoading && (
        <div className='rounded-3xl border border-(--border) bg-(--surface) p-4 shadow-sm'>
          <div className='flex flex-wrap items-center gap-4'>
            <div className='flex items-center gap-2.5 rounded-lg border border-(--border) bg-(--bg) px-3 py-2'>
              <ListOrdered className='h-4 w-4 text-(--text-muted)' />
              <span className='text-xs font-medium text-(--text-muted)'>
                Total
              </span>
              <span className='text-lg font-bold text-(--text-primary)'>
                {summary.total.toLocaleString()}
              </span>
            </div>

            <div className='flex items-center gap-2.5 rounded-lg border border-(--border) bg-(--bg) px-3 py-2'>
              <span className='h-2 w-2 rounded-full bg-amber-500' />
              <span className='text-xs font-medium text-(--text-muted)'>
                Open
              </span>
              <span className='text-base font-bold text-amber-600 dark:text-amber-400'>
                {summary.open.toLocaleString()}
              </span>
            </div>

            <div className='flex items-center gap-2.5 rounded-lg border border-(--border) bg-(--bg) px-3 py-2'>
              <span className='h-2 w-2 rounded-full bg-blue-500' />
              <span className='text-xs font-medium text-(--text-muted)'>
                Assigned
              </span>
              <span className='text-base font-bold text-blue-600 dark:text-blue-400'>
                {summary.assigned.toLocaleString()}
              </span>
            </div>

            <div className='flex items-center gap-2.5 rounded-lg border border-(--border) bg-(--bg) px-3 py-2'>
              <span className='h-2 w-2 rounded-full bg-emerald-500' />
              <span className='text-xs font-medium text-(--text-muted)'>
                Close
              </span>
              <span className='text-base font-bold text-emerald-600 dark:text-emerald-400'>
                {summary.close.toLocaleString()}
              </span>
            </div>
          </div>

          {/* Progress bar */}
          {summary.total > 0 && (
            <div className='mt-3 flex h-1.5 w-full overflow-hidden rounded-full bg-(--surface-3)'>
              <div
                className='h-full bg-amber-500 transition-all duration-700'
                style={{ width: `${(summary.open / summary.total) * 100}%` }}
              />
              <div
                className='h-full bg-blue-500 transition-all duration-700'
                style={{
                  width: `${(summary.assigned / summary.total) * 100}%`,
                }}
              />
              <div
                className='h-full bg-emerald-500 transition-all duration-700'
                style={{ width: `${(summary.close / summary.total) * 100}%` }}
              />
            </div>
          )}
        </div>
      )}

      {/* ═══ Info Bar ═══ */}
      {!isLoading && !isError && (
        <div className='flex items-center justify-between px-1 text-[11px] text-(--text-muted)'>
          <span className='flex items-center gap-1.5'>
            <Clock className='h-3 w-3' />
            {page === 1 ? '1' : `${(page - 1) * limit + 1}`}–
            {Math.min(page * limit, total)} dari{' '}
            <strong className='text-(--text-secondary)'>
              {total.toLocaleString()}
            </strong>{' '}
            tiket
          </span>

          {isFetching && (
            <span className='flex items-center gap-1.5'>
              <RefreshCw className='h-3 w-3 animate-spin' />
              Memperbarui...
            </span>
          )}
        </div>
      )}

      {/* ═══ Loading ═══ */}
      {isLoading && <LoadingState />}

      {/* ═══ Error ═══ */}
      {isError && !isLoading && (
        <div className='flex flex-col items-center justify-center gap-4 py-24'>
          <div className='rounded-full bg-red-500/10 p-4'>
            <AlertCircle className='h-8 w-8 text-red-500' />
          </div>

          <p className='text-sm font-medium text-(--text-secondary)'>
            {error?.message || 'Gagal memuat data'}
          </p>

          <button
            onClick={() => refetch()}
            className='rounded-lg bg-blue-600 px-5 py-2 text-xs font-semibold text-white transition-all hover:bg-blue-700 active:scale-95'
          >
            Coba Lagi
          </button>
        </div>
      )}

      {/* ═══ Table with 4 Frozen Left Columns ═══ */}
      {!isLoading && !isError && (
        <div className='relative overflow-auto rounded-3xl border border-(--border) bg-(--surface) shadow-sm'>
          <table className='w-full min-w-1050 table-fixed border-separate border-spacing-0 text-xs'>
            <colgroup>
              {COLUMN_WIDTHS.map((width, i) => (
                <col key={i} style={{ width }} />
              ))}
            </colgroup>

            <thead>
              <tr>
                {COLUMNS.map((col, i) => {
                  const isFrozen = i < 4;
                  const isFrozenEdge = i === 3;

                  return (
                    <th
                      key={i}
                      className={clsx(
                        'sticky top-0 border-r border-b border-(--border) bg-(--surface-2) px-3 py-3 text-left text-[10px] font-semibold tracking-wider whitespace-nowrap text-(--text-muted) uppercase last:border-r-0',
                        isFrozen ? 'z-70' : 'z-50',
                        isFrozen && FROZEN_COL_WIDTHS[i],
                        isFrozenEdge &&
                          'shadow-[14px_0_24px_-20px_rgba(15,23,42,0.55)] dark:shadow-[14px_0_24px_-20px_rgba(2,6,23,0.85)]',
                      )}
                      style={{
                        left: isFrozen ? getFrozenLeft(i) : undefined,
                        backgroundColor: 'var(--surface-2)',
                      }}
                    >
                      {col}
                    </th>
                  );
                })}
              </tr>
            </thead>

            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={COLUMNS.length}
                    className='px-3 py-16 text-center text-sm text-(--text-muted)'
                  >
                    <div className='flex flex-col items-center gap-2'>
                      <ListOrdered className='h-6 w-6 opacity-40' />
                      <span>Tidak ada data</span>
                    </div>
                  </td>
                </tr>
              ) : (
                rows.map((row, rowIdx) => (
                  <tr
                    key={rowIdx}
                    className={clsx(
                      'transition-colors hover:bg-(--surface-2)',
                      rowIdx % 2 === 1 && 'bg-(--surface-2)/30',
                    )}
                  >
                    {COLUMNS.map((_, cellIdx) => {
                      const cell = row[cellIdx] ?? '';
                      const isAgeCol = cellIdx === 0;
                      const isIncidentCol = cellIdx === 1;
                      const isFrozen = cellIdx < 4;
                      const isFrozenEdge = cellIdx === 3;
                      const isStatusClosing = cellIdx === 19;
                      const isStatusUpdate = cellIdx === 14;

                      return (
                        <td
                          key={cellIdx}
                          title={cell}
                          className={clsx(
                            'border-r border-b border-(--border) px-3 py-2.5 whitespace-nowrap last:border-r-0',
                            'max-w-62.5 overflow-hidden text-ellipsis',
                            isFrozen && 'sticky z-40',
                            isFrozen && FROZEN_COL_WIDTHS[cellIdx],
                            isFrozenEdge &&
                              'shadow-[14px_0_24px_-20px_rgba(15,23,42,0.55)] dark:shadow-[14px_0_24px_-20px_rgba(2,6,23,0.85)]',
                            isAgeCol && getAgeColor(cell),
                            isIncidentCol &&
                              'font-mono font-medium text-blue-700 dark:text-blue-300',
                          )}
                          style={
                            isFrozen
                              ? {
                                  left: getFrozenLeft(cellIdx),
                                  backgroundColor:
                                    getFrozenCellBackground(rowIdx),
                                }
                              : undefined
                          }
                        >
                          {isStatusClosing ? (
                            <span
                              className={clsx(
                                'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold',
                                cell === 'CLOSE'
                                  ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                                  : 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
                              )}
                            >
                              <span
                                className={clsx(
                                  'h-1.5 w-1.5 rounded-full',
                                  cell === 'CLOSE'
                                    ? 'bg-emerald-500'
                                    : 'bg-amber-500',
                                )}
                              />
                              {cell || '-'}
                            </span>
                          ) : isStatusUpdate ? (
                            <span className='capitalize'>{cell || '-'}</span>
                          ) : (
                            <span className='text-(--text-primary)'>
                              {cell || '-'}
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ═══ Pagination ═══ */}
      {totalPages > 1 && (
        <div className='flex items-center justify-between rounded-xl border border-(--border) bg-(--surface) px-4 py-3'>
          <span className='text-xs text-(--text-muted)'>
            Halaman <strong className='text-(--text-secondary)'>{page}</strong>{' '}
            dari{' '}
            <strong className='text-(--text-secondary)'>{totalPages}</strong>
          </span>

          <div className='flex items-center gap-2'>
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className='flex items-center gap-1 rounded-lg border border-(--border) bg-(--surface) px-3 py-2 text-xs font-medium text-(--text-secondary) transition-all hover:bg-(--surface-2) hover:text-(--text-primary) active:scale-95 disabled:pointer-events-none disabled:opacity-40'
            >
              <ChevronLeft className='h-3.5 w-3.5' />
              Prev
            </button>

            <span className='flex items-center gap-1 px-2'>
              {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                let pageNum: number;

                if (totalPages <= 5) {
                  pageNum = i + 1;
                } else if (page <= 3) {
                  pageNum = i + 1;
                } else if (page >= totalPages - 2) {
                  pageNum = totalPages - 4 + i;
                } else {
                  pageNum = page - 2 + i;
                }

                return (
                  <button
                    key={pageNum}
                    onClick={() => setPage(pageNum)}
                    className={clsx(
                      'flex h-8 w-8 items-center justify-center rounded-lg text-xs font-semibold transition-all',
                      page === pageNum
                        ? 'bg-blue-600 text-white'
                        : 'text-(--text-secondary) hover:bg-(--surface-2) hover:text-(--text-primary)',
                    )}
                  >
                    {pageNum}
                  </button>
                );
              })}
            </span>

            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className='flex items-center gap-1 rounded-lg border border-(--border) bg-(--surface) px-3 py-2 text-xs font-medium text-(--text-secondary) transition-all hover:bg-(--surface-2) hover:text-(--text-primary) active:scale-95 disabled:pointer-events-none disabled:opacity-40'
            >
              Next
              <ChevronRight className='h-3.5 w-3.5' />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
