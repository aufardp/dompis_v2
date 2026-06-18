'use client';

import '@aejkatappaja/phantom-ui';

export default function Loading() {
  return (
    <phantom-ui suppressHydrationWarning fallback-radius={8}
      loading
      animation='shimmer'
      reveal={0.12}
      loading-label='Loading application'
    >
      <div className='flex min-h-screen items-center justify-center bg-(--bg)'>
        <div className='rounded-2xl border border-(--border) bg-(--surface) p-5 shadow-sm'>
          <div className='h-4 w-40 rounded-full bg-slate-200 dark:bg-slate-800' />
          <div className='mt-3 h-3 w-56 rounded-full bg-slate-100 dark:bg-slate-800/70' />
          <div className='mt-5 h-12 w-12 rounded-full bg-slate-200 dark:bg-slate-800' />
        </div>
      </div>
    </phantom-ui>
  );
}
