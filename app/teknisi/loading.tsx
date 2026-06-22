'use client';


export default function TeknisiDashboardLoading() {
  return (
    <phantom-ui suppressHydrationWarning fallback-radius={8}
      loading
      animation='shimmer'
      reveal={0.12}
      loading-label='Loading teknisi dashboard'
    >
      <div className='flex flex-col gap-6 p-6'>
        <div className='bg-surface-2 h-8 w-48 rounded' />

        <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4'>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className='bg-surface rounded-2xl border border-white/[0.07] p-5'>
              <div className='bg-surface-2 mb-2 h-4 w-20 rounded' />
              <div className='bg-surface-2 h-8 w-12 rounded' />
            </div>
          ))}
        </div>

        <div className='bg-surface rounded-2xl border border-white/[0.07] p-6'>
          <div className='bg-surface-2 mb-4 h-6 w-40 rounded' />
          <div className='space-y-3'>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className='flex items-center gap-4 rounded-xl border border-white/[0.07] p-4'>
                <div className='bg-surface-2 h-10 w-10 rounded-full' />
                <div className='flex-1 space-y-2'>
                  <div className='bg-surface-2 h-4 w-48 rounded' />
                  <div className='bg-surface-2 h-3 w-32 rounded' />
                </div>
                <div className='bg-surface-2 h-6 w-20 rounded-full' />
              </div>
            ))}
          </div>
        </div>
      </div>
    </phantom-ui>
  );
}
