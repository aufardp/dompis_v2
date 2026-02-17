'use client';

interface Props {
  name?: string;
  initials: string;
  onClick: () => void;
}

export default function UserMenuButton({ name, initials, onClick }: Props) {
  return (
    <button
      type='button'
      onClick={onClick}
      className='flex items-center gap-2 rounded-full p-1 pr-2 transition-colors hover:bg-slate-100 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none'
    >
      <div className='flex h-9 w-9 items-center justify-center rounded-full bg-blue-600 text-sm font-medium text-white'>
        {initials}
      </div>
      <span className='max-w-28 truncate text-xs font-semibold text-slate-700 sm:max-w-40 sm:text-sm'>
        {name || 'User'}
      </span>
    </button>
  );
}
