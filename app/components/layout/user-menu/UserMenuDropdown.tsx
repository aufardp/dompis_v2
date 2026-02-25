'use client';

import {
  UserIcon,
  ArrowRightOnRectangleIcon,
} from '@heroicons/react/24/outline';

interface Props {
  onProfile: () => void;
  onLogout: () => void;
}

export default function UserMenuDropdown({ onProfile, onLogout }: Props) {
  return (
    <div className='ring-opacity-5 bg-surface absolute top-12 right-0 z-50 w-56 rounded-lg border border-[var(--border)] shadow-lg'>
      <div className='p-2'>
        <button
          onClick={onProfile}
          className='hover:bg-surface-2 flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-[var(--text-primary)]'
        >
          <UserIcon className='h-4 w-4' />
          Profile
        </button>
        <button
          onClick={onLogout}
          className='flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-red-400 hover:bg-red-400/10'
        >
          <ArrowRightOnRectangleIcon className='h-4 w-4' />
          Logout
        </button>
      </div>
    </div>
  );
}
