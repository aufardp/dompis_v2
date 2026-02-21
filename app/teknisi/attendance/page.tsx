'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';
import { fetchWithAuth } from '@/app/libs/fetcher';

interface UserInfo {
  id_user: number;
  nama: string;
  role_name: string;
  workzone?: string[];
}

interface AttendanceStatus {
  checked_in: boolean;
  check_in_at: string | null;
  status: 'PRESENT' | 'LATE' | null;
}

export default function AttendancePage() {
  const router = useRouter();
  const [user, setUser] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [checkingIn, setCheckingIn] = useState(false);
  const [checkInResult, setCheckInResult] = useState<{
    success: boolean;
    check_in_at?: string;
    status?: 'PRESENT' | 'LATE';
    message?: string;
  } | null>(null);
  const [selectedWorkzoneId, setSelectedWorkzoneId] = useState<number | null>(
    null,
  );
  const [workzones, setWorkzones] = useState<
    { id_sa: number; nama_sa: string }[]
  >([]);
  const [countdown, setCountdown] = useState(3);

  const fetchUserAndStatus = useCallback(async () => {
    try {
      const [userRes, statusRes] = await Promise.all([
        fetchWithAuth('/api/users/me'),
        fetchWithAuth('/api/technicians/attendance/status'),
      ]);

      if (userRes?.ok) {
        const userData = await userRes.json();
        if (userData.success) {
          setUser(userData.data);
        }
      }

      if (statusRes?.ok) {
        const statusData = await statusRes.json();
        if (statusData.success && statusData.data.checked_in) {
          router.push('/teknisi');
          return;
        }
      }

      const saRes = await fetchWithAuth('/api/users/me/sa');
      if (saRes?.ok) {
        const saData = await saRes.json();
        if (saData.success && saData.data.length > 0) {
          setWorkzones(saData.data);
          setSelectedWorkzoneId(saData.data[0].id_sa);
        }
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    fetchUserAndStatus();
  }, [fetchUserAndStatus]);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (checkInResult?.success && countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    } else if (checkInResult?.success && countdown === 0) {
      router.push('/teknisi');
    }
  }, [checkInResult, countdown, router]);

  const handleCheckIn = async () => {
    if (!selectedWorkzoneId) return;

    setCheckingIn(true);
    try {
      const res = await fetch('/api/technicians/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workzone_id: selectedWorkzoneId }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        await fetch('/api/auth/refresh', {
          method: 'POST',
          credentials: 'include',
        });

        setCheckInResult({
          success: true,
          check_in_at: data.data.check_in_at,
          status: data.data.status,
        });
      } else {
        setCheckInResult({
          success: false,
          message: data.message || 'Gagal absen',
        });
      }
    } catch (error) {
      setCheckInResult({
        success: false,
        message: 'Terjadi kesalahan',
      });
    } finally {
      setCheckingIn(false);
    }
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'include',
    });
    router.push('/login');
  };

  const formatDateIndo = (date: Date) => {
    return format(date, 'EEEE, d MMMM yyyy', { locale: id });
  };

  const formatTime = (date: Date) => {
    return format(date, 'HH : mm : ss');
  };

  if (loading) {
    return (
      <div className='flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900'>
        <div className='h-12 w-12 animate-spin rounded-full border-t-2 border-b-2 border-blue-500'></div>
      </div>
    );
  }

  if (checkInResult?.success) {
    return (
      <div className='flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4'>
        <div className='w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-2xl dark:bg-slate-800'>
          <div className='mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-green-100 dark:bg-green-900'>
            <svg
              className='h-10 w-10 text-green-600 dark:text-green-400'
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
          </div>
          <h2 className='mb-4 text-2xl font-bold text-green-600 dark:text-green-400'>
            Absen Berhasil!
          </h2>
          <div className='mb-6 space-y-2'>
            <p className='text-slate-600 dark:text-slate-300'>
              Jam Masuk:{' '}
              {checkInResult.check_in_at
                ? format(new Date(checkInResult.check_in_at), 'HH:mm')
                : '-'}
            </p>
            <p className='text-slate-600 dark:text-slate-300'>
              Status:{' '}
              <span
                className={`font-semibold ${checkInResult.status === 'PRESENT' ? 'text-green-600' : 'text-yellow-600'}`}
              >
                {checkInResult.status === 'PRESENT' ? 'HADIR' : 'TERLAMBAT'}
              </span>
            </p>
          </div>
          {countdown > 0 && (
            <p className='mb-4 text-slate-500 dark:text-slate-400'>
              Anda akan diarahkan dalam {countdown} detik...
            </p>
          )}
          <button
            onClick={() => router.push('/teknisi')}
            className='w-full rounded-xl bg-blue-600 py-3 font-medium text-white transition hover:bg-blue-700'
          >
            Masuk ke Sistem →
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className='flex min-h-screen flex-col bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4'>
      <div className='flex flex-1 items-center justify-center'>
        <div className='w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl dark:bg-slate-800'>
          <div className='mb-8 text-center'>
            <h1 className='mb-2 text-2xl font-bold text-slate-800 dark:text-white'>
              Selamat Datang, {user?.nama || 'Teknisi'} 👋
            </h1>
            <p className='text-sm text-slate-500 dark:text-slate-400'>
              {formatDateIndo(currentTime)}
            </p>
          </div>

          <div className='mb-6 rounded-xl bg-slate-100 p-6 dark:bg-slate-700'>
            <div className='mb-6 text-center'>
              <p className='font-mono text-4xl font-bold text-slate-800 dark:text-white'>
                {formatTime(currentTime)}
              </p>
            </div>

            {workzones.length > 0 && (
              <div className='mb-4'>
                <label className='mb-2 block text-sm font-medium text-slate-600 dark:text-slate-300'>
                  Workzone:
                </label>
                <select
                  value={selectedWorkzoneId || ''}
                  onChange={(e) =>
                    setSelectedWorkzoneId(Number(e.target.value))
                  }
                  className='w-full rounded-lg border border-slate-300 bg-white px-4 py-2 text-slate-800 dark:border-slate-600 dark:bg-slate-800 dark:text-white'
                >
                  {workzones.map((wz) => (
                    <option key={wz.id_sa} value={wz.id_sa}>
                      {wz.nama_sa}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className='mb-6'>
              <div className='flex items-center justify-center gap-2 text-red-500'>
                <span className='h-2 w-2 animate-pulse rounded-full bg-red-500'></span>
                <span className='font-medium'>Belum Absen</span>
              </div>
            </div>

            {checkInResult?.success === false && (
              <div className='mb-4 rounded-lg bg-red-50 p-3 text-center text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400'>
                {checkInResult.message}
              </div>
            )}

            <button
              onClick={handleCheckIn}
              disabled={checkingIn || !selectedWorkzoneId}
              className='flex w-full items-center justify-center gap-2 rounded-xl bg-green-500 py-4 text-lg font-bold text-white transition hover:bg-green-600 disabled:cursor-not-allowed disabled:bg-green-300'
            >
              {checkingIn ? (
                <>
                  <svg className='h-5 w-5 animate-spin' viewBox='0 0 24 24'>
                    <circle
                      className='opacity-25'
                      cx='12'
                      cy='12'
                      r='10'
                      stroke='currentColor'
                      strokeWidth='4'
                      fill='none'
                    />
                    <path
                      className='opacity-75'
                      fill='currentColor'
                      d='M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z'
                    />
                  </svg>
                  Memproses...
                </>
              ) : (
                'ABSEN MASUK'
              )}
            </button>
          </div>

          <p className='text-center text-sm text-slate-500 dark:text-slate-400'>
            Anda harus absen terlebih dahulu untuk mengakses sistem
          </p>
        </div>
      </div>

      <div className='pb-6 text-center'>
        <button
          onClick={handleLogout}
          className='text-sm text-slate-400 underline hover:text-slate-300'
        >
          Logout
        </button>
      </div>
    </div>
  );
}
