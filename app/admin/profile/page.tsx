'use client';

import { useState } from 'react';
import AdminLayout from '@/app/components/layout/AdminLayout';
import { useCurrentUser } from '@/app/hooks/useCurrentUser';
import ChangePasswordModal from '@/app/components/layout/ChangePasswordModal';
import { useAutoRefresh } from '@/app/hooks/useAutoRefresh';

export default function AdminProfilePage() {
  const { user, loading, error, refresh } = useCurrentUser();
  const [showPasswordModal, setShowPasswordModal] = useState(false);

  useAutoRefresh({
    intervalMs: 300_000,
    refreshers: [refresh],
    pauseWhen: [showPasswordModal],
  });

  return (
    <AdminLayout>
      <div className='mx-auto max-w-2xl space-y-6'>
        <div className='bg-surface rounded-2xl border border-[var(--border)] p-6'>
          <h1 className='font-syne text-xl font-bold text-[var(--text-primary)]'>
            Profile
          </h1>
          <p className='mt-1 text-sm text-[var(--text-secondary)]'>
            Admin account details
          </p>

          <div className='mt-6 space-y-3 text-sm'>
            <div className='flex items-start justify-between gap-4'>
              <span className='text-[var(--text-secondary)]'>Name</span>
              <span className='font-semibold text-[var(--text-primary)]'>
                {loading ? 'Loading…' : user?.nama || '-'}
              </span>
            </div>
            <div className='flex items-start justify-between gap-4'>
              <span className='text-[var(--text-secondary)]'>Position</span>
              <span className='font-medium text-[var(--text-primary)]'>
                {loading ? 'Loading…' : user?.jabatan || '-'}
              </span>
            </div>
            <div className='flex items-start justify-between gap-4'>
              <span className='text-[var(--text-secondary)]'>Role</span>
              <span className='font-medium text-[var(--text-primary)]'>
                {loading ? 'Loading…' : user?.role_name || '-'}
              </span>
            </div>
          </div>

          {error && (
            <div className='mt-4 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-sm text-amber-400'>
              {error}
            </div>
          )}

          <div className='mt-6 flex flex-wrap gap-3'>
            <button
              onClick={() => setShowPasswordModal(true)}
              className='rounded-lg bg-gradient-to-r from-blue-500 to-indigo-500 px-4 py-2 text-sm font-medium text-white hover:opacity-90'
            >
              Change Password
            </button>
            <button
              onClick={refresh}
              className='bg-surface-2 hover:bg-surface-3 rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--text-primary)]'
            >
              Refresh
            </button>
          </div>
        </div>
      </div>

      <ChangePasswordModal
        isOpen={showPasswordModal}
        onClose={() => setShowPasswordModal(false)}
      />
    </AdminLayout>
  );
}
