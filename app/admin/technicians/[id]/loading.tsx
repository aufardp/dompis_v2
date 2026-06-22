'use client';


export default function TechnicianDetailLoading() {
  return (
    <phantom-ui suppressHydrationWarning fallback-radius={8}
      loading
      animation='shimmer'
      reveal={0.12}
      loading-label='Loading technician detail'
    >
      <div className='flex flex-col gap-6 p-6'>
        <div className='flex items-center gap-4'>
          <div className='bg-surface-2 h-8 w-8 rounded' />
          <div className='bg-surface-2 h-8 w-48 rounded' />
        </div>

        <div className='grid grid-cols-1 gap-6 lg:grid-cols-3'>
          <div className='bg-surface rounded-2xl border border-white/[0.07] p-6 lg:col-span-1'>
            <div className='flex flex-col items-center gap-4'>
              <div className='bg-surface-2 h-24 w-24 rounded-full' />
              <div className='bg-surface-2 h-6 w-32 rounded' />
              <div className='bg-surface-2 h-4 w-24 rounded' />
            </div>
            <div className='mt-6 space-y-3'>
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className='bg-surface-2 h-10 rounded-lg' />
              ))}
            </div>
          </div>

          <div className='lg:col-span-2 space-y-6'>
            <div className='bg-surface rounded-2xl border border-white/[0.07] p-6'>
              <div className='bg-surface-2 mb-4 h-6 w-40 rounded' />
              <div className='space-y-3'>
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className='bg-surface-2 h-14 rounded-lg' />
                ))}
              </div>
            </div>

            <div className='bg-surface rounded-2xl border border-white/[0.07] p-6'>
              <div className='bg-surface-2 mb-4 h-6 w-40 rounded' />
              <div className='space-y-2'>
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className='flex items-center gap-4'>
                    <div className='bg-surface-2 h-4 flex-1 rounded' />
                    <div className='bg-surface-2 h-4 w-20 rounded' />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </phantom-ui>
  );
}
