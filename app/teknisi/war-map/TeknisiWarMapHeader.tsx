'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

export default function TeknisiWarMapHeader() {
  const router = useRouter();

  const handleBack = () => {
    if (window.history.length > 1) {
      router.back();
    } else {
      router.push('/teknisi');
    }
  };

  return (
    <div className='flex items-center gap-3'>
      <button
        type='button'
        onClick={handleBack}
        aria-label='Kembali'
        title='Kembali'
        className='flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-(--border) bg-(--surface-2) text-(--text-secondary) transition-all active:scale-95'
      >
        <ArrowLeft size={18} />
      </button>
      <div>
        <h1 className='text-lg font-semibold text-(--text-primary)'>War Map</h1>
        <p className='text-xs text-(--text-secondary)'>
          Peta sebaran gangguan & topologi jaringan di sekitar Anda
        </p>
      </div>
    </div>
  );
}