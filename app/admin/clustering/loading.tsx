'use client';


export default function ClusteringLoading() {
  return (
    <phantom-ui suppressHydrationWarning fallback-radius={8}
      loading
      animation='shimmer'
      reveal={0.12}
      loading-label='Loading clustering'
    >
      <div className='flex flex-col gap-6 p-6'>
        <div className='bg-surface-2 h-8 w-48 rounded' />

        <div className='grid grid-cols-1 gap-6 lg:grid-cols-2'>
          <div className='bg-surface rounded-2xl border border-white/[0.07] p-6'>
            <div className='bg-surface-2 mb-4 h-6 w-40 rounded' />
            <div className='space-y-3'>
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className='bg-surface-2 h-16 rounded-lg' />
              ))}
            </div>
          </div>
          <div className='bg-surface rounded-2xl border border-white/[0.07] p-6'>
            <div className='bg-surface-2 mb-4 h-6 w-40 rounded' />
            <div className='space-y-3'>
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className='bg-surface-2 h-16 rounded-lg' />
              ))}
            </div>
          </div>
        </div>

        <div className='bg-surface rounded-2xl border border-white/[0.07] p-6'>
          <div className='bg-surface-2 mb-4 h-6 w-56 rounded' />
          <div className='space-y-2'>
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className='flex items-center gap-4'>
                <div className='bg-surface-2 h-4 flex-1 rounded' />
                <div className='bg-surface-2 h-4 w-16 rounded' />
                <div className='bg-surface-2 h-4 w-16 rounded' />
              </div>
            ))}
          </div>
        </div>
      </div>
    </phantom-ui>
  );
}
