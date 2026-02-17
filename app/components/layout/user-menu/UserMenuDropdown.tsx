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
    <div className='ring-opacity-5 absolute top-12 right-0 z-50 w-56 rounded-lg bg-white shadow-lg ring-1 ring-black'>
      <div className='p-2'>
        <button
          onClick={onProfile}
          className='flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100'
        >
          <UserIcon className='h-4 w-4' />
          Profile
        </button>
        <button
          onClick={onLogout}
          className='flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50'
        >
          <ArrowRightOnRectangleIcon className='h-4 w-4' />
          Logout
        </button>
      </div>
    </div>
  );
}
