'use client';

import { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Application error:', error);
  }, [error]);

  return (
    <div className='flex min-h-screen items-center justify-center bg-gray-50 px-4'>
      <div className='max-w-md rounded-lg bg-white p-8 shadow-lg'>
        <h2 className='mb-4 text-2xl font-bold text-red-600'>
          Terjadi Kesalahan
        </h2>
        <p className='mb-4 text-gray-600'>
          Maaf, terjadi kesalahan pada aplikasi. Silakan coba lagi.
        </p>
        {process.env.NODE_ENV === 'development' && (
          <pre className='mb-4 overflow-auto rounded bg-gray-100 p-2 text-xs text-red-500'>
            {error.message}
          </pre>
        )}
        <button
          onClick={reset}
          className='rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700'
        >
          Coba Lagi
        </button>
      </div>
    </div>
  );
}
