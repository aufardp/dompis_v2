'use client';

export default function Loading() {
  return (
    <div className='min-h-screen bg-[#0a0a0f] p-6'>
      <div className='mx-auto max-w-7xl space-y-6'>
        <div className='space-y-2'>
          <div className='h-8 w-64 animate-pulse rounded bg-white/5' />
          <div className='h-4 w-96 animate-pulse rounded bg-white/5' />
        </div>
        <div className='grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4'>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className='h-32 animate-pulse rounded-xl bg-white/5' />
          ))}
        </div>
        <div className='h-64 animate-pulse rounded-xl bg-white/5' />
      </div>
    </div>
  );
}
