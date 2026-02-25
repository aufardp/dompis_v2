'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Plus,
  X,
  Calendar,
  Clock,
  CheckCircle,
} from 'lucide-react';
import AdminLayout from '@/app/components/layout/AdminLayout';
import Button from '@/app/components/ui/Button';
import { fetchWithAuth } from '@/app/libs/fetcher';
import { useAutoRefresh } from '@/app/hooks/useAutoRefresh';
import {
  AttendanceStatus,
  TechnicianAttendanceWithDetails,
  ManualAttendanceInput,
} from '@/app/types/attendance';
import { formatDateWIB, formatTimeWIB } from '@/app/utils/datetime';

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

const DAYS = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

function getStatusColor(
  status: AttendanceStatus | 'ABSENT' | 'WEEKEND' | 'FUTURE' | 'NO_RECORD',
): {
  bg: string;
  text: string;
  border: string;
} {
  switch (status) {
    case 'PRESENT':
      return {
        bg: 'bg-green-100',
        text: 'text-green-700',
        border: 'border-green-200',
      };
    case 'LATE':
      return {
        bg: 'bg-amber-100',
        text: 'text-amber-700',
        border: 'border-amber-200',
      };
    case 'ABSENT':
    case 'NO_RECORD':
      return {
        bg: 'bg-red-100',
        text: 'text-red-700',
        border: 'border-red-200',
      };
    case 'WEEKEND':
      return {
        bg: 'bg-slate-100',
        text: 'text-slate-500',
        border: 'border-slate-200',
      };
    case 'FUTURE':
      return {
        bg: 'bg-white',
        text: 'text-slate-300',
        border: 'border-slate-100',
      };
    default:
      return {
        bg: 'bg-white',
        text: 'text-slate-700',
        border: 'border-slate-200',
      };
  }
}

function LoadingSkeleton() {
  return (
    <div className='space-y-6'>
      <div className='animate-pulse rounded-xl border border-slate-200 bg-white p-6'>
        <div className='h-8 w-48 rounded bg-slate-200' />
        <div className='mt-4 h-4 w-32 rounded bg-slate-200' />
      </div>
    </div>
  );
}

