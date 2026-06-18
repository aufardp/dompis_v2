'use client';

import '@aejkatappaja/phantom-ui';

export default function RekapSkeleton() {
  return (
    <phantom-ui
      suppressHydrationWarning
      fallback-radius={8}
      loading
      animation='shimmer'
      reveal={0.12}
      loading-label='Loading rekap workorder'
    >
      <div className='space-y-4'>
        <div className='overflow-hidden rounded-[28px] border border-(--border) bg-(--surface) shadow-sm'>
          <div className='border-b border-(--border) bg-(--surface-2) px-4 py-4'>
            <div className='h-4 w-32 rounded-full bg-(--surface-3)' />
            <div className='mt-3 h-6 w-56 rounded-full bg-(--surface-3)' />
            <div className='mt-2 h-4 w-72 max-w-full rounded-full bg-(--surface-3)' />
          </div>

          <div className='space-y-4 p-4'>
            <div className='grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-5'>
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className='rounded-2xl border border-(--border) bg-(--surface-2) p-3'
                >
                  <div className='h-3 w-20 rounded-full bg-(--surface-3)' />
                  <div className='mt-3 h-7 w-16 rounded-full bg-(--surface-3)' />
                  <div className='mt-2 h-3 w-24 rounded-full bg-(--surface-3)' />
                </div>
              ))}
            </div>

            <div className='grid gap-4 lg:grid-cols-[minmax(0,1.65fr)_minmax(280px,0.95fr)]'>
              <div className='space-y-3'>
                <div className='h-90 rounded-[28px] border border-(--border) bg-(--surface-2)' />
                <div className='grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-6'>
                  {Array.from({ length: 24 }).map((_, i) => (
                    <div
                      key={i}
                      className='rounded-2xl border border-(--border) bg-(--surface-2) p-2'
                    >
                      <div className='mx-auto h-3 w-6 rounded-full bg-(--surface-3)' />
                      <div className='mx-auto mt-2 h-8 w-2 rounded-full bg-(--surface-3)' />
                      <div className='mx-auto mt-2 h-3 w-4 rounded-full bg-(--surface-3)' />
                    </div>
                  ))}
                </div>
              </div>

              <div className='space-y-3'>
                <div className='h-65 rounded-[28px] border border-(--border) bg-(--surface-2)' />
                <div className='h-37.5 rounded-[28px] border border-(--border) bg-(--surface-2)' />
              </div>
            </div>
          </div>
        </div>
      </div>
    </phantom-ui>
  );
}
