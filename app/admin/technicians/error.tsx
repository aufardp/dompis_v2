'use client';

import { useEffect } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import Button from '@/app/components/ui/Button';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Technicians page error:', error);
  }, [error]);

  return (
    <div className='flex min-h-[400px] flex-col items-center justify-center py-16 text-center'>
      <AlertTriangle className='h-12 w-12 text-red-500' />
      <h2 className='mt-4 text-lg font-semibold text-slate-800'>
        Terjadi Kesalahan
      </h2>
      <p className='mt-2 max-w-md text-sm text-slate-500'>
        {error.message || 'Gagal memuat data teknisi. Silakan coba lagi.'}
      </p>
      <Button onClick={() => reset()} className='mt-6 flex items-center gap-2'>
        <RefreshCw size={16} />
        Coba Lagi
      </Button>
    </div>
  );
}
