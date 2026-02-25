'use client';

import { useState, ReactNode } from 'react';
import Sidebar from './Sidebar';
import Topbar from './Topbar';

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

  return (
    <div className='bg-bg flex min-h-screen'>
      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div
          className='fixed inset-0 z-40 bg-black/50 lg:hidden'
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar - hidden on mobile, slides in when open */}
      <div className={`lg:hidden ${sidebarOpen ? 'block' : 'hidden'}`}>
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      </div>

      {/* Desktop Sidebar */}
      <div className='hidden lg:block'>
        <Sidebar isOpen={false} onClose={() => {}} />
      </div>

      <main className='flex min-h-screen w-full flex-1 flex-col'>
        <Topbar
          onMenuClick={() => setSidebarOpen(true)}
          onSearch={onSearch}
          onWorkzoneChange={onWorkzoneChange}
          selectedWorkzone={selectedWorkzone}
        />
        <div className='flex-1 overflow-auto p-4 md:p-6'>{children}</div>
      </main>
    </div>
  );
}
