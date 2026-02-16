'use client';

import { useState, ReactNode } from 'react';
import Sidebar from './Sidebar';
import Topbar from './Topbar';

interface Props {
  children: ReactNode;
  onSearch?: (query: string) => void;
}

export default function AdminLayout({ children, onSearch }: Props) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className='flex h-screen'>
      <Sidebar />
      <div className='flex flex-1 flex-col overflow-hidden'>
        <Topbar onMenuClick={() => setSidebarOpen(true)} onSearch={onSearch} />
        <div className='bg-background-light flex-1 overflow-y-auto p-4 md:p-8'>
          {children}
        </div>
      </div>
    </div>
  );
}
