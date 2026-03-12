'use client';

export default function DashboardSkeleton() {
  return (
    <div className='space-y-6'>
      <div className='grid grid-cols-2 gap-4 md:grid-cols-4'>
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className='bg-surface rounded-xl border border-(--border) p-4'
          >
            <div className='bg-surface-2 h-4 w-24 animate-pulse rounded' />
            <div className='bg-surface-2 mt-4 h-9 w-28 animate-pulse rounded' />
            <div className='bg-surface-2 mt-3 h-3 w-32 animate-pulse rounded' />
          </div>
        ))}
      </div>

      <div className='grid gap-6 lg:grid-cols-2'>
        {Array.from({ length: 2 }).map((_, i) => (
          <div
            key={i}
            className='bg-surface rounded-xl border border-(--border) p-4'
          >
            <div className='bg-surface-2 h-4 w-40 animate-pulse rounded' />
            <div className='bg-surface-2 mt-2 h-3 w-56 animate-pulse rounded' />
            <div className='bg-surface-2 mt-6 h-[260px] w-full animate-pulse rounded-xl' />
          </div>
        ))}
      </div>

      <div className='bg-surface rounded-xl border border-(--border) p-4'>
        <div className='bg-surface-2 h-4 w-32 animate-pulse rounded' />
        <div className='bg-surface-2 mt-2 h-3 w-60 animate-pulse rounded' />
        <div className='bg-surface-2 mt-6 h-[280px] w-full animate-pulse rounded-xl' />
      </div>
    </div>
  );
}
