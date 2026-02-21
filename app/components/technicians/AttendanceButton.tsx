'use client';

import { useState, useEffect } from 'react';
import {
  AttendanceStatus,
  TodayAttendanceStatus,
} from '@/app/types/attendance';
import { fetchWithAuth } from '@/app/libs/fetcher';
import { formatTimeWIB } from '@/app/utils/datetime';
import AttendanceBadge from './AttendanceBadge';

interface AttendanceButtonProps {
  technicianId: number;
  workzoneId?: number;
  workzoneName?: string;
}

export default function AttendanceButton(props: AttendanceButtonProps) {
  const { technicianId, workzoneId, workzoneName } = props;
  const [status, setStatus] = useState<TodayAttendanceStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = async () => {
    try {
      setLoading(true);
      const res = await fetchWithAuth('/api/technicians/attendance/status');
      if (!res || !res.ok) throw new Error('Failed to fetch status');
      const data = await res.json();
      if (data.success) {
        setStatus(data.data);
      }
    } catch (err) {
      console.error('Error fetching attendance status:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, [technicianId]);

  const handleCheckIn = async () => {
    if (!workzoneId) {
      setError('Workzone tidak ditemukan');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetchWithAuth('/api/technicians/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workzone_id: workzoneId }),
      });

      if (!res) throw new Error('No response');
      const data = await res.json();

      if (!data.success) {
        throw new Error(data.message || 'Failed to check in');
      }

      await fetchStatus();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to check in');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCheckOut = async () => {
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetchWithAuth('/api/technicians/attendance/checkout', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!res) throw new Error('No response');
      const data = await res.json();

      if (!data.success) {
        throw new Error(data.message || 'Failed to check out');
      }

      await fetchStatus();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to check out');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className='flex items-center gap-2'>
        <div className='h-6 w-20 animate-pulse rounded-full bg-slate-200' />
      </div>
    );
  }

  if (!status?.checked_in) {
    return (
      <div className='flex flex-col gap-2'>
        <button
          onClick={handleCheckIn}
          disabled={submitting}
          className='rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-green-700 disabled:opacity-50'
        >
          {submitting ? 'Memproses...' : 'Absen Masuk'}
        </button>
        {error && <p className='text-xs text-red-600'>{error}</p>}
        {workzoneName && (
          <p className='text-xs text-slate-500'>Area: {workzoneName}</p>
        )}
      </div>
    );
  }

  if (status.checked_in && !status.checked_out) {
    return (
      <div className='flex flex-col gap-2'>
        <div className='flex items-center gap-2'>
          <AttendanceBadge
            status={status.status as AttendanceStatus}
            check_in_at={status.check_in_at}
          />
        </div>
        <button
          onClick={handleCheckOut}
          disabled={submitting}
          className='rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50'
        >
          {submitting ? 'Memproses...' : 'Absen Keluar'}
        </button>
      </div>
    );
  }

  return (
    <div className='flex flex-col gap-2'>
      <div className='flex items-center gap-2'>
        <span className='inline-flex items-center gap-1.5 rounded-full bg-green-50 px-2.5 py-1 text-xs font-medium text-green-600'>
          <svg
            className='h-4 w-4'
            fill='none'
            stroke='currentColor'
            viewBox='0 0 24 24'
          >
            <path
              strokeLinecap='round'
              strokeLinejoin='round'
              strokeWidth={2}
              d='M5 13l4 4L19 7'
            />
          </svg>
          Absen selesai hari ini
        </span>
      </div>
    </div>
  );
}
