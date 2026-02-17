'use client';

import { useState } from 'react';
import { useCurrentUser } from '@/app/hooks/useCurrentUser';
import ChangePasswordModal from '@/app/components/layout/ChangePasswordModal';

export default function TeknisiProfilePage() {
  const { user, loading, error, refresh } = useCurrentUser();
  const [showPasswordModal, setShowPasswordModal] = useState(false);

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

        <div className='mt-6 flex flex-wrap gap-3'>
          <button
            onClick={() => setShowPasswordModal(true)}
            className='rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700'
          >
            Change Password
          </button>
          <button
            onClick={refresh}
            className='rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50'
          >
            Refresh
          </button>
        </div>
      </div>

      <ChangePasswordModal
        isOpen={showPasswordModal}
        onClose={() => setShowPasswordModal(false)}
      />
    </div>
  );
}
