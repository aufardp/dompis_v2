export default function Loading() {
  return (
    <div className='bg-bg flex min-h-screen'>
      {/* Sidebar Skeleton */}
      <aside className='bg-surface fixed inset-y-0 left-0 flex w-[220px] flex-col border-r border-white/[0.07] p-4'>
        {/* Logo */}
        <div className='mb-8'>
          <div className='bg-surface-2 h-7 w-20 animate-shimmer rounded' />
          <div className='bg-surface-2 mt-2 h-3 w-24 animate-shimmer rounded' />
        </div>

        {/* Menu Items */}
        <div className='space-y-4'>
          <div className='bg-surface-2 h-4 w-16 animate-shimmer rounded' />
          <div className='space-y-2'>
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className='bg-surface-2 h-9 animate-shimmer rounded-lg'
              />
            ))}
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className='ml-[220px] flex min-h-screen flex-1 flex-col'>
        {/* Topbar Skeleton */}
        <div className='bg-bg/80 flex h-16 items-center justify-between border-b border-white/[0.07] px-6'>
          <div className='bg-surface-2 h-9 w-64 animate-shimmer rounded-lg' />
          <div className='flex items-center gap-4'>
            <div className='bg-surface-2 h-8 w-8 animate-shimmer rounded-full' />
            <div className='bg-surface-2 h-8 w-32 animate-shimmer rounded-lg' />
          </div>
        </div>

        {/* Dashboard Content */}
        <div className='flex flex-col gap-6 p-6'>
          {/* Stat Cards - 4 columns */}
          <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4'>
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className='bg-surface animate-shimmer rounded-2xl border border-white/[0.07] p-5'
              >
                <div className='mb-3 h-4 w-24 rounded bg-surface-2' />
                <div className='h-8 w-16 rounded bg-surface-2' />
              </div>
            ))}
          </div>

          {/* B2B Accordion Section */}
          <div className='bg-surface animate-shimmer rounded-2xl border border-white/[0.07] p-6'>
            <div className='mb-4 h-6 w-32 rounded bg-surface-2' />
            <div className='space-y-3'>
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className='flex items-center justify-between rounded-xl border border-(--border) p-4'
                >
                  <div className='flex items-center gap-4'>
                    <div className='h-4 w-4 rounded bg-surface-2' />
                    <div className='h-4 w-32 rounded bg-surface-2' />
                  </div>
                  <div className='h-6 w-16 rounded bg-surface-2' />
                </div>
              ))}
            </div>
          </div>

          {/* B2C Accordion Section */}
          <div className='bg-surface animate-shimmer rounded-2xl border border-white/[0.07] p-6'>
            <div className='mb-4 h-6 w-32 rounded bg-surface-2' />
            <div className='space-y-3'>
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className='flex items-center justify-between rounded-xl border border-(--border) p-4'
                >
                  <div className='flex items-center gap-4'>
                    <div className='h-4 w-4 rounded bg-surface-2' />
                    <div className='h-4 w-32 rounded bg-surface-2' />
                  </div>
                  <div className='h-6 w-16 rounded bg-surface-2' />
                </div>
              ))}
            </div>
          </div>

          {/* Table Skeleton */}
          <div className='bg-surface animate-shimmer rounded-2xl border border-white/[0.07] p-6'>
            <div className='mb-4 h-6 w-48 rounded bg-surface-2' />
            <div className='space-y-3'>
              {Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  className='flex items-center gap-4 rounded-xl border border-(--border) p-4'
                >
                  {Array.from({ length: 10 }).map((_, j) => (
                    <div
                      key={j}
                      className='h-4 rounded bg-surface-2'
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
  );
}
