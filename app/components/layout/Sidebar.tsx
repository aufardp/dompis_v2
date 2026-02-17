'use client';

import { useRouter, usePathname } from 'next/navigation';

const MENU_ITEMS = [
  {
    label: 'Tickets',
    path: '/admin',
  },
  {
    label: 'Technicians',
    path: '/admin/technicians',
  },
];

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
    <>
      {/* Overlay */}
      {isOpen && (
        <div
          className='fixed inset-0 z-40 bg-black/50 lg:hidden'
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 transform flex-col border-r border-slate-200 bg-white transition-transform duration-300 ease-in-out lg:static ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        } lg:translate-x-0`}
      >
        {/* Header */}
        <div className='border-b p-4 sm:p-6'>
          <h1 className='text-primary text-base font-bold sm:text-lg'>
            Dompis
          </h1>
          <p className='text-xs text-slate-500 uppercase'>Admin Portal</p>
        </div>

        {/* Navigation */}
        <nav className='flex-1 space-y-1 overflow-y-auto p-3 text-sm sm:space-y-2 sm:p-4'>
          {MENU_ITEMS.map((item) => {
            const isActive = pathname.startsWith(item.path);

            return (
              <NavItem
                key={item.path}
                label={item.label}
                active={isActive}
                onClick={() => handleNavigate(item.path)}
              />
            );
          })}
        </nav>
      </aside>
    </>
  );
}

function NavItem({
  label,
  active,
  onClick,
}: {
  label: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`cursor-pointer rounded-lg px-3 py-2 transition-colors duration-200 sm:px-4 ${
        active
          ? 'bg-primary/10 text-primary font-semibold'
          : 'text-slate-600 hover:bg-slate-50'
      }`}
    >
      {label}
    </div>
  );
}
