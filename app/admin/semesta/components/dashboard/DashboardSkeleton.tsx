'use client';

import '@aejkatappaja/phantom-ui';

export default function DashboardSkeleton() {
  return (
    <phantom-ui suppressHydrationWarning fallback-radius={8}
      loading
      animation='shimmer'
      reveal={0.12}
      loading-label='Loading semesta dashboard'
    >
      <div className='space-y-6'>
        <div className='grid grid-cols-2 gap-4 md:grid-cols-4'>
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className='rounded-xl border border-(--border) bg-(--surface) p-4'
            >
              <div className='h-4 w-24 rounded-full bg-slate-200 dark:bg-slate-800' />
              <div className='mt-4 h-9 w-28 rounded-full bg-slate-200 dark:bg-slate-800' />
              <div className='mt-3 h-3 w-32 rounded-full bg-slate-100 dark:bg-slate-800/70' />
            </div>
          ))}
        </div>

        <div className='grid gap-6 lg:grid-cols-2'>
          {Array.from({ length: 2 }).map((_, i) => (
            <div
              key={i}
              className='rounded-xl border border-(--border) bg-(--surface) p-4'
            >
              <div className='h-4 w-40 rounded-full bg-slate-200 dark:bg-slate-800' />
              <div className='mt-2 h-3 w-56 rounded-full bg-slate-100 dark:bg-slate-800/70' />
              <div className='mt-6 h-[260px] rounded-xl bg-slate-200/70 dark:bg-slate-800/70' />
            </div>
          ))}
        </div>

        <div className='rounded-xl border border-(--border) bg-(--surface) p-4'>
          <div className='h-4 w-32 rounded-full bg-slate-200 dark:bg-slate-800' />
          <div className='mt-2 h-3 w-60 rounded-full bg-slate-100 dark:bg-slate-800/70' />
          <div className='mt-6 h-[280px] rounded-xl bg-slate-200/70 dark:bg-slate-800/70' />
        </div>
      </div>
    </phantom-ui>
  );
}
