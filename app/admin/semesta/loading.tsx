'use client';


export default function SemestaLoading() {
  return (
    <phantom-ui suppressHydrationWarning fallback-radius={8}
      loading
      animation='shimmer'
      reveal={0.12}
      loading-label='Loading semesta analytics'
    >
      <div className='flex flex-col gap-6 p-6'>
        <div className='bg-surface-2 h-8 w-48 rounded' />
        <div className='bg-surface-2 h-5 w-96 rounded' />

        <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4'>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className='bg-surface rounded-2xl border border-white/[0.07] p-5'>
              <div className='bg-surface-2 mb-2 h-4 w-24 rounded' />
              <div className='bg-surface-2 h-8 w-16 rounded' />
            </div>
          ))}
        </div>

        <div className='grid grid-cols-1 gap-6 lg:grid-cols-2'>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className='bg-surface rounded-2xl border border-white/[0.07] p-6'>
              <div className='bg-surface-2 mb-4 h-5 w-40 rounded' />
              <div className='h-48 rounded-lg bg-white/[0.03]' />
            </div>
          ))}
        </div>
      </div>
    </phantom-ui>
  );
}