export default function TechnicianAttendanceDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const technicianId = Number(params.id);

  const initialMonth =
    parseInt(searchParams.get('month') || '') || new Date().getMonth() + 1;
  const initialYear =
    parseInt(searchParams.get('year') || '') || new Date().getFullYear();

  const [month, setMonth] = useState(initialMonth);
  const [year, setYear] = useState(initialYear);
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<TechnicianAttendanceWithDetails[]>([]);
  const [technicianName, setTechnicianName] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [manualForm, setManualForm] = useState({
    date: '',
    check_in_at: '',
    check_out_at: '',
    status: 'PRESENT' as AttendanceStatus,
    notes: '',
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchWithAuth(
        `/api/technicians/attendance?technician_id=${technicianId}&month=${month}&year=${year}`,
      );
      if (!res) throw new Error('No response');
      const data = await res.json();

      if (data.success && data.data.records.length > 0) {
        setRecords(data.data.records);
        setTechnicianName(data.data.records[0].technician_name || 'Unknown');
      } else {
        setRecords([]);
        setTechnicianName('Technician');
      }
    } catch (err) {
      console.error('Error fetching attendance:', err);
    } finally {
      setLoading(false);
    }
  }, [month, technicianId, year]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useAutoRefresh({
    intervalMs: 120_000,
    refreshers: [fetchData],
    pauseWhen: [showModal, submitting],
  });

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

  const calendarData = useMemo(() => {
    const daysInMonth = new Date(year, month, 0).getDate();
    const firstDayOfMonth = new Date(year, month - 1, 1).getDay();
    const today = new Date();
    const todayStr = `${year}-${String(month).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    const recordMap = new Map<string, TechnicianAttendanceWithDetails>();
    for (const record of records) {
      recordMap.set(record.date, record);
    }

    const weeks: {
      date: string;
      day: number;
      status: string;
      check_in_at?: string;
    }[][] = [];
    let currentWeek: {
      date: string;
      day: number;
      status: string;
      check_in_at?: string;
    }[] = [];

    for (let i = 0; i < firstDayOfMonth; i++) {
      currentWeek.push({ date: '', day: -1, status: 'EMPTY' });
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const dateObj = new Date(year, month - 1, day);
      const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6;
      const isFuture = new Date(date) > today;

      let status = 'NO_RECORD';
      let check_in_at: string | undefined;

      if (isFuture) {
        status = 'FUTURE';
      } else if (isWeekend) {
        status = 'WEEKEND';
      } else {
        const record = recordMap.get(date);
        if (record) {
          status = record.status;
          check_in_at = record.check_in_at;
        }
      }

      currentWeek.push({ date, day, status, check_in_at });

      if (currentWeek.length === 7) {
        weeks.push(currentWeek);
        currentWeek = [];
      }
    }

    if (currentWeek.length > 0) {
      while (currentWeek.length < 7) {
        currentWeek.push({ date: '', day: -1, status: 'EMPTY' });
      }
      weeks.push(currentWeek);
    }

    return weeks;
  }, [month, year, records]);

  const handleSubmitManual = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const checkInDate = new Date(
        `${manualForm.date}T${manualForm.check_in_at}`,
      );
      const checkOutDate = manualForm.check_out_at
        ? new Date(`${manualForm.date}T${manualForm.check_out_at}`)
        : undefined;

      const payload: ManualAttendanceInput = {
        technician_id: technicianId,
        date: manualForm.date,
        check_in_at: checkInDate.toISOString(),
        check_out_at: checkOutDate?.toISOString(),
        workzone_id: 1,
        status: manualForm.status,
        notes: manualForm.notes || undefined,
      };

      const res = await fetchWithAuth('/api/technicians/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res) throw new Error('No response');
      const data = await res.json();

      if (data.success) {
        setShowModal(false);
        setManualForm({
          date: '',
          check_in_at: '',
          check_out_at: '',
          status: 'PRESENT',
          notes: '',
        });
        fetchData();
      } else {
        alert(data.message || 'Failed to add manual attendance');
      }
    } catch (err) {
      console.error('Error adding manual attendance:', err);
      alert('Failed to add manual attendance');
    } finally {
      setSubmitting(false);
    }
  };

  const stats = useMemo(() => {
    const present = records.filter((r) => r.status === 'PRESENT').length;
    const late = records.filter((r) => r.status === 'LATE').length;
    const daysInMonth = new Date(year, month, 0).getDate();
    const workingDays = Array.from({ length: daysInMonth }, (_, i) => {
      const d = new Date(year, month - 1, i + 1);
      return d.getDay() !== 0 && d.getDay() !== 6;
    }).filter(Boolean).length;
    const absent = Math.max(0, workingDays - present - late);

    return { present, late, absent, workingDays };
  }, [records, month, year]);

  if (loading) {
    return (
      <AdminLayout>
        <LoadingSkeleton />
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className='space-y-6'>
        <div className='flex items-center gap-4'>
          <Link href='/admin/technicians/attendance'>
            <Button variant='outline' size='sm'>
              <ArrowLeft size={16} />
            </Button>
          </Link>
          <div>
            <h1 className='text-xl font-semibold text-gray-800'>
              Absensi: {technicianName}
            </h1>
            <p className='text-sm text-gray-500'>
              Detail absensi bulan {MONTHS[month - 1]} {year}
            </p>
          </div>
        </div>

        <div className='flex items-center justify-between'>
          <div className='flex items-center gap-4'>
            <button
              onClick={() => handleMonthChange(month - 1)}
              className='rounded-lg border border-slate-200 p-2 hover:bg-slate-50'
            >
              <ChevronLeft size={20} />
            </button>
            <span className='text-lg font-semibold text-slate-800'>
              {MONTHS[month - 1]} {year}
            </span>
            <button
              onClick={() => handleMonthChange(month + 1)}
              className='rounded-lg border border-slate-200 p-2 hover:bg-slate-50'
            >
              <ChevronRight size={20} />
            </button>
          </div>
          <Button onClick={() => setShowModal(true)}>
            <Plus size={16} className='mr-2' />
            Tambah Manual
          </Button>
        </div>

        <div className='grid grid-cols-1 gap-4 sm:grid-cols-4'>
          <div className='rounded-xl border border-slate-200 bg-white p-5'>
            <div className='flex items-center gap-3'>
              <div className='rounded-full bg-green-100 p-2'>
                <CheckCircle className='h-5 w-5 text-green-600' />
              </div>
              <div>
                <p className='text-sm text-slate-500'>Hadir</p>
                <p className='text-2xl font-bold text-green-600'>
                  {stats.present}
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
                <p className='text-sm text-slate-500'>Terlambat</p>
                <p className='text-2xl font-bold text-amber-600'>
                  {stats.late}
                </p>
              </div>
            </div>
          </div>
          <div className='rounded-xl border border-slate-200 bg-white p-5'>
            <div className='flex items-center gap-3'>
              <div className='rounded-full bg-red-100 p-2'>
                <Calendar className='h-5 w-5 text-red-600' />
              </div>
              <div>
                <p className='text-sm text-slate-500'>Absen</p>
                <p className='text-2xl font-bold text-red-600'>
                  {stats.absent}
                </p>
              </div>
            </div>
          </div>
          <div className='rounded-xl border border-slate-200 bg-white p-5'>
            <div className='flex items-center gap-3'>
              <div className='rounded-full bg-blue-100 p-2'>
                <Calendar className='h-5 w-5 text-blue-600' />
              </div>
              <div>
                <p className='text-sm text-slate-500'>Hari Kerja</p>
                <p className='text-2xl font-bold text-slate-800'>
                  {stats.workingDays}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className='overflow-hidden rounded-xl border border-slate-200 bg-white'>
          <div className='grid grid-cols-7 gap-px bg-slate-200'>
            {DAYS.map((day) => (
              <div
                key={day}
                className='bg-slate-50 p-2 text-center text-xs font-semibold text-slate-500'
              >
                {day}
              </div>
            ))}
          </div>
          <div className='grid grid-cols-7 gap-px bg-slate-200'>
            {calendarData.flat().map((cell, idx) => {
              if (cell.status === 'EMPTY') {
                return <div key={idx} className='min-h-[60px] bg-white p-2' />;
              }

              const colors = getStatusColor(
                cell.status as
                  | AttendanceStatus
                  | 'WEEKEND'
                  | 'FUTURE'
                  | 'NO_RECORD',
              );
              const dayNum = cell.day;

              return (
                <div
                  key={idx}
                  className={`flex min-h-[60px] flex-col items-center justify-center p-2 ${colors.bg} ${colors.border} border`}
                >
                  <span className={`text-sm font-medium ${colors.text}`}>
                    {dayNum}
                  </span>
                  {cell.check_in_at &&
                    cell.status !== 'WEEKEND' &&
                    cell.status !== 'FUTURE' && (
                      <span className={`text-xs ${colors.text}`}>
                        {formatTimeWIB(cell.check_in_at)}
                      </span>
                    )}
                  {cell.status === 'WEEKEND' && (
                    <span className='text-xs text-slate-400'>Libur</span>
                  )}
                  {cell.status === 'NO_RECORD' && cell.day > 0 && (
                    <span className='text-xs text-red-500'>Absen</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className='overflow-hidden rounded-xl border border-slate-200 bg-white'>
          <div className='border-b border-slate-200 px-6 py-4'>
            <h3 className='font-semibold text-slate-800'>Riwayat Absensi</h3>
          </div>
          <div className='overflow-x-auto'>
            <table className='w-full text-sm'>
              <thead className='bg-slate-50 text-xs font-semibold tracking-wide text-slate-500 uppercase'>
                <tr>
                  <th className='px-4 py-3 text-left'>Tanggal</th>
                  <th className='px-4 py-3 text-left'>Jam Masuk</th>
                  <th className='px-4 py-3 text-left'>Jam Keluar</th>
                  <th className='px-4 py-3 text-left'>Durasi</th>
                  <th className='px-4 py-3 text-left'>Status</th>
                  <th className='px-4 py-3 text-left'>Catatan</th>
                </tr>
              </thead>
              <tbody className='divide-y divide-slate-100'>
                {records.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className='px-4 py-8 text-center text-slate-400'
                    >
                      Tidak ada data absensi
                    </td>
                  </tr>
                ) : (
                  records.map((record) => {
                    const checkIn = new Date(record.check_in_at);
                    const checkOut = record.check_out_at
                      ? new Date(record.check_out_at)
                      : null;
                    const duration = checkOut
                      ? Math.round(
                          (checkOut.getTime() - checkIn.getTime()) / 1000 / 60,
                        )
                      : null;
                    const hours = duration ? Math.floor(duration / 60) : 0;
                    const mins = duration ? duration % 60 : 0;

                    return (
                      <tr key={record.id} className='hover:bg-slate-50'>
                        <td className='px-4 py-3 font-medium text-slate-800'>
                          {formatDateWIB(record.date, 'dd MMM yyyy')}
                        </td>
                        <td className='px-4 py-3 text-slate-600'>
                          {formatTimeWIB(record.check_in_at)}
                        </td>
                        <td className='px-4 py-3 text-slate-600'>
                          {record.check_out_at
                            ? formatTimeWIB(record.check_out_at)
                            : '-'}
                        </td>
                        <td className='px-4 py-3 text-slate-600'>
                          {duration ? `${hours}j ${mins}m` : '-'}
                        </td>
                        <td className='px-4 py-3'>
                          <span
                            className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                              record.status === 'PRESENT'
                                ? 'bg-green-100 text-green-700'
                                : 'bg-amber-100 text-amber-700'
                            }`}
                          >
                            {record.status === 'PRESENT'
                              ? 'Hadir'
                              : 'Terlambat'}
                          </span>
                        </td>
                        <td className='px-4 py-3 text-slate-500'>
                          {record.notes || '-'}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {showModal && (
          <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4'>
            <div className='w-full max-w-md rounded-2xl bg-white p-6'>
              <div className='mb-4 flex items-center justify-between'>
                <h2 className='text-lg font-semibold text-slate-800'>
                  Tambah Absensi Manual
                </h2>
                <button
                  onClick={() => setShowModal(false)}
                  className='text-slate-400 hover:text-slate-600'
                >
                  <X size={20} />
                </button>
              </div>
              <form onSubmit={handleSubmitManual} className='space-y-4'>
                <div>
                  <label className='mb-1 block text-sm font-medium text-slate-700'>
                    Tanggal
                  </label>
                  <input
                    type='date'
                    value={manualForm.date}
                    onChange={(e) =>
                      setManualForm({ ...manualForm, date: e.target.value })
                    }
                    className='w-full rounded-lg border border-slate-200 px-3 py-2 text-sm'
                    required
                  />
                </div>
                <div className='grid grid-cols-2 gap-4'>
                  <div>
                    <label className='mb-1 block text-sm font-medium text-slate-700'>
                      Jam Masuk
                    </label>
                    <input
                      type='time'
                      value={manualForm.check_in_at}
                      onChange={(e) =>
                        setManualForm({
                          ...manualForm,
                          check_in_at: e.target.value,
                        })
                      }
                      className='w-full rounded-lg border border-slate-200 px-3 py-2 text-sm'
                      required
                    />
                  </div>
                  <div>
                    <label className='mb-1 block text-sm font-medium text-slate-700'>
                      Jam Keluar (opsional)
                    </label>
                    <input
                      type='time'
                      value={manualForm.check_out_at}
                      onChange={(e) =>
                        setManualForm({
                          ...manualForm,
                          check_out_at: e.target.value,
                        })
                      }
                      className='w-full rounded-lg border border-slate-200 px-3 py-2 text-sm'
                    />
                  </div>
                </div>
                <div>
                  <label className='mb-1 block text-sm font-medium text-slate-700'>
                    Status
                  </label>
                  <select
                    value={manualForm.status}
                    onChange={(e) =>
                      setManualForm({
                        ...manualForm,
                        status: e.target.value as AttendanceStatus,
                      })
                    }
                    className='w-full rounded-lg border border-slate-200 px-3 py-2 text-sm'
                  >
                    <option value='PRESENT'>Hadir</option>
                    <option value='LATE'>Terlambat</option>
                  </select>
                </div>
                <div>
                  <label className='mb-1 block text-sm font-medium text-slate-700'>
                    Catatan (opsional)
                  </label>
                  <input
                    type='text'
                    value={manualForm.notes}
                    onChange={(e) =>
                      setManualForm({ ...manualForm, notes: e.target.value })
                    }
                    className='w-full rounded-lg border border-slate-200 px-3 py-2 text-sm'
                    placeholder='Contoh: Absensi manual oleh admin'
                  />
                </div>
                <div className='flex gap-3 pt-2'>
                  <Button
                    type='button'
                    variant='outline'
                    onClick={() => setShowModal(false)}
                    className='flex-1'
                  >
                    Batal
                  </Button>
                  <Button
                    type='submit'
                    disabled={submitting}
                    className='flex-1'
                  >
                    {submitting ? 'Menyimpan...' : 'Simpan'}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
