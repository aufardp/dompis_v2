'use client';

import { useRouter } from 'next/navigation';
import { Ticket } from 'lucide-react';
import { useState } from 'react';
import UserMenu from '../components/layout/user-menu/UserMenu';
import LogoutConfirmModal from '../components/layout/LogoutConfirmModal';

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
        <div className='mx-auto flex h-16 items-center justify-between px-4'>
          <div className='flex items-center gap-3'>
            <div className='flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white'>
              <Ticket size={20} />
            </div>
            <div>
              <h1 className='text-lg font-bold text-slate-800'>Dompis</h1>
              <p className='text-xs text-slate-500'>Teknisi</p>
            </div>
          </div>
          <div className='flex items-center gap-2'>
            <UserMenu profileHref='/teknisi/profile' />
          </div>
        </div>
      </header>
      <main>{children}</main>

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
