'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Moon, RefreshCw, ScanLine, Sun } from 'lucide-react';
import { useCurrentUser } from '@/app/hooks/useCurrentUser';

interface DashboardHeaderProps {
  loading?: boolean;
  refreshing?: boolean;
  onRefresh: () => void;
}

function useRealtimeClock() {
  const [time, setTime] = useState('');
  useEffect(() => {
    const update = () => {
      const now = new Date();
      const wib = new Date(now.getTime() + 7 * 60 * 60 * 1000);
      setTime(wib.toISOString().slice(11, 19) + ' WIB');
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, []);
  return time;
}

function useTheme() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    setDark(document.documentElement.classList.contains('dark'));
  }, []);
  const toggle = useCallback(() => {
    const next = !document.documentElement.classList.contains('dark');
    document.documentElement.classList.toggle('dark', next);
    localStorage.setItem('theme', next ? 'dark' : 'light');
    setDark(next);
  }, []);
  return { dark, toggle };
}

export default function DashboardHeader({
  loading,
  refreshing,
  onRefresh,
}: DashboardHeaderProps) {
  const router = useRouter();
  const { user, loading: userLoading } = useCurrentUser();
  const clock = useRealtimeClock();
  const { dark, toggle: toggleTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const initials = useMemo(() => {
    if (!user?.nama) return 'DT';
    return user.nama
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  }, [user?.nama]);

  const displayName = useMemo(() => {
    if (!mounted || userLoading) return 'Technician';
    const name = user?.nama?.trim();
    if (!name) return 'Technician';
    return name.split(' ')[0];
  }, [user?.nama, userLoading, mounted]);

  return (
    <section className='rounded-2xl border border-(--border) bg-(--surface) p-5 shadow-sm'>
      <div className='flex items-start justify-between gap-4'>
        <div className='min-w-0 flex-1'>
          <div className='flex items-center gap-2'>
            <h1 className='text-xl font-semibold text-(--text-primary)'>
              Hello, {displayName}
            </h1>
            <span className='inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-[#0052cc] dark:bg-blue-500/10'>
              Teknisi
            </span>
          </div>
          <p className='mt-1 flex items-center gap-1.5 text-xs text-(--text-secondary)'>
            <span className='inline-block h-1.5 w-1.5 rounded-full bg-green-500' />
            {clock}
          </p>
        </div>

        <div className='flex items-center gap-2'>
          <button
            type='button'
            onClick={toggleTheme}
            className='flex h-9 w-9 items-center justify-center rounded-lg border border-(--border) bg-(--surface-2) text-(--text-secondary) transition-all active:scale-95'
            title={dark ? 'Mode Terang' : 'Mode Gelap'}
          >
            {dark ? <Sun size={15} /> : <Moon size={15} />}
          </button>

          <button
            type='button'
            onClick={() => router.push('/teknisi/profile')}
            className='flex h-10 w-10 items-center justify-center rounded-full bg-[#0052cc] text-sm font-bold text-white ring-2 ring-[#0052cc]/20'
            title='Profile'
          >
            {initials}
          </button>
        </div>
      </div>

      <div className='mt-4 flex items-center gap-2'>
        <button
          type='button'
          onClick={() => router.push('/teknisi/join')}
          className='inline-flex items-center gap-1.5 rounded-lg border border-(--border) bg-(--surface-2) px-3 py-2 text-xs font-semibold text-(--text-secondary) transition-all active:scale-95'
        >
          <ScanLine size={14} /> Invite
        </button>
        <button
          type='button'
          onClick={() => onRefresh()}
          disabled={loading || refreshing}
          className='inline-flex items-center gap-1.5 rounded-lg bg-[#0052cc] px-3 py-2 text-xs font-semibold text-white transition-all active:scale-95 disabled:opacity-50'
        >
          <RefreshCw
            size={14}
            className={loading || refreshing ? 'animate-spin' : ''}
          />
          Refresh
        </button>
      </div>
    </section>
  );
}
