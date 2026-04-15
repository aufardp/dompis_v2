'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, Download, MapPin } from 'lucide-react';
import AdminLayout from '@/app/components/layout/AdminLayout';
import Button from '@/app/components/ui/Button';
import Select from '@/app/components/form/Select';
import { fetchWithAuth } from '@/app/libs/fetcher';
import { useAutoRefresh } from '@/app/hooks/useAutoRefresh';

const MONTHS = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

type PerfRow = {
  id_user: number;
  nama: string;
  nik: string | null;
  workzone: string;
  closed_count: number;
  avg_resolve_time_hours: number | null;
};

export default function TechnicianPerformancePage() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [workzone, setWorkzone] = useState('');

  const [rows, setRows] = useState<PerfRow[]>([]);
  const [userWorkzones, setUserWorkzones] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  // Detail Modal state
  const [detailModal, setDetailModal] = useState<{
    open: boolean;
    techName: string;
    techId: number | null;
    tickets: any[];
    loading: boolean;
  }>({ open: false, techName: '', techId: null, tickets: [], loading: false });

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        month: String(month),
        year: String(year),
      });
      if (workzone) params.set('workzone', workzone);

      const res = await fetchWithAuth(
        `/api/technicians/performance?${params.toString()}`,
      );
      if (!res || !res.ok) {
        const body = res ? await res.json().catch(() => null) : null;
        throw new Error(body?.message || 'Failed to load performance');
      }
      const json = await res.json();
      if (!json?.success) {
        throw new Error(json?.message || 'Failed to load performance');
      }

      setRows((json.data?.rows || []) as PerfRow[]);
      setUserWorkzones((json.data?.userWorkzones || []) as string[]);
    } catch (e: any) {
      setError(e?.message || 'Failed to load performance');
      setRows([]);
      setUserWorkzones([]);
    } finally {
      setLoading(false);
    }
  }, [month, year, workzone]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useAutoRefresh({
    intervalMs: 120_000,
    refreshers: [fetchData],
    pauseWhen: [exporting],
  });

  const handleMonthChange = (next: number) => {
    if (next < 1) {
      setMonth(12);
      setYear((y) => y - 1);
      return;
    }
    if (next > 12) {
      setMonth(1);
      setYear((y) => y + 1);
      return;
    }
    setMonth(next);
  };

  const workzoneOptions = useMemo(() => {
    const uniq = [
      ...new Set(userWorkzones.filter((w) => w && w.trim() !== '')),
    ];
    return uniq.map((wz) => ({ value: wz, label: wz }));
  }, [userWorkzones]);

  const downloadExcel = useCallback(async () => {
    setExporting(true);
    try {
      const params = new URLSearchParams({
        month: String(month),
        year: String(year),
      });
      if (workzone) params.set('workzone', workzone);

      const res = await fetchWithAuth(
        `/api/technicians/performance/export-excel?${params.toString()}`,
      );
      if (!res || !res.ok) throw new Error('Gagal export');

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Performa_Teknisi_${MONTHS[month - 1]}_${year}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(err.message || 'Export gagal');
    } finally {
      setExporting(false);
    }
  }, [month, year, workzone]);

  // Detail ticket handler
  const handleDetailClick = useCallback(
    async (row: PerfRow) => {
      setDetailModal({
        open: true,
        techName: row.nama,
        techId: row.id_user,
        tickets: [],
        loading: true,
      });
      try {
        const params = new URLSearchParams({
          tech_id: String(row.id_user),
          month: String(month),
          year: String(year),
        });
        const res = await fetchWithAuth(
          `/api/technicians/performance/tickets?${params.toString()}`,
        );
        const json = await res?.json();
        if (json?.success) {
          setDetailModal((prev) => ({
            ...prev,
            tickets: json.data.tickets,
            loading: false,
          }));
        } else {
          setDetailModal((prev) => ({ ...prev, loading: false }));
        }
      } catch {
        setDetailModal((prev) => ({ ...prev, loading: false }));
      }
    },
    [month, year],
  );

  return (
    <AdminLayout>
      <div className='space-y-6'>
        <div className='flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between'>
          <div>
            <h1 className='text-xl font-semibold text-gray-800 sm:text-2xl dark:text-gray-100'>
              Performa Teknisi (Bulanan)
            </h1>
            <p className='text-sm text-gray-500 dark:text-gray-400'>
              Rekap pekerjaan teknisi per bulan + export CSV
            </p>
            <Link
              href='/admin/technicians'
              className='mt-2 inline-flex text-sm text-blue-600 hover:underline dark:text-blue-400'
            >
              ← Kembali ke Monitoring
            </Link>
          </div>

          <div className='flex flex-wrap items-center gap-2'>
            <Button
              variant='outline'
              onClick={downloadExcel}
              disabled={exporting || loading || rows.length === 0}
            >
              <Download size={16} className='mr-2' />
              {exporting ? 'Mengunduh...' : 'Download Excel'}
            </Button>
          </div>
        </div>

        <div className='flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between'>
          <div className='flex items-center justify-center gap-4'>
            <button
              onClick={() => handleMonthChange(month - 1)}
              className='rounded-lg border border-slate-200 p-2 hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-700'
            >
              <ChevronLeft size={20} />
            </button>
            <div className='min-w-50 text-center'>
              <span className='text-lg font-semibold text-slate-800 dark:text-slate-100'>
                {MONTHS[month - 1]} {year}
              </span>
            </div>
            <button
              onClick={() => handleMonthChange(month + 1)}
              className='rounded-lg border border-slate-200 p-2 hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-700'
            >
              <ChevronRight size={20} />
            </button>
          </div>

          <div className='flex items-center gap-2'>
            <MapPin size={16} className='text-slate-400' />
            <Select
              options={workzoneOptions}
              placeholder='All Workzone'
              value={workzone}
              onChange={(v) => setWorkzone(v)}
              className='w-64'
            />
          </div>
        </div>

        {error && (
          <div className='rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-500/30 dark:bg-red-500/10'>
            <p className='text-sm text-red-600 dark:text-red-400'>{error}</p>
          </div>
        )}

        <div className='overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800'>
          <div className='overflow-x-auto'>
            <table className='w-full text-sm'>
              <thead className='bg-slate-50 text-xs font-semibold tracking-wide text-slate-500 uppercase dark:bg-slate-700/50 dark:text-slate-400'>
                <tr>
                  <th className='px-4 py-3 text-left'>Nama</th>
                  <th className='px-4 py-3 text-left'>NIK</th>
                  <th className='px-4 py-3 text-left'>Workzone</th>
                  <th className='px-4 py-3 text-center'>Closed (Month)</th>
                  <th className='px-4 py-3 text-center'>Avg Resolve (h)</th>
                  <th className='px-4 py-3 text-center'>Aksi</th>
                </tr>
              </thead>
              <tbody className='divide-y divide-slate-100 dark:divide-slate-700'>
                {loading ? (
                  <tr>
                    <td
                      colSpan={6}
                      className='px-4 py-10 text-center text-slate-400 dark:text-slate-500'
                    >
                      Loading...
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className='px-4 py-10 text-center text-slate-400 dark:text-slate-500'
                    >
                      No data
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => (
                    <tr
                      key={r.id_user}
                      className='hover:bg-slate-50 dark:hover:bg-slate-700/50'
                    >
                      <td className='px-4 py-3 font-medium text-slate-800 dark:text-slate-100'>
                        {r.nama}
                      </td>
                      <td className='px-4 py-3 text-slate-600 dark:text-slate-300'>
                        {r.nik || '-'}
                      </td>
                      <td className='px-4 py-3 text-slate-600 dark:text-slate-300'>
                        {r.workzone}
                      </td>
                      <td className='px-4 py-3 text-center font-semibold text-slate-800 dark:text-slate-100'>
                        {r.closed_count}
                      </td>
                      <td className='px-4 py-3 text-center text-slate-700 dark:text-slate-300'>
                        {r.avg_resolve_time_hours == null
                          ? '-'
                          : r.avg_resolve_time_hours.toFixed(1)}
                      </td>
                      <td className='px-4 py-3 text-center'>
                        <button
                          onClick={() => handleDetailClick(r)}
                          className='rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-400'
                        >
                          Detail Tiket
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Detail Tiket Modal */}
      {detailModal.open && (
        <div
          className='fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4'
          onClick={() => setDetailModal((p) => ({ ...p, open: false }))}
        >
          <div
            className='flex max-h-[85vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-slate-800'
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className='flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-700'>
              <div>
                <h3 className='text-lg font-semibold text-slate-800 dark:text-slate-100'>
                  Detail Tiket — {detailModal.techName}
                </h3>
                <p className='text-sm text-slate-500'>
                  {MONTHS[month - 1]} {year} · {detailModal.tickets.length}{' '}
                  tiket selesai
                </p>
              </div>
              <button
                onClick={() => setDetailModal((p) => ({ ...p, open: false }))}
                className='rounded-lg border border-slate-200 p-2 hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-700'
              >
                ✕
              </button>
            </div>

            {/* Content */}
            <div className='flex-1 overflow-y-auto'>
              {detailModal.loading ? (
                <div className='flex items-center justify-center py-16 text-slate-400'>
                  Loading...
                </div>
              ) : detailModal.tickets.length === 0 ? (
                <div className='flex items-center justify-center py-16 text-slate-400'>
                  Tidak ada tiket pada periode ini
                </div>
              ) : (
                <table className='w-full text-sm'>
                  <thead className='sticky top-0 bg-slate-50 text-xs font-semibold text-slate-500 uppercase dark:bg-slate-700/80 dark:text-slate-400'>
                    <tr>
                      <th className='px-4 py-3 text-left'>No Tiket</th>
                      <th className='px-4 py-3 text-left'>Customer</th>
                      <th className='px-4 py-3 text-left'>Tipe</th>
                      <th className='px-4 py-3 text-left'>Jenis</th>
                      <th className='px-4 py-3 text-left'>Workzone</th>
                      <th className='px-4 py-3 text-center'>Resolve (h)</th>
                      <th className='px-4 py-3 text-left'>Selesai</th>
                    </tr>
                  </thead>
                  <tbody className='divide-y divide-slate-100 dark:divide-slate-700'>
                    {detailModal.tickets.map((t) => (
                      <tr
                        key={t.idTicket}
                        className='hover:bg-slate-50 dark:hover:bg-slate-700/50'
                      >
                        <td className='px-4 py-2.5 font-mono text-xs font-semibold text-blue-600 dark:text-blue-400'>
                          {t.incident}
                        </td>
                        <td className='px-4 py-2.5 text-slate-700 dark:text-slate-300'>
                          {t.contactName || '-'}
                        </td>
                        <td className='px-4 py-2.5 text-slate-600 dark:text-slate-400'>
                          {t.customerType || '-'}
                        </td>
                        <td className='px-4 py-2.5 text-slate-600 dark:text-slate-400'>
                          {t.jenisTiket || '-'}
                        </td>
                        <td className='px-4 py-2.5 text-xs text-slate-500'>
                          {t.workzone || '-'}
                        </td>
                        <td className='px-4 py-2.5 text-center font-semibold text-slate-700 dark:text-slate-200'>
                          {t.resolveHours || '-'}
                        </td>
                        <td className='px-4 py-2.5 text-xs text-slate-500'>
                          {t.closedAt
                            ? new Date(t.closedAt).toLocaleString('id-ID', {
                                day: '2-digit',
                                month: 'short',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })
                            : '-'}
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
