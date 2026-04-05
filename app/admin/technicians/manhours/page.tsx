'use client';

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import {
  Download,
  Search,
  Calendar,
  TrendingUp,
  Users,
  Clock,
  Award,
  Upload,
  X,
  Loader2,
} from 'lucide-react';
import AdminLayout from '@/app/components/layout/AdminLayout';
import Button from '@/app/components/ui/Button';
import { fetchWithAuth } from '@/app/libs/fetcher';

/**
 * Types
 */
interface ManhourConfig {
  jenis_key: string;
  label: string;
  manhours: number;
  sort_order: number;
}

interface ManhoursRow {
  technician_id: number;
  nama: string | null;
  nik: string | null;
  sto: string;
  categories: Record<string, number>;
  total_tickets: number;
  realisasi: number;
  hari_kerja: number;
  produktivitas: number;
  target: number;
}

interface ApiResponse {
  success: boolean;
  rows: ManhoursRow[];
  configs: ManhourConfig[];
  stoOptions: { value: string; label: string }[];
  dateFrom: string;
  dateTo: string;
  message?: string;
}

interface FilterState {
  name: string;
  sto: string;
  dateFrom: string;
  dateTo: string;
}

/**
 * Loading Skeleton
 */
function LoadingSkeleton() {
  return (
    <div className='space-y-4'>
      <div className='animate-pulse rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-800'>
        <div className='h-4 w-32 rounded bg-slate-200 dark:bg-slate-700' />
        <div className='mt-4 space-y-2'>
          <div className='h-3 w-full rounded bg-slate-200 dark:bg-slate-700' />
          <div className='h-3 w-3/4 rounded bg-slate-200 dark:bg-slate-700' />
        </div>
      </div>
      {[...Array(5)].map((_, i) => (
        <div
          key={i}
          className='animate-pulse rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800'
        >
          <div className='h-4 w-full rounded bg-slate-200 dark:bg-slate-700' />
        </div>
      ))}
    </div>
  );
}

/**
 * Empty State
 */
function EmptyState({ message }: { message: string }) {
  return (
    <div className='flex flex-col items-center justify-center py-16 text-center'>
      <Calendar className='h-16 w-16 text-slate-300 dark:text-slate-600' />
      <h3 className='mt-4 text-lg font-medium text-slate-600 dark:text-slate-300'>
        Tidak ada data
      </h3>
      <p className='mt-1 text-sm text-slate-400 dark:text-slate-500'>
        {message}
      </p>
    </div>
  );
}

/**
 * Summary Stats Card
 */
function SummaryCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: any;
  label: string;
  value: string | number;
  color: string;
}) {
  return (
    <div className='rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800'>
      <div className='flex items-center gap-3'>
        <div className={`rounded-lg p-2 ${color}`}>
          <Icon size={20} className='text-white' />
        </div>
        <div>
          <p className='text-xs font-medium text-slate-500 dark:text-slate-400'>
            {label}
          </p>
          <p className='text-xl font-bold text-slate-800 dark:text-slate-100'>
            {value}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function ManHoursPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ApiResponse | null>(null);

  const [filters, setFilters] = useState<FilterState>(() => {
    const today = new Date();
    const firstDay = startOfMonth(today);
    return {
      name: '',
      sto: '',
      dateFrom: format(firstDay, 'yyyy-MM-dd'),
      dateTo: format(today, 'yyyy-MM-dd'),
    };
  });

  const [showImportModal, setShowImportModal] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    success: boolean;
    message: string;
    inserted: number;
    updated: number;
    skipped: number;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /**
   * Fetch data from API
   */
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        date_from: filters.dateFrom,
        date_to: filters.dateTo,
      });

      if (filters.sto) params.append('sto', filters.sto);
      if (filters.name) params.append('name', filters.name);

      const res = await fetchWithAuth(`/api/technicians/manhours?${params}`);

      if (!res) {
        throw new Error('Tidak ada respon dari server');
      }

      if (!res.ok) {
        const errorData = await res.json().catch(() => null);
        throw new Error(errorData?.message || `Error ${res.status}`);
      }

      const jsonData: ApiResponse = await res.json();

      if (!jsonData.success) {
        throw new Error(jsonData.message || 'Gagal mengambil data');
      }

      setData(jsonData);
    } catch (err: any) {
      setError(err.message || 'Terjadi kesalahan saat mengambil data');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [filters.dateFrom, filters.dateTo, filters.sto, filters.name]);

  // Initial fetch
  useEffect(() => {
    fetchData();
  }, []);

  /**
   * Handle filter changes
   */
  const handleFilterChange = useCallback(
    (key: keyof FilterState, value: string) => {
      setFilters((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  /**
   * Handle search/apply filters
   */
  const handleApplyFilters = useCallback(() => {
    fetchData();
  }, [fetchData]);

  /**
   * Handle export to CSV
   */
  const handleExport = useCallback(() => {
    const params = new URLSearchParams({
      date_from: filters.dateFrom,
      date_to: filters.dateTo,
    });

    if (filters.sto) params.append('sto', filters.sto);
    if (filters.name) params.append('name', filters.name);

    window.open(`/api/technicians/manhours/export?${params}`, '_blank');
  }, [filters]);

  /**
   * Handle file selection for import
   */
  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setImporting(true);
      setImportResult(null);

      try {
        const formData = new FormData();
        formData.append('file', file);

        const res = await fetchWithAuth('/api/technicians/manhours/import', {
          method: 'POST',
          body: formData,
        });

        if (!res) {
          throw new Error('Tidak ada respon dari server');
        }

        const result = await res.json();

        setImportResult({
          success: result.success,
          message: result.message,
          inserted: result.inserted || 0,
          updated: result.updated || 0,
          skipped: result.skipped || 0,
        });

        if (result.success) {
          fetchData();
        }
      } catch (err: any) {
        setImportResult({
          success: false,
          message: err.message || 'Import gagal',
          inserted: 0,
          updated: 0,
          skipped: 0,
        });
      } finally {
        setImporting(false);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    },
    [fetchData],
  );

  /**
   * Open import modal
   */
  const handleOpenImport = useCallback(() => {
    setShowImportModal(true);
    setImportResult(null);
  }, []);

  /**
   * Close import modal
   */
  const handleCloseImport = useCallback(() => {
    setShowImportModal(false);
    setImportResult(null);
  }, []);

  /**
   * Calculate summary statistics
   */
  const summary = useMemo(() => {
    if (!data?.rows.length) {
      return {
        totalTeknisi: 0,
        totalTiket: 0,
        totalRealisasi: 0,
        avgProduktivitas: 0,
      };
    }

    const rows = data.rows;
    const totalTeknisi = rows.length;
    const totalTiket = rows.reduce((sum, r) => sum + r.total_tickets, 0);
    const totalRealisasi = rows.reduce((sum, r) => sum + r.realisasi, 0);
    const avgProduktivitas =
      rows.reduce((sum, r) => sum + r.produktivitas, 0) / rows.length;

    return {
      totalTeknisi,
      totalTiket,
      totalRealisasi: Math.round(totalRealisasi * 100) / 100,
      avgProduktivitas: Math.round(avgProduktivitas * 100) / 100,
    };
  }, [data?.rows]);

  /**
   * Dynamic table columns based on configs
   */
  const categoryColumns = useMemo(() => {
    if (!data?.configs) return [];
    return data.configs.sort((a, b) => a.sort_order - b.sort_order);
  }, [data?.configs]);

  return (
    <AdminLayout>
      <div className='space-y-6'>
        {/* Header */}
        <div className='flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between'>
          <div>
            <h1 className='text-xl font-semibold text-gray-800 sm:text-2xl dark:text-gray-100'>
              Produktivitas ManHours Teknisi
            </h1>
            <p className='text-sm text-gray-500 dark:text-gray-400'>
              Monitoring produktivitas berdasarkan realisasi manhours per
              kategori tiket
            </p>
          </div>
          <div className='flex items-center gap-2'>
            <Button onClick={handleOpenImport} variant='outline' size='sm'>
              <Upload size={16} className='mr-2' />
              Import Excel
            </Button>
            <Button onClick={handleExport} variant='outline' size='sm'>
              <Download size={16} className='mr-2' />
              Export CSV
            </Button>
          </div>
        </div>

        {/* Filter Section */}
        <div className='rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800'>
          <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5'>
            {/* Date From */}
            <div>
              <label className='mb-1.5 block text-xs font-semibold text-slate-600 uppercase dark:text-slate-300'>
                Dari Tanggal
              </label>
              <input
                type='date'
                value={filters.dateFrom}
                onChange={(e) => handleFilterChange('dateFrom', e.target.value)}
                className='w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:focus:border-teal-400'
              />
            </div>

            {/* Date To */}
            <div>
              <label className='mb-1.5 block text-xs font-semibold text-slate-600 uppercase dark:text-slate-300'>
                Sampai Tanggal
              </label>
              <input
                type='date'
                value={filters.dateTo}
                onChange={(e) => handleFilterChange('dateTo', e.target.value)}
                className='w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:focus:border-teal-400'
              />
            </div>

            {/* STO Filter */}
            <div>
              <label className='mb-1.5 block text-xs font-semibold text-slate-600 uppercase dark:text-slate-300'>
                STO
              </label>
              <select
                value={filters.sto}
                onChange={(e) => handleFilterChange('sto', e.target.value)}
                className='w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:focus:border-teal-400'
              >
                <option value=''>Semua STO</option>
                {data?.stoOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Name Search */}
            <div>
              <label className='mb-1.5 block text-xs font-semibold text-slate-600 uppercase dark:text-slate-300'>
                Nama Teknisi
              </label>
              <div className='relative'>
                <Search
                  size={16}
                  className='absolute top-1/2 right-3 -translate-y-1/2 text-slate-400'
                />
                <input
                  type='text'
                  placeholder='Cari nama...'
                  value={filters.name}
                  onChange={(e) => handleFilterChange('name', e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleApplyFilters()}
                  className='w-full rounded-lg border border-slate-200 bg-white px-3 py-2 pr-10 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:placeholder:text-slate-500 dark:focus:border-teal-400'
                />
              </div>
            </div>

            {/* Apply Button */}
            <div className='flex items-end'>
              <Button
                onClick={handleApplyFilters}
                disabled={loading}
                className='w-full bg-teal-600 hover:bg-teal-700'
              >
                {loading ? 'Loading...' : 'Tampilkan'}
              </Button>
            </div>
          </div>
        </div>

        {/* Summary Stats */}
        {data?.rows.length ? (
          <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4'>
            <SummaryCard
              icon={Users}
              label='Total Teknisi'
              value={summary.totalTeknisi}
              color='bg-blue-500'
            />
            <SummaryCard
              icon={Award}
              label='Total Tiket Closed'
              value={summary.totalTiket}
              color='bg-purple-500'
            />
            <SummaryCard
              icon={TrendingUp}
              label='Total Realisasi MH'
              value={summary.totalRealisasi}
              color='bg-green-500'
            />
            <SummaryCard
              icon={Clock}
              label='Rata-rata Produktivitas'
              value={`${summary.avgProduktivitas.toFixed(1)} tiket/hari`}
              color='bg-orange-500'
            />
          </div>
        ) : null}

        {/* Error State */}
        {error && (
          <div className='rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-500/30 dark:bg-red-500/10'>
            <p className='text-sm text-red-600 dark:text-red-400'>{error}</p>
            <Button
              variant='outline'
              size='sm'
              onClick={fetchData}
              className='mt-2'
            >
              Coba Lagi
            </Button>
          </div>
        )}

        {/* Data Table */}
        {loading ? (
          <LoadingSkeleton />
        ) : !data?.rows.length ? (
          <EmptyState message='Belum ada data manhours untuk periode yang dipilih' />
        ) : (
          <div className='overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800'>
            <table className='min-w-full divide-y divide-slate-200 dark:divide-slate-700'>
              <thead className='bg-teal-500'>
                <tr>
                  <th className='sticky top-0 px-4 py-3 text-left text-xs font-bold tracking-wide text-white uppercase'>
                    No
                  </th>
                  <th className='sticky top-0 px-4 py-3 text-left text-xs font-bold tracking-wide text-white uppercase'>
                    Nama
                  </th>
                  <th className='sticky top-0 px-4 py-3 text-left text-xs font-bold tracking-wide text-white uppercase'>
                    STO
                  </th>
                  {categoryColumns.map((col) => (
                    <th
                      key={col.jenis_key}
                      className='sticky top-0 px-4 py-3 text-center text-xs font-bold tracking-wide text-white uppercase'
                    >
                      {col.label}
                    </th>
                  ))}
                  <th className='sticky top-0 px-4 py-3 text-center text-xs font-bold tracking-wide text-white uppercase'>
                    Total Tiket
                  </th>
                  <th className='sticky top-0 px-4 py-3 text-center text-xs font-bold tracking-wide text-white uppercase'>
                    <div className='flex flex-col items-center gap-0.5'>
                      <span>Produktivitas</span>
                      <span className='text-[9px] font-normal text-teal-200 normal-case'>
                        tiket / hari kerja
                      </span>
                    </div>
                  </th>
                  <th className='sticky top-0 px-4 py-3 text-center text-xs font-bold tracking-wide text-white uppercase'>
                    Target
                  </th>
                  <th className='sticky top-0 px-4 py-3 text-center text-xs font-bold tracking-wide text-white uppercase'>
                    Realisasi
                  </th>
                  <th className='sticky top-0 px-4 py-3 text-center text-xs font-bold tracking-wide text-white uppercase'>
                    Hari Kerja
                  </th>
                </tr>
              </thead>
              <tbody className='divide-y divide-slate-200 dark:divide-slate-700'>
                {data.rows.map((row, idx) => (
                  <tr
                    key={row.technician_id}
                    className='hover:bg-slate-50 dark:hover:bg-slate-700/50'
                  >
                    <td className='px-4 py-3 text-sm font-medium text-slate-700 dark:text-slate-300'>
                      {idx + 1}
                    </td>
                    <td className='px-4 py-3 text-sm'>
                      <div className='font-medium text-slate-800 dark:text-slate-100'>
                        {row.nama || 'N/A'}
                      </div>
                      {row.nik && (
                        <div className='text-xs text-slate-500 dark:text-slate-400'>
                          {row.nik}
                        </div>
                      )}
                    </td>
                    <td className='px-4 py-3 text-sm text-slate-700 dark:text-slate-300'>
                      {row.sto}
                    </td>
                    {categoryColumns.map((col) => (
                      <td
                        key={col.jenis_key}
                        className='px-4 py-3 text-center text-sm text-slate-700 dark:text-slate-300'
                      >
                        {row.categories[col.jenis_key] || 0}
                      </td>
                    ))}
                    <td className='px-4 py-3 text-center text-sm font-medium text-slate-700 dark:text-slate-300'>
                      {row.total_tickets}
                    </td>
                    <td className='px-4 py-3 text-center'>
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          row.produktivitas >= 20
                            ? 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400'
                            : row.produktivitas >= 10
                              ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-500/15 dark:text-yellow-400'
                              : 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400'
                        }`}
                      >
                        {row.produktivitas.toFixed(2)}
                      </span>
                    </td>
                    <td className='px-4 py-3 text-center text-sm text-slate-700 dark:text-slate-300'>
                      {row.target}
                    </td>
                    <td className='px-4 py-3 text-center text-sm font-semibold text-slate-800 dark:text-slate-100'>
                      {row.realisasi}
                    </td>
                    <td className='px-4 py-3 text-center text-sm text-slate-700 dark:text-slate-300'>
                      {row.hari_kerja} hari
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Import Modal */}
      {showImportModal && (
        <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/50'>
          <div className='w-full max-w-md rounded-xl bg-white p-6 shadow-xl dark:bg-slate-800'>
            <div className='mb-4 flex items-center justify-between'>
              <h2 className='text-lg font-semibold text-gray-800 dark:text-gray-100'>
                Import Data Historis dari Excel
              </h2>
              <button
                onClick={handleCloseImport}
                className='rounded-lg p-1 hover:bg-slate-100 dark:hover:bg-slate-700'
              >
                <X size={20} className='text-slate-500' />
              </button>
            </div>

            <div className='space-y-4'>
              <div className='rounded-lg border-2 border-dashed border-slate-300 p-6 text-center dark:border-slate-600'>
                <input
                  ref={fileInputRef}
                  type='file'
                  accept='.xlsx,.xls,.csv'
                  onChange={handleFileSelect}
                  className='hidden'
                  id='import-file'
                />
                <label
                  htmlFor='import-file'
                  className='flex cursor-pointer flex-col items-center'
                >
                  {importing ? (
                    <>
                      <Loader2
                        size={40}
                        className='animate-spin text-teal-500'
                      />
                      <p className='mt-2 text-sm text-slate-500'>
                        Mengimport data...
                      </p>
                    </>
                  ) : (
                    <>
                      <Upload size={40} className='text-slate-400' />
                      <p className='mt-2 text-sm text-slate-600 dark:text-slate-300'>
                        Klik untuk upload file Excel
                      </p>
                      <p className='text-xs text-slate-400'>
                        Format: .xlsx, .xls, .csv
                      </p>
                    </>
                  )}
                </label>
              </div>

              {importResult && (
                <div
                  className={`rounded-lg p-4 ${
                    importResult.success
                      ? 'border border-green-200 bg-green-50'
                      : 'border border-red-200 bg-red-50'
                  }`}
                >
                  <p
                    className={`font-medium ${
                      importResult.success ? 'text-green-700' : 'text-red-700'
                    }`}
                  >
                    {importResult.success ? '✅ Berhasil' : '❌ Gagal'}
                  </p>
                  <p className='mt-1 text-sm text-slate-600 dark:text-slate-300'>
                    {importResult.message}
                  </p>
                  {importResult.success && (
                    <div className='mt-2 text-xs text-slate-500'>
                      <p>Inserted: {importResult.inserted}</p>
                      <p>Updated: {importResult.updated}</p>
                      <p>Skipped: {importResult.skipped}</p>
                    </div>
                  )}
                </div>
              )}

              <div className='space-y-1 text-xs text-slate-500'>
                <p className='font-medium'>Kolom yang diperlukan:</p>
                <p>• INCIDENT (Primary Key)</p>
                <p>• DATEMODIFIED (untuk sync_date)</p>
                <p className='italic'>
                  Kolom sensitif (rca, sub_rca) tidak akan diupdate jika sudah
                  ada
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
