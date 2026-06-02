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
  onSearch: _onSearch,
  onWorkzoneChange,
  selectedWorkzone,
}: Props) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

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
          sidebarCollapsed ? 'w-0 overflow-hidden' : 'w-55'
        }`}
      >
        <div className='w-55'>
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
          onSearch={undefined}
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
