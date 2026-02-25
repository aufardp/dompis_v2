'use client';

import { useRouter } from 'next/navigation';
import { Ticket, Clock, Sun, Moon } from 'lucide-react';
import { useState, useEffect } from 'react';
import UserMenu from '../components/layout/user-menu/UserMenu';
import LogoutConfirmModal from '../components/layout/LogoutConfirmModal';
import { fetchWithAuth } from '@/app/libs/fetcher';
import { useTheme } from '@/app/contexts/ThemeContext';

interface AttendanceStatus {
  checked_in: boolean;
  check_in_at: string | null;
  status: 'PRESENT' | 'LATE' | null;
}

export default function TeknisiLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [attendanceStatus, setAttendanceStatus] =
    useState<AttendanceStatus | null>(null);
  const { isDark, toggleTheme } = useTheme();

  useEffect(() => {
    const fetchAttendanceStatus = async () => {
      try {
        const res = await fetchWithAuth('/api/technicians/attendance/status');
        if (res?.ok) {
          const data = await res.json();
          if (data.success) {
            setAttendanceStatus(data.data);
          }
        }
      } catch (error) {
        console.error('Error fetching attendance status:', error);
      }
    };

    fetchAttendanceStatus();
  }, []);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      const res = await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });
      if (res.ok) {
        router.push('/login');
      }
    } catch (err) {
      console.error('Logout failed:', err);
    } finally {
      setLoggingOut(false);
      setShowLogoutModal(false);
    }
  };

  const formatCheckInTime = (checkInAt: string | null) => {
    if (!checkInAt) return '';
    const date = new Date(checkInAt);
    return date.toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className='bg-bg min-h-screen'>
      <header className='bg-surface sticky top-0 z-40 border-b border-[var(--border)] shadow-sm'>
        <div className='mx-auto flex h-16 items-center justify-between px-4'>
          <div className='flex items-center gap-3'>
            <div className='flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-r from-blue-500 to-indigo-500 text-white'>
              <Ticket size={20} />
            </div>
            <div>
              <h1 className='text-lg font-bold text-[var(--text-primary)]'>
                Dompis
              </h1>
              <p className='text-xs text-[var(--text-secondary)]'>Teknisi</p>
            </div>
          </div>
          <div className='flex items-center gap-4'>
            {attendanceStatus?.checked_in && (
              <div
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium ${
                  attendanceStatus.status === 'PRESENT'
                    ? 'bg-green-500/20 text-green-400'
                    : 'bg-yellow-500/20 text-yellow-400'
                }`}
              >
                {attendanceStatus.status === 'PRESENT' ? (
                  <>
                    <span className='h-2 w-2 rounded-full bg-green-400'></span>
                    <span>Hadir</span>
                  </>
                ) : (
                  <>
                    <Clock size={14} />
                    <span>Terlambat</span>
                  </>
                )}
                <span className='ml-1 text-xs opacity-75'>
                  {formatCheckInTime(attendanceStatus.check_in_at)}
                </span>
              </div>
            )}
            <button
              onClick={toggleTheme}
              className='bg-surface-2 hover:bg-surface-3 rounded-lg border border-[var(--border)] p-2 transition-colors'
              title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {isDark ? (
                <Sun className='h-5 w-5 text-amber-400' />
              ) : (
                <Moon className='h-5 w-5 text-slate-600' />
              )}
            </button>
            <UserMenu profileHref='/teknisi/profile' />
          </div>
        </div>
      </header>
      <main className='p-4'>{children}</main>

      <LogoutConfirmModal
        isOpen={showLogoutModal}
        title='Keluar dari aplikasi?'
        description='Anda harus login kembali untuk mengakses aplikasi.'
        hint='Tekan Esc untuk batal'
        confirmLabel={loggingOut ? 'Keluar…' : 'Ya, keluar'}
        cancelLabel='Batal'
        loading={loggingOut}
        onClose={() => {
          if (!loggingOut) setShowLogoutModal(false);
        }}
        onConfirm={handleLogout}
      />
    </div>
  );
}
