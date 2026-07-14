'use client';

import { useState, useEffect } from 'react';

export default function ConnectionStatusIndicator() {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    setIsOnline(navigator.onLine);
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return (
    <div
      className='group relative inline-flex items-center'
      title={isOnline ? 'Terhubung ke internet' : 'Tidak ada koneksi internet'}
    >
      <span
        className={`inline-block h-2 w-2 rounded-full transition-colors ${
          isOnline ? 'bg-emerald-500' : 'bg-red-500'
        }`}
      />
      <span className='sr-only'>
        {isOnline ? 'Online' : 'Offline'}
      </span>
    </div>
  );
}
