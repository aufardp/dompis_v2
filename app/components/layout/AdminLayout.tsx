'use client';

import { useState, ReactNode } from 'react';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import { useCurrentUser } from '@/app/hooks/useCurrentUser';

interface Props {
  children: ReactNode;
  onSearch?: (query: string) => void;
  onWorkzoneChange?: (workzone: string) => void;
  selectedWorkzone?: string;
}

export default function AdminLayout({
  children,
  onSearch,
  onWorkzoneChange,
  selectedWorkzone,
}: Props) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { loading: authLoading, error: authError } = useCurrentUser();

  if (authLoading) {
    return (
      <div className='bg-bg flex min-h-screen items-center justify-center'>
        <div className='flex flex-col items-center gap-3'>
          <div className='h-10 w-10 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600' />
          <p className='text-sm text-(--text-secondary)'>
            Memuat sesi...
          </p>
        </div>
      </div>
    );
  }

  if (authError) {
    return (
      <div className='bg-bg flex min-h-screen items-center justify-center px-6'>
        <div className='max-w-sm rounded-xl border border-(--border) bg-surface p-6 text-center shadow-sm'>
          <p className='text-base font-semibold text-(--text-primary)'>
            Sesi tidak valid
          </p>
          <p className='mt-2 text-sm text-(--text-secondary)'>
            Silakan login ulang untuk melanjutkan.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className='bg-bg flex min-h-screen overflow-x-clip'>
      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div
          className='fixed inset-0 z-40 bg-black/50 lg:hidden'
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar - hidden on mobile, slides in when open */}
      <div className={`lg:hidden ${sidebarOpen ? 'block' : 'hidden'}`}>
        <Sidebar
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          selectedWorkzone={selectedWorkzone}
        />
      </div>

      {/* Desktop Sidebar - collapsible, sticky on scroll */}
      <div
        className={`hidden shrink-0 transition-[width] duration-300 ease-in-out lg:block lg:sticky lg:top-0 lg:self-start lg:h-screen ${
          sidebarCollapsed ? 'w-0 overflow-hidden' : 'w-64'
        }`}
      >
        <div className='w-64'>
          <Sidebar
            isOpen={false}
            onClose={() => {}}
            selectedWorkzone={selectedWorkzone}
          />
        </div>
      </div>

      <main className='flex min-h-screen min-w-0 w-full flex-1 flex-col overflow-x-clip'>
        <Topbar
          onMenuClick={() => setSidebarOpen(true)}
          onToggleSidebar={() => setSidebarCollapsed((prev) => !prev)}
          sidebarCollapsed={sidebarCollapsed}
          onSearch={onSearch}
          onWorkzoneChange={onWorkzoneChange}
          selectedWorkzone={selectedWorkzone}
        />
        <div className='flex-1 min-w-0 overflow-auto overflow-x-hidden p-4 md:p-6'>
          {children}
        </div>
      </main>
    </div>
  );
}
