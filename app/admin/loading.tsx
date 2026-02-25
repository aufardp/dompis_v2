export default function Loading() {
  return (
    <div className='bg-bg flex min-h-screen'>
      <aside className='bg-surface fixed inset-y-0 left-0 flex w-[220px] flex-col border-r border-white/[0.07] p-4'>
        <div className='mb-8'>
          <div className='bg-surface-2 h-7 w-20 animate-pulse rounded' />
          <div className='bg-surface-2 mt-2 h-3 w-24 animate-pulse rounded' />
        </div>

        <div className='space-y-4'>
          <div className='bg-surface-2 h-4 w-16 animate-pulse rounded' />
          <div className='space-y-2'>
            <div className='bg-surface-2 h-9 animate-pulse rounded-lg' />
            <div className='bg-surface-2 h-9 animate-pulse rounded-lg' />
          </div>
        </div>
      </aside>

      <main className='ml-[220px] flex min-h-screen flex-1 flex-col'>
        <div className='bg-bg/80 h-16 border-b border-white/[0.07]' />

        <div className='flex flex-col gap-6 p-6'>
          <div className='grid grid-cols-4 gap-4'>
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className='bg-surface h-32 animate-pulse rounded-2xl border border-white/[0.07] p-5'
              />
            ))}
          </div>

          <div className='bg-surface h-64 animate-pulse rounded-2xl border border-white/[0.07] p-6' />

          <div className='bg-surface h-96 animate-pulse rounded-2xl border border-white/[0.07] p-6' />
        </div>
      </main>
    </div>
  );
}
