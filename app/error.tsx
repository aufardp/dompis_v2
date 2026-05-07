'use client';

import { useEffect, useState } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [isReloading, setIsReloading] = useState(false);

  useEffect(() => {
    const isChunkError = 
      error.message?.includes('Loading chunk') ||
      error.message?.includes('Failed to fetch') ||
      error.message?.includes('chunk') ||
      error.message?.includes('Failed to load');

    if (isChunkError) {
      console.error('[ChunkLoadError] Detected - auto-reloading in 2s...');
      setIsReloading(true);
      setTimeout(() => {
        window.location.reload();
      }, 2000);
    }
  }, [error]);

  return (
    <div className='flex min-h-screen items-center justify-center bg-gray-50 px-4'>
      <div className='max-w-md rounded-lg bg-white p-8 shadow-lg'>
        <h2 className='mb-4 text-2xl font-bold text-red-600'>
          {isReloading ? 'Memperbarui Aplikasi...' : 'Terjadi Kesalahan'}
        </h2>
        <p className='mb-4 text-gray-600'>
          {isReloading 
            ? 'Memuat ulang aplikasi...' 
            : 'Maaf, terjadi kesalahan pada aplikasi.'}
        </p>
        {process.env.NODE_ENV === 'development' && !isReloading && (
          <pre className='mb-4 overflow-auto rounded bg-gray-100 p-2 text-xs text-red-500'>
            {error.message}
          </pre>
        )}
        {!isReloading && (
          <button
            onClick={reset}
            className='rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700'
          >
            Coba Lagi
          </button>
        )}
      </div>
    </div>
  );
}