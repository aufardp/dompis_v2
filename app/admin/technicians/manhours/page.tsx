'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { Download, Search, Calendar, TrendingUp, Users, Clock, Award } from 'lucide-react';
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
  jam_efektif: number;
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
      <div className='animate-pulse rounded-xl border border-slate-200 bg-white p-6'>
        <div className='h-4 w-32 rounded bg-slate-200' />
        <div className='mt-4 space-y-2'>
          <div className='h-3 w-full rounded bg-slate-200' />
          <div className='h-3 w-3/4 rounded bg-slate-200' />
        </div>
      </div>
      {[...Array(5)].map((_, i) => (
        <div
          key={i}
          className='animate-pulse rounded-xl border border-slate-200 bg-white p-4'
        >
          <div className='h-4 w-full rounded bg-slate-200' />
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
      <Calendar className='h-16 w-16 text-slate-300' />
      <h3 className='mt-4 text-lg font-medium text-slate-600'>Tidak ada data</h3>
      <p className='mt-1 text-sm text-slate-400'>{message}</p>
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
    <div className='rounded-xl border border-slate-200 bg-white p-5'>
      <div className='flex items-center gap-3'>
        <div className={`rounded-lg p-2 ${color}`}>
          <Icon size={20} className='text-white' />
        </div>
        <div>
          <p className='text-xs font-medium text-slate-500'>{label}</p>
          <p className='text-xl font-bold text-slate-800'>{value}</p>
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
            <h1 className='text-xl font-semibold text-gray-800 sm:text-2xl'>
              Produktivitas ManHours Teknisi
            </h1>
            <p className='text-sm text-gray-500'>
              Monitoring produktivitas berdasarkan realisasi manhours per kategori
              tiket
            </p>
          </div>
          <div className='flex items-center gap-2'>
            <Button onClick={handleExport} variant='outline' size='sm'>
              <Download size={16} className='mr-2' />
              Export CSV
            </Button>
          </div>
        </div>

        {/* Filter Section */}
        <div className='rounded-xl border border-slate-200 bg-white p-5'>
          <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5'>
            {/* Date From */}
            <div>
              <label className='mb-1.5 block text-xs font-semibold text-slate-600 uppercase'>
                Dari Tanggal
              </label>
              <input
                type='date'
                value={filters.dateFrom}
                onChange={(e) =>
                  handleFilterChange('dateFrom', e.target.value)
                }
                className='w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500'
              />
            </div>

            {/* Date To */}
            <div>
              <label className='mb-1.5 block text-xs font-semibold text-slate-600 uppercase'>
                Sampai Tanggal
              </label>
              <input
                type='date'
                value={filters.dateTo}
                onChange={(e) => handleFilterChange('dateTo', e.target.value)}
                className='w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500'
              />
            </div>

            {/* STO Filter */}
            <div>
              <label className='mb-1.5 block text-xs font-semibold text-slate-600 uppercase'>
                STO
              </label>
              <select
                value={filters.sto}
                onChange={(e) => handleFilterChange('sto', e.target.value)}
                className='w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500'
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
              <label className='mb-1.5 block text-xs font-semibold text-slate-600 uppercase'>
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
                  className='w-full rounded-lg border border-slate-200 px-3 py-2 pr-10 text-sm outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500'
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
              value={summary.avgProduktivitas.toFixed(2)}
              color='bg-orange-500'
            />
          </div>
        ) : null}

        {/* Error State */}
        {error && (
          <div className='rounded-xl border border-red-200 bg-red-50 p-4'>
            <p className='text-sm text-red-600'>{error}</p>
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
          <div className='overflow-x-auto rounded-xl border border-slate-200 bg-white'>
            <table className='min-w-full divide-y divide-slate-200'>
              <thead className='bg-teal-500'>
                <tr>
                  <th className='sticky top-0 px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-white'>
                    No
                  </th>
                  <th className='sticky top-0 px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-white'>
                    Nama
                  </th>
                  <th className='sticky top-0 px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-white'>
                    STO
                  </th>
                  {categoryColumns.map((col) => (
                    <th
                      key={col.jenis_key}
                      className='sticky top-0 px-4 py-3 text-center text-xs font-bold uppercase tracking-wide text-white'
                    >
                      {col.label}
                    </th>
                  ))}
                  <th className='sticky top-0 px-4 py-3 text-center text-xs font-bold uppercase tracking-wide text-white'>
                    Total Tiket
                  </th>
                  <th className='sticky top-0 px-4 py-3 text-center text-xs font-bold uppercase tracking-wide text-white'>
                    Produktivitas
                  </th>
                  <th className='sticky top-0 px-4 py-3 text-center text-xs font-bold uppercase tracking-wide text-white'>
                    Target
                  </th>
                  <th className='sticky top-0 px-4 py-3 text-center text-xs font-bold uppercase tracking-wide text-white'>
                    Realisasi
                  </th>
                  <th className='sticky top-0 px-4 py-3 text-center text-xs font-bold uppercase tracking-wide text-white'>
                    Jam Efektif
                  </th>
                </tr>
              </thead>
              <tbody className='divide-y divide-slate-200'>
                {data.rows.map((row, idx) => (
                  <tr
                    key={row.technician_id}
                    className='hover:bg-slate-50'
                  >
                    <td className='px-4 py-3 text-sm font-medium text-slate-700'>
                      {idx + 1}
                    </td>
                    <td className='px-4 py-3 text-sm'>
                      <div className='font-medium text-slate-800'>
                        {row.nama || 'N/A'}
                      </div>
                      {row.nik && (
                        <div className='text-xs text-slate-500'>{row.nik}</div>
                      )}
                    </td>
                    <td className='px-4 py-3 text-sm text-slate-700'>
                      {row.sto}
                    </td>
                    {categoryColumns.map((col) => (
                      <td
                        key={col.jenis_key}
                        className='px-4 py-3 text-center text-sm text-slate-700'
                      >
                        {row.categories[col.jenis_key] || 0}
                      </td>
                    ))}
                    <td className='px-4 py-3 text-center text-sm font-medium text-slate-700'>
                      {row.total_tickets}
                    </td>
                    <td className='px-4 py-3 text-center'>
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          row.produktivitas >= 20
                            ? 'bg-green-100 text-green-700'
                            : row.produktivitas >= 10
                              ? 'bg-yellow-100 text-yellow-700'
                              : 'bg-red-100 text-red-700'
                        }`}
                      >
                        {row.produktivitas.toFixed(2)}
                      </span>
                    </td>
                    <td className='px-4 py-3 text-center text-sm text-slate-700'>
                      {row.target}
                    </td>
                    <td className='px-4 py-3 text-center text-sm font-semibold text-slate-800'>
                      {row.realisasi}
                    </td>
                    <td className='px-4 py-3 text-center text-sm text-slate-700'>
                      {row.jam_efektif}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
