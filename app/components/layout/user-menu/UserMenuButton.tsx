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
      className='hover:bg-surface-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none'
      title={name || 'User'}
    >
      <div className='flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-blue-500 to-violet-500 text-xs font-semibold text-white'>
        {initials}
      </div>
    </button>
  );
}
