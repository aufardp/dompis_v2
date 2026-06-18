'use client';

import '@aejkatappaja/phantom-ui';

export default function Loading() {
  return (
    <phantom-ui suppressHydrationWarning fallback-radius={8} loading animation='shimmer' reveal={0.12} loading-label='Loading technicians'>
      <div className='flex min-h-screen items-center justify-center bg-(--bg) px-6'>
        <div className='w-full max-w-3xl rounded-3xl border border-(--border) bg-(--surface) p-6 shadow-sm'>
          <div className='space-y-4'>
            <div className='h-4 w-40 rounded-full bg-slate-200 dark:bg-slate-800' />
            <div className='h-8 w-64 rounded-full bg-slate-200 dark:bg-slate-800' />
            <div className='grid gap-3 sm:grid-cols-3'>
              {Array.from({ length: 3 }).map((_, index) => (
                <div
                  key={index}
                  className='h-24 rounded-2xl bg-slate-100 dark:bg-white/5'
                />
              ))}
            </div>
            <div className='rounded-2xl border border-(--border) bg-(--bg) p-4'>
              <div className='space-y-3'>
                {Array.from({ length: 4 }).map((_, index) => (
                  <div
                    key={index}
                    className='h-4 w-full rounded-full bg-slate-200 dark:bg-slate-800'
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </phantom-ui>
  );
}
