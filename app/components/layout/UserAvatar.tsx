'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { fetchWithAuth } from '@/app/libs/fetcher';
import {
  LockClosedIcon,
  ArrowRightOnRectangleIcon,
} from '@heroicons/react/24/outline';

interface User {
  id_user: number;
  nama: string;
  jabatan: string;
  role_name: string;
}

interface Props {
  onPasswordChange?: () => void;
}

export default function UserAvatar({ onPasswordChange }: Props) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    fetchUser();
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchUser = async () => {
    try {
      const res = await fetchWithAuth('/api/users/me');
      if (!res) return;
      const data = await res.json();
      if (data.success) {
        setUser(data.data);
      }
    } catch (err) {
      console.error('Failed to fetch user:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    if (!confirm('Are you sure you want to logout?')) return;

    setLoggingOut(true);
    try {
      const res = await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });

      if (res.ok) {
        router.push('/login');
        router.refresh();
      }
    } catch (err) {
      console.error('Logout failed:', err);
    } finally {
      setLoggingOut(false);
    }
  };

  const handlePasswordChange = () => {
    setIsOpen(false);
    if (onPasswordChange) {
      onPasswordChange();
    }
  };

  if (loading) {
    return (
      <div className='flex h-10 w-10 items-center justify-center rounded-full bg-slate-200'>
        <div className='h-5 w-5 animate-spin rounded-full border-2 border-slate-400 border-t-transparent' />
      </div>
    );
  }

  const initials = user?.nama
    ? user.nama
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : '?';

  return (
    <div className='relative' ref={dropdownRef}>
      <button
        type='button'
        onClick={() => setIsOpen(!isOpen)}
        className='flex cursor-pointer items-center gap-2 rounded-full p-1 transition-colors hover:bg-slate-100 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none'
      >
        <div className='flex h-9 w-9 items-center justify-center rounded-full bg-blue-600 text-sm font-medium text-white'>
          {initials}
        </div>
      </button>

      {isOpen && user && (
        <div className='ring-opacity-5 absolute top-12 right-0 z-50 w-72 rounded-lg bg-white shadow-lg ring-1 ring-black'>
          <div className='border-b border-slate-200 p-4'>
            <div className='flex items-center gap-3'>
              <div className='flex h-12 w-12 items-center justify-center rounded-full bg-blue-600 text-lg font-medium text-white'>
                {initials}
              </div>
              <div className='flex-1 overflow-hidden'>
                <p className='truncate text-sm font-semibold text-slate-900'>
                  {user.nama}
                </p>
                <p className='truncate text-xs text-slate-500'>
                  {user.jabatan}
                </p>
              </div>
            </div>
            <div className='mt-3 rounded bg-slate-50 px-3 py-2'>
              <p className='text-xs text-slate-500'>Role</p>
              <p className='text-sm font-medium text-slate-900'>
                {user.role_name}
              </p>
            </div>
          </div>

          <div className='p-2'>
            <button
              onClick={handlePasswordChange}
              className='flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100'
            >
              <LockClosedIcon className='h-4 w-4' />
              Ubah Password
            </button>
            <button
              onClick={handleLogout}
              disabled={loggingOut}
              className='flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50'
            >
              <ArrowRightOnRectangleIcon className='h-4 w-4' />
              {loggingOut ? 'Logging out...' : 'Logout'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
