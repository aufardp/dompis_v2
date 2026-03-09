'use client';

import { useRouter, usePathname } from 'next/navigation';
import { X } from 'lucide-react';

const MENU_ITEMS = [
  {
    label: 'Ticket Management',
    path: '/admin',
    icon: '📋',
  },
  {
    label: 'Database Semesta',
    path: '/admin/semesta',
    icon: '🗄️',
  },
  {
    label: 'Technicians',
    path: '/admin/technicians',
    icon: '👨‍🔧',
  },
];

interface NavItemProps {
  label: string;
  active?: boolean;
  onClick?: () => void;
  dotColor?: string;
  icon?: string;
}

function NavItem({ label, active, onClick, dotColor, icon }: NavItemProps) {
  return (
    <div
      onClick={onClick}
      className={`cursor-pointer rounded-lg px-3 py-2.5 text-sm font-medium transition-colors duration-200 ${
        active
          ? 'bg-white/10 text-(--text-primary)'
          : 'text-(--text-secondary) hover:bg-white/5 hover:text-(--text-primary)'
      }`}
    >
      <div className='flex items-center gap-3'>
        {icon && <span className='text-base'>{icon}</span>}
        {dotColor && (
          <span
            className='h-2 w-2 rounded-full'
            style={{ backgroundColor: dotColor }}
          />
        )}
        <span>{label}</span>
      </div>
    </div>
  );
}

export default function Sidebar({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname();

  const handleNavigate = (path: string) => {
    router.push(path);
    onClose();
  };

  return (
    <aside
      className={`bg-surface fixed inset-y-0 left-0 z-50 flex w-70 flex-col border-r border-(--border) transition-transform duration-300 ease-in-out lg:static lg:w-55 lg:translate-x-0 ${
        isOpen ? 'translate-x-0' : '-translate-x-full'
      }`}
    >
      {/* Header */}
      <div className='flex items-center justify-between p-4 lg:p-4'>
        <div>
          <p className='font-syne text-xl font-extrabold text-(--text-primary)'>
            Dompis
          </p>
          <p className='text-[10px] tracking-[2px] text-(--text-secondary) uppercase'>
            Admin Portal
          </p>
        </div>
        <button
          onClick={onClose}
          className='hover:bg-surface-2 rounded-lg p-2 lg:hidden'
        >
          <X className='h-5 w-5 text-(--text-secondary)' />
        </button>
      </div>

      {/* Main Navigation */}
      <div className='px-3 lg:px-3'>
        <p className='mb-2 px-2 text-[10px] font-bold tracking-[1.5px] text-(--text-muted) uppercase'>
          Main
        </p>
        <nav className='mb-6 flex flex-col gap-1'>
          {MENU_ITEMS.map((item) => {
            const isActive =
              pathname === item.path ||
              (item.path === '/admin' && pathname === '/admin');
            return (
              <NavItem
                key={item.path}
                label={item.label}
                icon={item.icon}
                active={isActive}
                onClick={() => handleNavigate(item.path)}
              />
            );
          })}
        </nav>
      </div>

      {/* User Profile */}
      <div className='bg-surface-2 m-3 mt-auto rounded-xl p-3'>
        <div className='flex items-center gap-3'>
          <div className='font-syne flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-blue-500 to-violet-500 text-sm font-bold text-white'>
            AD
          </div>
          <div className='min-w-0 flex-1'>
            <p className='truncate text-sm leading-tight font-medium text-(--text-primary)'>
              Admin
            </p>
            <p className='text-xs text-(--text-secondary)'>Administrator</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
