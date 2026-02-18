'use client';

import { useState } from 'react';
import { useCurrentUser } from '@/app/hooks/useCurrentUser';
import ChangePasswordModal from '@/app/components/layout/ChangePasswordModal';
import { useRouter } from 'next/navigation';
import { ArrowLeft, KeyRound } from 'lucide-react';
import Button from '@/app/components/ui/Button';

export default function TeknisiProfilePage() {
  const { user, loading, error, refresh } = useCurrentUser();
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const router = useRouter();

  return (
    <div className='mx-auto max-w-2xl space-y-6 p-4 md:p-6'>
      <div className='rounded-2xl border border-slate-200 bg-white p-6 shadow-sm'>
        <h1 className='text-xl font-semibold text-slate-900'>Profile</h1>
        <p className='mt-1 text-sm text-slate-500'>Teknisi account details</p>

        <div className='mt-6 space-y-3 text-sm'>
          <div className='flex items-start justify-between gap-4'>
            <span className='text-slate-500'>Name</span>
            <span className='font-semibold text-slate-900'>
              {loading ? 'Loading…' : user?.nama || '-'}
            </span>
          </div>
          <div className='flex items-start justify-between gap-4'>
            <span className='text-slate-500'>Position</span>
            <span className='font-medium text-slate-900'>
              {loading ? 'Loading…' : user?.jabatan || '-'}
            </span>
          </div>
          <div className='flex items-start justify-between gap-4'>
            <span className='text-slate-500'>Role</span>
            <span className='font-medium text-slate-900'>
              {loading ? 'Loading…' : user?.role_name || '-'}
            </span>
          </div>
        </div>

        {error && (
          <div className='mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800'>
            {error}
          </div>
        )}

        <div className='mt-8 flex flex-col gap-3 sm:flex-row sm:justify-between'>
          <Button
            onClick={() => setShowPasswordModal(true)}
            className='flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-all duration-200 hover:bg-blue-700 hover:shadow-md active:scale-[0.98]'
          >
            <KeyRound size={16} />
            Change Password
          </Button>

          <Button
            onClick={() => router.push('/teknisi')}
            className='flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-all duration-200 hover:bg-blue-700 hover:shadow-md active:scale-[0.98]'
          >
            <ArrowLeft size={16} />
            Back
          </Button>
        </div>
      </div>

      <ChangePasswordModal
        isOpen={showPasswordModal}
        onClose={() => setShowPasswordModal(false)}
      />
    </div>
  );
}
