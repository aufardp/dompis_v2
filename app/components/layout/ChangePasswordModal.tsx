'use client';

import { useState } from 'react';
import {
  XMarkIcon,
  LockClosedIcon,
  EyeIcon,
  EyeSlashIcon,
} from '@heroicons/react/24/outline';
import Button from '../ui/Button';
import { fetchWithAuth } from '@/app/libs/fetcher';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function ChangePasswordModal({ isOpen, onClose }: Props) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!currentPassword || !newPassword || !confirmPassword) {
      setError('Semua field harus diisi');
      return;
    }

    if (newPassword.length < 6) {
      setError('Password baru minimal 6 karakter');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Password baru dan konfirmasi password tidak sama');
      return;
    }

    if (currentPassword === newPassword) {
      setError('Password baru harus berbeda dari password saat ini');
      return;
    }

    setLoading(true);

    try {
      const res = await fetchWithAuth('/api/users/change-password', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          currentPassword,
          newPassword,
        }),
      });

      if (!res) return;

      const data = await res.json();

      if (data.success) {
        setSuccess('Password berhasil diubah');
        setTimeout(() => {
          onClose();
          setCurrentPassword('');
          setNewPassword('');
          setConfirmPassword('');
        }, 1500);
      } else {
        setError(data.message || 'Gagal mengubah password');
      }
    } catch {
      setError('Terjadi kesalahan saat mengubah password');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/50'>
      <div className='w-full max-w-md rounded-lg bg-white p-6 shadow-xl'>
        <div className='mb-4 flex items-center justify-between'>
          <div className='flex items-center gap-2'>
            <LockClosedIcon className='h-5 w-5 text-blue-600' />
            <h2 className='text-lg font-semibold text-slate-900'>
              Ubah Password
            </h2>
          </div>
          <button onClick={onClose} className='rounded p-1 hover:bg-slate-100'>
            <XMarkIcon className='h-5 w-5 text-slate-500' />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {error && (
            <div className='mb-4 rounded bg-red-50 p-3 text-sm text-red-600'>
              {error}
            </div>
          )}

          {success && (
            <div className='mb-4 rounded bg-green-50 p-3 text-sm text-green-600'>
              {success}
            </div>
          )}

          <div className='space-y-4'>
            <div>
              <label className='mb-1 block text-sm font-medium text-slate-700'>
                Password Saat Ini
              </label>
              <div className='relative'>
                <input
                  type={showCurrentPassword ? 'text' : 'password'}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className='w-full rounded-lg border border-slate-300 px-4 py-2 pr-10 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none'
                  placeholder='Masukkan password saat ini'
                />
                <button
                  type='button'
                  onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                  className='absolute top-1/2 right-2 -translate-y-1/2 text-slate-400 hover:text-slate-600'
                >
                  {showCurrentPassword ? (
                    <EyeSlashIcon className='h-5 w-5' />
                  ) : (
                    <EyeIcon className='h-5 w-5' />
                  )}
                </button>
              </div>
            </div>

            <div>
              <label className='mb-1 block text-sm font-medium text-slate-700'>
                Password Baru
              </label>
              <div className='relative'>
                <input
                  type={showNewPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className='w-full rounded-lg border border-slate-300 px-4 py-2 pr-10 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none'
                  placeholder='Masukkan password baru'
                />
                <button
                  type='button'
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className='absolute top-1/2 right-2 -translate-y-1/2 text-slate-400 hover:text-slate-600'
                >
                  {showNewPassword ? (
                    <EyeSlashIcon className='h-5 w-5' />
                  ) : (
                    <EyeIcon className='h-5 w-5' />
                  )}
                </button>
              </div>
            </div>

            <div>
              <label className='mb-1 block text-sm font-medium text-slate-700'>
                Konfirmasi Password Baru
              </label>
              <div className='relative'>
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className='w-full rounded-lg border border-slate-300 px-4 py-2 pr-10 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none'
                  placeholder='Konfirmasi password baru'
                />
                <button
                  type='button'
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className='absolute top-1/2 right-2 -translate-y-1/2 text-slate-400 hover:text-slate-600'
                >
                  {showConfirmPassword ? (
                    <EyeSlashIcon className='h-5 w-5' />
                  ) : (
                    <EyeIcon className='h-5 w-5' />
                  )}
                </button>
              </div>
            </div>
          </div>

          <div className='mt-6 flex gap-3'>
            <Button
              type='button'
              variant='outline'
              onClick={onClose}
              className='flex-1'
            >
              Batal
            </Button>
            <Button type='submit' disabled={loading} className='flex-1'>
              {loading ? 'Menyimpan...' : 'Simpan'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
