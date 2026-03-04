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
  const [attendance, setAttendance] = useState<AttendanceStatus | null>(null);
  const { isDark, toggleTheme } = useTheme();

  useEffect(() => {
    const fetchAttendance = async () => {
      try {
        const res = await fetchWithAuth('/api/technicians/attendance/status');
        if (res?.ok) {
          const data = await res.json();
          if (data.success) setAttendance(data.data);
        }
      } catch (err) {
        console.error('Error fetching attendance status:', err);
      }
    };
    void fetchAttendance();
  }, []);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      const res = await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });
      if (res.ok) router.push('/login');
    } catch (err) {
      console.error('Logout failed:', err);
    } finally {
      setLoggingOut(false);
      setShowLogoutModal(false);
    }
  };

  const checkInTime = attendance?.check_in_at
    ? new Date(attendance.check_in_at).toLocaleTimeString('id-ID', {
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  return (
    <div className='bg-bg min-h-screen'>
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className='border-border bg-surface shadow-theme-sm sticky top-0 z-40 border-b'>
        <div className='mx-auto flex h-16 max-w-5xl items-center justify-between px-4'>
          {/* ── Brand ─────────────────────────────────────────────────── */}
          <div className='flex items-center gap-2.5'>
            <div className='flex h-10 w-10 items-center justify-center rounded-xl bg-linear-to-br from-blue-500 to-indigo-500 text-white shadow-[0_4px_10px_rgba(99,102,241,0.28)]'>
              <Ticket size={19} />
            </div>
            <div>
              <h1 className='text-text-primary text-[17px] leading-none font-black tracking-tight'>
                Dompis
              </h1>
              <p className='text-text-secondary mt-0.5 text-[11px] font-semibold'>
                Teknisi
              </p>
            </div>
          </div>

          {/* ── Right actions ─────────────────────────────────────────── */}
          <div className='flex items-center gap-2'>
            {/* Attendance pill */}
            {attendance?.checked_in && (
              <AttendancePill status={attendance.status} time={checkInTime} />
            )}

            {/* Theme toggle */}
            <button
              onClick={toggleTheme}
              className='border-border bg-surface-2 hover:bg-surface-3 flex h-9 w-9 items-center justify-center rounded-xl border transition-colors'
              title={isDark ? 'Ganti ke mode terang' : 'Ganti ke mode gelap'}
            >
              {isDark ? (
                <Sun size={17} className='text-warning-400' />
              ) : (
                <Moon size={17} className='text-text-secondary' />
              )}
            </button>

            {/* User avatar menu */}
            <UserMenu profileHref='/teknisi/profile' />
          </div>
        </div>
      </header>

      {/* ── Page content ─────────────────────────────────────────────────── */}
      <main className='p-4'>{children}</main>

      {/* ── Logout confirm ───────────────────────────────────────────────── */}
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

// ─────────────────────────────────────────────────────────────────────────────
// AttendancePill — uses exact color tokens from globals.css @theme
// ─────────────────────────────────────────────────────────────────────────────

interface AttendancePillProps {
  status: 'PRESENT' | 'LATE' | null;
  time: string | null;
}

function AttendancePill({ status, time }: AttendancePillProps) {
  const isPresent = status === 'PRESENT';

  return (
    <div
      className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-bold ${
        isPresent
          ? 'border-success-200 bg-success-50 text-success-600 dark:border-success-500/20 dark:bg-success-500/10 dark:text-success-400'
          : 'border-warning-200 bg-warning-50 text-warning-600 dark:border-warning-500/20 dark:bg-warning-500/10 dark:text-warning-400'
      }`}
    >
      {isPresent ? (
        <span className='relative flex h-2 w-2 shrink-0'>
          <span className='bg-success-400 absolute inline-flex h-full w-full animate-ping rounded-full opacity-60' />
          <span className='bg-success-500 relative inline-flex h-2 w-2 rounded-full' />
        </span>
      ) : (
        <Clock size={12} className='shrink-0' />
      )}
      <span>{isPresent ? 'Hadir' : 'Terlambat'}</span>
      {time && <span className='opacity-70'>{time}</span>}
    </div>
  );
}
