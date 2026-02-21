'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Users,
  Calendar,
  CheckCircle,
  Clock,
  AlertCircle,
} from 'lucide-react';
import AdminLayout from '@/app/components/layout/AdminLayout';
import Button from '@/app/components/ui/Button';
import { fetchWithAuth } from '@/app/libs/fetcher';
import {
  MonthlyAttendanceSummary,
  AttendanceStatus,
} from '@/app/types/attendance';

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

function getPercentageColor(percentage: number): string {
  if (percentage >= 90) return 'bg-green-500';
  if (percentage >= 70) return 'bg-amber-500';
  return 'bg-red-500';
}

function getPercentageTextColor(percentage: number): string {
  if (percentage >= 90) return 'text-green-600';
  if (percentage >= 70) return 'text-amber-600';
  return 'text-red-600';
}

function LoadingSkeleton() {
  return (
    <div className='space-y-4'>
      {[...Array(5)].map((_, i) => (
        <div
          key={i}
          className='animate-pulse rounded-lg border border-slate-200 bg-white p-4'
        >
          <div className='flex items-center gap-4'>
            <div className='h-12 w-12 rounded-full bg-slate-200' />
            <div className='flex-1 space-y-2'>
              <div className='h-4 w-32 rounded bg-slate-200' />
              <div className='h-3 w-24 rounded bg-slate-200' />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className='flex flex-col items-center justify-center py-16 text-center'>
      <Users className='h-16 w-16 text-slate-300' />
      <h3 className='mt-4 text-lg font-medium text-slate-600'>
        Tidak ada data absensi
      </h3>
      <p className='mt-1 text-sm text-slate-400'>
        Pilih bulan dan tahun untuk melihat rekap absensi
      </p>
    </div>
  );
}

export default function MonthlyAttendancePage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const initialMonth =
    parseInt(searchParams.get('month') || '') || new Date().getMonth() + 1;
  const initialYear =
    parseInt(searchParams.get('year') || '') || new Date().getFullYear();

  const [month, setMonth] = useState(initialMonth);
  const [year, setYear] = useState(initialYear);
  const [loading, setLoading] = useState(true);
  const [summaries, setSummaries] = useState<MonthlyAttendanceSummary[]>([]);
  const [totalWorkingDays, setTotalWorkingDays] = useState(0);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchWithAuth(
        `/api/technicians/attendance?month=${month}&year=${year}`,
      );
      if (!res) throw new Error('No response');
      const data = await res.json();

      if (data.success) {
        const records = data.data.records || [];
        const summaryMap = new Map<string, MonthlyAttendanceSummary>();

        for (const record of records) {
          const key = String(record.technician_id);
          if (!summaryMap.has(key)) {
            summaryMap.set(key, {
              technician_id: record.technician_id,
              technician_name: record.technician_name || 'Unknown',
              technician_nik: record.technician_nik || '',
              workzone: record.workzone_name || 'Unknown',
              total_present: 0,
              total_late: 0,
              total_absent: 0,
              working_days: data.data.summary?.working_days || 0,
              attendance_percentage: 0,
            });
          }
          const summary = summaryMap.get(key)!;
          if (record.status === 'PRESENT') summary.total_present++;
          else if (record.status === 'LATE') summary.total_late++;
        }

        const summariesArray = Array.from(summaryMap.values()).map((s) => {
          const total = s.total_present + s.total_late;
          const percentage =
            s.working_days > 0
              ? Math.round((total / s.working_days) * 1000) / 10
              : 0;
          return { ...s, attendance_percentage: percentage };
        });

        summariesArray.sort(
          (a, b) => b.attendance_percentage - a.attendance_percentage,
        );

        setSummaries(summariesArray);
        setTotalWorkingDays(data.data.summary?.working_days || 0);
      }
    } catch (err) {
      console.error('Error fetching attendance:', err);
    } finally {
      setLoading(false);
    }
  }, [month, year]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleMonthChange = (newMonth: number) => {
    if (newMonth < 1) {
      setMonth(12);
      setYear(year - 1);
    } else if (newMonth > 12) {
      setMonth(1);
      setYear(year + 1);
    } else {
      setMonth(newMonth);
    }
  };

  const handleExportCSV = () => {
    const headers = [
      'Nama',
      'NIK',
      'Workzone',
      'Hadir',
      'Terlambat',
      'Absen',
      'Persentase',
    ];
    const rows = summaries.map((s) => [
      s.technician_name,
      s.technician_nik,
      s.workzone,
      s.total_present,
      s.total_late,
      s.total_absent,
      `${s.attendance_percentage}%`,
    ]);

    const csvContent = [headers, ...rows]
      .map((row) => row.map((cell) => `"${cell}"`).join(','))
      .join('\n');

    const blob = new Blob(['\ufeff' + csvContent], {
      type: 'text/csv;charset=utf-8;',
    });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `absensi_${MONTHS[month - 1]}_${year}.csv`;
    link.click();
  };

  const stats = useMemo(() => {
    const totalPresent = summaries.reduce((acc, s) => acc + s.total_present, 0);
    const totalLate = summaries.reduce((acc, s) => acc + s.total_late, 0);
    const totalAbsent = summaries.reduce((acc, s) => acc + s.total_absent, 0);
    const avgPercentage =
      summaries.length > 0
        ? Math.round(
            summaries.reduce((acc, s) => acc + s.attendance_percentage, 0) /
              summaries.length,
          )
        : 0;
    return { totalPresent, totalLate, totalAbsent, avgPercentage };
  }, [summaries]);

  return (
    <AdminLayout>
      <div className='space-y-6'>
        <div className='flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between'>
          <div>
            <h1 className='text-xl font-semibold text-gray-800 sm:text-2xl'>
              Rekap Absensi Teknisi
            </h1>
            <p className='text-sm text-gray-500'>
              Lihat rekap absensi teknisi per bulan
            </p>
          </div>
          <Button
            variant='outline'
            onClick={handleExportCSV}
            disabled={summaries.length === 0}
          >
            <Download size={16} className='mr-2' />
            Export CSV
          </Button>
        </div>

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

        <div className='grid grid-cols-1 gap-4 sm:grid-cols-3'>
          <div className='rounded-xl border border-slate-200 bg-white p-5'>
            <div className='flex items-center gap-3'>
              <div className='rounded-full bg-blue-100 p-2'>
                <Calendar className='h-5 w-5 text-blue-600' />
              </div>
              <div>
                <p className='text-sm text-slate-500'>Hari Kerja</p>
                <p className='text-2xl font-bold text-slate-800'>
                  {totalWorkingDays}
                </p>
              </div>
            </div>
          </div>
          <div className='rounded-xl border border-slate-200 bg-white p-5'>
            <div className='flex items-center gap-3'>
              <div className='rounded-full bg-green-100 p-2'>
                <CheckCircle className='h-5 w-5 text-green-600' />
              </div>
              <div>
                <p className='text-sm text-slate-500'>Rata-rata Kehadiran</p>
                <p className='text-2xl font-bold text-green-600'>
                  {stats.avgPercentage}%
                </p>
              </div>
            </div>
          </div>
          <div className='rounded-xl border border-slate-200 bg-white p-5'>
            <div className='flex items-center gap-3'>
              <div className='rounded-full bg-amber-100 p-2'>
                <Clock className='h-5 w-5 text-amber-600' />
              </div>
              <div>
                <p className='text-sm text-slate-500'>Total Teknisi</p>
                <p className='text-2xl font-bold text-slate-800'>
                  {summaries.length}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className='overflow-hidden rounded-xl border border-slate-200 bg-white'>
          <div className='overflow-x-auto'>
            <table className='w-full text-sm'>
              <thead className='bg-slate-50 text-xs font-semibold tracking-wide text-slate-500 uppercase'>
                <tr>
                  <th className='px-4 py-3 text-left'>Teknisi</th>
                  <th className='px-4 py-3 text-left'>Workzone</th>
                  <th className='px-4 py-3 text-center'>Hadir</th>
                  <th className='px-4 py-3 text-center'>Terlambat</th>
                  <th className='px-4 py-3 text-center'>Absen</th>
                  <th className='px-4 py-3 text-center'>Persentase</th>
                  <th className='px-4 py-3 text-center'>Detail</th>
                </tr>
              </thead>
              <tbody className='divide-y divide-slate-100'>
                {loading ? (
                  [...Array(5)].map((_, i) => (
                    <tr key={i}>
                      <td colSpan={7} className='px-4 py-4'>
                        <div className='h-6 animate-pulse rounded bg-slate-200' />
                      </td>
                    </tr>
                  ))
                ) : summaries.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className='px-4 py-12 text-center text-slate-400'
                    >
                      Tidak ada data absensi
                    </td>
                  </tr>
                ) : (
                  summaries.map((summary) => (
                    <tr
                      key={summary.technician_id}
                      className='hover:bg-slate-50'
                    >
                      <td className='px-4 py-3'>
                        <div className='flex items-center gap-3'>
                          <div className='flex h-10 w-10 items-center justify-center rounded-full bg-slate-200 text-sm font-semibold text-slate-600'>
                            {summary.technician_name
                              .split(' ')
                              .map((n) => n[0])
                              .join('')
                              .toUpperCase()
                              .slice(0, 2)}
                          </div>
                          <div>
                            <p className='font-medium text-slate-800'>
                              {summary.technician_name}
                            </p>
                            <p className='text-xs text-slate-500'>
                              {summary.technician_nik || '-'}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className='px-4 py-3'>
                        <span className='inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600'>
                          {summary.workzone}
                        </span>
                      </td>
                      <td className='px-4 py-3 text-center'>
                        <span className='font-semibold text-green-600'>
                          {summary.total_present}
                        </span>
                      </td>
                      <td className='px-4 py-3 text-center'>
                        <span className='font-semibold text-amber-600'>
                          {summary.total_late}
                        </span>
                      </td>
                      <td className='px-4 py-3 text-center'>
                        <span className='font-semibold text-red-600'>
                          {summary.total_absent}
                        </span>
                      </td>
                      <td className='px-4 py-3'>
                        <div className='flex items-center gap-2'>
                          <div className='h-2 w-20 overflow-hidden rounded-full bg-slate-100'>
                            <div
                              className={`h-full ${getPercentageColor(summary.attendance_percentage)}`}
                              style={{
                                width: `${summary.attendance_percentage}%`,
                              }}
                            />
                          </div>
                          <span
                            className={`text-sm font-semibold ${getPercentageTextColor(summary.attendance_percentage)}`}
                          >
                            {summary.attendance_percentage}%
                          </span>
                        </div>
                      </td>
                      <td className='px-4 py-3 text-center'>
                        <Link
                          href={`/admin/technicians/attendance/${summary.technician_id}?month=${month}&year=${year}`}
                        >
                          <Button variant='outline' size='sm'>
                            Lihat Detail
                          </Button>
                        </Link>
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
