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

  const downloadCsv = useCallback(
    async (type: 'summary' | 'tickets') => {
      setExporting(true);
      try {
        const params = new URLSearchParams({
          month: String(month),
          year: String(year),
          type,
        });
        if (workzone) params.set('workzone', workzone);

        const res = await fetchWithAuth(
          `/api/technicians/performance/export?${params.toString()}`,
        );
        if (!res || !res.ok) {
          const body = res ? await res.json().catch(() => null) : null;
          throw new Error(body?.message || 'Failed to export CSV');
        }

        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download =
          type === 'summary'
            ? `technicians_summary_${year}-${String(month).padStart(2, '0')}.csv`
            : `technicians_closed_tickets_${year}-${String(month).padStart(2, '0')}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      } finally {
        setExporting(false);
      }
    },
    [month, year, workzone],
  );

  return (
    <AdminLayout>
      <div className='space-y-6'>
        <div className='flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between'>
          <div>
            <h1 className='text-xl font-semibold text-gray-800 sm:text-2xl'>
              Performa Teknisi (Bulanan)
            </h1>
            <p className='text-sm text-gray-500'>
              Rekap pekerjaan teknisi per bulan + export CSV
            </p>
            <Link
              href='/admin/technicians'
              className='mt-2 inline-flex text-sm text-blue-600 hover:underline'
            >
              ← Kembali ke Monitoring
            </Link>
          </div>

          <div className='flex flex-wrap items-center gap-2'>
            <Button
              variant='outline'
              onClick={() => downloadCsv('summary')}
              disabled={loading}
            >
              <Download size={16} className='mr-2' />
              Export Summary CSV
            </Button>
            <Button
              variant='outline'
              onClick={() => downloadCsv('tickets')}
              disabled={loading}
            >
              <Download size={16} className='mr-2' />
              Export Ticket List CSV
            </Button>
          </div>
        </div>

        <div className='flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between'>
          <div className='flex items-center justify-center gap-4'>
            <button
              onClick={() => handleMonthChange(month - 1)}
              className='rounded-lg border border-slate-200 p-2 hover:bg-slate-50'
            >
              <ChevronLeft size={20} />
            </button>
            <div className='min-w-[200px] text-center'>
              <span className='text-lg font-semibold text-slate-800'>
                {MONTHS[month - 1]} {year}
              </span>
            </div>
            <button
              onClick={() => handleMonthChange(month + 1)}
              className='rounded-lg border border-slate-200 p-2 hover:bg-slate-50'
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
          <div className='rounded-lg border border-red-200 bg-red-50 p-4'>
            <p className='text-sm text-red-600'>{error}</p>
          </div>
        )}

        <div className='overflow-hidden rounded-xl border border-slate-200 bg-white'>
          <div className='overflow-x-auto'>
            <table className='w-full text-sm'>
              <thead className='bg-slate-50 text-xs font-semibold tracking-wide text-slate-500 uppercase'>
                <tr>
                  <th className='px-4 py-3 text-left'>Nama</th>
                  <th className='px-4 py-3 text-left'>NIK</th>
                  <th className='px-4 py-3 text-left'>Workzone</th>
                  <th className='px-4 py-3 text-center'>Closed (Month)</th>
                  <th className='px-4 py-3 text-center'>Avg Resolve (h)</th>
                </tr>
              </thead>
              <tbody className='divide-y divide-slate-100'>
                {loading ? (
                  <tr>
                    <td
                      colSpan={5}
                      className='px-4 py-10 text-center text-slate-400'
                    >
                      Loading...
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className='px-4 py-10 text-center text-slate-400'
                    >
                      No data
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => (
                    <tr key={r.id_user} className='hover:bg-slate-50'>
                      <td className='px-4 py-3 font-medium text-slate-800'>
                        {r.nama}
                      </td>
                      <td className='px-4 py-3 text-slate-600'>
                        {r.nik || '-'}
                      </td>
                      <td className='px-4 py-3 text-slate-600'>{r.workzone}</td>
                      <td className='px-4 py-3 text-center font-semibold text-slate-800'>
                        {r.closed_count}
                      </td>
                      <td className='px-4 py-3 text-center text-slate-700'>
                        {r.avg_resolve_time_hours == null
                          ? '-'
                          : r.avg_resolve_time_hours.toFixed(1)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
