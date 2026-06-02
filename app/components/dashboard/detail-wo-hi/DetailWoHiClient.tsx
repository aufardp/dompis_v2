'use client';

import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Search,
  RefreshCw,
  Download,
  ChevronLeft,
  ChevronRight,
  Loader2,
  AlertCircle,
  ListOrdered,
  Clock,
} from 'lucide-react';

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
  'JENIS TIKET2',
  'STATUS GAUL',
  'DURASI TIKET',
  'STATUS CLOSING',
  'TTR',
  'ALAMAT',
  'TEKNISI 1',
  'LABOR CODE 1',
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
];

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

export default function DetailWoHiClient() {
  const [search, setSearch] = useState('');
  const [dept, setDept] = useState('all');
  const [page, setPage] = useState(1);
  const limit = 100;

  const queryParams = new URLSearchParams();
  if (search) queryParams.set('search', search);
  if (dept !== 'all') queryParams.set('dept', dept);
  queryParams.set('page', String(page));
  queryParams.set('limit', String(limit));

  const { data, isLoading, isError, error, refetch, isFetching } =
    useQuery<DetailResponse>({
      queryKey: ['detail-wo-hi', search, dept, page],
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
    setDept(value);
    setPage(1);
  }, []);

  const handleExport = useCallback(
    async (format: 'xlsx' | 'csv') => {
      const queryParams = new URLSearchParams();
      if (search) queryParams.set('search', search);
      if (dept !== 'all') queryParams.set('dept', dept);
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
        const ext = format;
        const today = new Date().toISOString().slice(0, 10);
        a.download = `Detail_WO_HI_${today}.${ext}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch {
        alert('Export gagal. Coba lagi.');
      }
    },
    [search, dept],
  );

  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;
  const rows = data?.data ?? [];
  const summary = data?.summary;

  return (
    <div className='space-y-4'>
      {/* ═══ Filter Bar ═══ */}
      <div className='rounded-xl border border-(--border) bg-(--surface) p-4'>
        <div className='flex flex-wrap items-center gap-3'>
          {/* Search */}
          <form
            onSubmit={handleSearch}
            className='relative max-w-sm min-w-50 flex-1'
          >
            <Search className='absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-(--text-muted)' />
            <input
              type='text'
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder='Cari incident, pelanggan...'
              className='w-full rounded-lg border border-(--border) bg-(--surface) py-2 pr-3 pl-9 text-sm text-(--text-primary) ring-1 ring-(--border) transition-shadow outline-none placeholder:text-(--text-muted) focus:border-(--accent) focus:ring-2 focus:ring-(--accent)'
            />
          </form>

          {/* Dept chips */}
          <div className='flex items-center gap-1.5'>
            <span className='mr-1 text-[11px] font-semibold tracking-wider text-(--text-muted) uppercase'>
              Dept:
            </span>
            {DEPT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => handleDeptChange(opt.value)}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-all duration-150 ${
                  dept === opt.value
                    ? opt.tone
                    : 'bg-(--surface-2) text-(--text-secondary) hover:bg-(--surface-3) hover:text-(--text-primary)'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Spacer */}
          <div className='flex-1' />

          {/* Actions */}
          <div className='flex items-center gap-2'>
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
                className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`}
              />
            </button>
          </div>
        </div>
      </div>

      {/* ═══ Summary Stats ═══ */}
      {summary && !isLoading && (
        <div className='rounded-xl border border-(--border) bg-(--surface) p-4'>
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
            {page === 1 ? `1` : `${(page - 1) * limit + 1}`}–
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
      {isLoading && (
        <div className='flex flex-col items-center justify-center gap-3 py-24'>
          <Loader2 className='h-10 w-10 animate-spin text-(--text-muted)' />
          <p className='text-sm text-(--text-secondary)'>Memuat data...</p>
        </div>
      )}

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
            className='rounded-lg bg-(--accent) px-5 py-2 text-xs font-semibold text-white transition-all hover:opacity-90 active:scale-95'
          >
            Coba Lagi
          </button>
        </div>
      )}

      {/* ═══ Table ═══ */}
      {!isLoading && !isError && (
        <div className='overflow-x-auto rounded-xl border border-(--border) bg-(--surface)'>
          <table className='w-full min-w-max text-xs'>
            <thead>
              <tr className='border-b border-(--border)'>
                {COLUMNS.map((col, i) => (
                  <th
                    key={i}
                    className='sticky top-0 z-10 border-r border-(--border) bg-(--surface-2) px-3 py-3 text-left text-[10px] font-semibold tracking-wider whitespace-nowrap text-(--text-muted) uppercase last:border-r-0'
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className='divide-y divide-(--border)'>
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
                    className={`transition-colors hover:bg-(--surface-2) ${
                      rowIdx % 2 === 1 ? 'bg-(--surface-2)/30' : ''
                    }`}
                  >
                    {row.map((cell, cellIdx) => {
                      const isAgeCol = cellIdx === 0;
                      const isIncidentCol = cellIdx === 1;
                      const isStatusClosing = cellIdx === 19;
                      const isStatusUpdate = cellIdx === 14;
                      const isTicketStatusClosing = cellIdx === 19;

                      let cellClass =
                        'whitespace-nowrap px-3 py-2.5 border-r border-(--border) last:border-r-0 max-w-[250px] overflow-hidden text-ellipsis';

                      // Age coloring
                      if (isAgeCol) {
                        cellClass += ` ${getAgeColor(cell)}`;
                      }

                      // Incident styling
                      if (isIncidentCol) {
                        cellClass += ' font-mono font-medium text-(--accent)';
                      }

                      return (
                        <td key={cellIdx} className={cellClass} title={cell}>
                          {isStatusClosing ? (
                            <span
                              className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                                cell === 'CLOSE'
                                  ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                                  : 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                              }`}
                            >
                              <span
                                className={`h-1.5 w-1.5 rounded-full ${
                                  cell === 'CLOSE'
                                    ? 'bg-emerald-500'
                                    : 'bg-amber-500'
                                }`}
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
                    className={`flex h-8 w-8 items-center justify-center rounded-lg text-xs font-semibold transition-all ${
                      page === pageNum
                        ? 'bg-(--accent) text-white'
                        : 'text-(--text-secondary) hover:bg-(--surface-2) hover:text-(--text-primary)'
                    }`}
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
