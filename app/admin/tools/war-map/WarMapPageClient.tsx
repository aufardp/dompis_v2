'use client';

import dynamic from 'next/dynamic';

const WarMapClient = dynamic(() => import('./components/WarMapClient'), {
  ssr: false,
  loading: () => (
    <div className='grid gap-3 lg:grid-cols-[300px_1fr]'>
      <div className='h-[420px] animate-pulse rounded-2xl border border-(--border) bg-(--surface)' />
      <div className='h-[calc(100dvh-220px)] min-h-[480px] animate-pulse rounded-2xl border border-(--border) bg-(--surface)' />
    </div>
  ),
});

export default function WarMapPageClient() {
  return <WarMapClient />;
}