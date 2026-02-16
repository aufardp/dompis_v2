'use client';

import { useRouter } from 'next/navigation';
import { LogOut, Ticket } from 'lucide-react';
import { useState } from 'react';
import Button from '../components/ui/Button';

export default function TeknisiLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);

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

  return (
    <div className='min-h-screen bg-slate-50'>
      <header className='sticky top-0 z-40 border-b bg-white shadow-sm'>
        <div className='mx-auto flex h-16 max-w-7xl items-center justify-between px-4'>
          <div className='flex items-center gap-3'>
            <div className='flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white'>
              <Ticket size={20} />
            </div>
            <div>
              <h1 className='text-lg font-bold text-slate-800'>Dompis</h1>
              <p className='text-xs text-slate-500'>Teknisi</p>
            </div>
          </div>
          <button
            onClick={() => setShowLogoutModal(true)}
            className='flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100'
          >
            <LogOut size={18} />
            Keluar
          </button>
        </div>
      </header>
      <main>{children}</main>

      {showLogoutModal && (
        <div
          className='fixed inset-0 z-50 flex items-center justify-center bg-black/50'
          onClick={() => setShowLogoutModal(false)}
        >
          <div
            className='w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl'
            onClick={(e) => e.stopPropagation()}
          >
            <div className='mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100'>
              <LogOut className='h-6 w-6 text-red-600' />
            </div>
            <h3 className='mb-2 text-lg font-semibold text-slate-800'>
              Keluar dari aplikasi?
            </h3>
            <p className='mb-6 text-sm text-slate-500'>
              Anda harus login kembali untuk mengakses aplikasi.
            </p>
            <div className='flex gap-3'>
              <Button
                onClick={() => setShowLogoutModal(false)}
                className='flex-1 rounded-xl border border-slate-200 py-2.5 font-medium text-slate-600 hover:bg-slate-50'
              >
                Batal
              </Button>
              <Button
                onClick={handleLogout}
                disabled={loggingOut}
                className='flex-1 rounded-xl bg-red-600 py-2.5 font-medium text-white hover:bg-red-700 disabled:opacity-50'
              >
                {loggingOut ? 'Keluar...' : 'Ya, Keluar'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
