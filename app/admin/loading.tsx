'use client';

'use client';


export default function Loading() {
  return (
    <phantom-ui suppressHydrationWarning fallback-radius={8}
      loading
      animation='shimmer'
      reveal={0.12}
      loading-label='Loading admin shell'
    >
      <div className='bg-bg flex min-h-screen'>
        <aside className='bg-surface fixed inset-y-0 left-0 flex w-55 flex-col border-r border-white/[0.07] p-4'>
          <div className='mb-8 space-y-2'>
            <div className='bg-surface-2 h-7 w-20 rounded' />
            <div className='bg-surface-2 h-3 w-24 rounded' />
          </div>
          <div className='space-y-4'>
            <div className='bg-surface-2 h-4 w-16 rounded' />
            <div className='space-y-2'>
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className='bg-surface-2 h-9 rounded-lg' />
              ))}
            </div>
          </div>
        </aside>

        <main className='ml-55 flex min-h-screen flex-1 flex-col'>
          <div className='bg-bg/80 flex h-16 items-center justify-between border-b border-white/[0.07] px-6'>
            <div className='bg-surface-2 h-9 w-64 rounded-lg' />
            <div className='flex items-center gap-4'>
              <div className='bg-surface-2 h-8 w-8 rounded-full' />
              <div className='bg-surface-2 h-8 w-32 rounded-lg' />
            </div>
          </div>

          <div className='flex flex-col gap-6 p-6'>
            <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4'>
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className='bg-surface rounded-2xl border border-white/[0.07] p-5'
                >
                  <div className='bg-surface-2 mb-3 h-4 w-24 rounded' />
                  <div className='bg-surface-2 h-8 w-16 rounded' />
                </div>
              ))}
            </div>

            <div className='bg-surface rounded-2xl border border-white/[0.07] p-6'>
              <div className='bg-surface-2 mb-4 h-6 w-32 rounded' />
              <div className='space-y-3'>
                {Array.from({ length: 3 }).map((_, i) => (
                  <div
                    key={i}
                    className='flex items-center justify-between rounded-xl border border-(--border) p-4'
                  >
                    <div className='flex items-center gap-4'>
                      <div className='bg-surface-2 h-4 w-4 rounded' />
                      <div className='bg-surface-2 h-4 w-32 rounded' />
                    </div>
                    <div className='bg-surface-2 h-6 w-16 rounded' />
                  </div>
                ))}
              </div>
            </div>

            <div className='bg-surface rounded-2xl border border-white/[0.07] p-6'>
              <div className='bg-surface-2 mb-4 h-6 w-32 rounded' />
              <div className='space-y-3'>
                {Array.from({ length: 3 }).map((_, i) => (
                  <div
                    key={i}
                    className='flex items-center justify-between rounded-xl border border-(--border) p-4'
                  >
                    <div className='flex items-center gap-4'>
                      <div className='bg-surface-2 h-4 w-4 rounded' />
                      <div className='bg-surface-2 h-4 w-32 rounded' />
                    </div>
                    <div className='bg-surface-2 h-6 w-16 rounded' />
                  </div>
                ))}
              </div>
            </div>

            <div className='bg-surface rounded-2xl border border-white/[0.07] p-6'>
              <div className='bg-surface-2 mb-4 h-6 w-48 rounded' />
              <div className='space-y-3'>
                {Array.from({ length: 8 }).map((_, i) => (
                  <div
                    key={i}
                    className='flex items-center gap-4 rounded-xl border border-(--border) p-4'
                  >
                    {Array.from({ length: 10 }).map((_, j) => (
                      <div
                        key={j}
                        className='bg-surface-2 h-4 rounded'
                        style={{
                          width: j === 0 ? '2rem' : j < 3 ? '6rem' : '4rem',
                        }}
                      />
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </main>
      </div>
    </phantom-ui>
  );
}
