'use client';


export default function AnalyticsSkeleton() {
  return (
    <phantom-ui suppressHydrationWarning fallback-radius={8}
      loading
      animation='shimmer'
      reveal={0.12}
      loading-label='Loading semesta analytics'
    >
      <div className='flex flex-col gap-5'>
        <div className='flex gap-3 overflow-x-auto pb-2'>
          {Array.from({ length: 8 }, (_, i) => (
            <div
              key={i}
              className='h-[104px] w-[180px] shrink-0 rounded-xl border border-(--border) bg-(--surface)'
            />
          ))}
        </div>

        <div className='grid gap-5 lg:grid-cols-2'>
          <div className='h-[340px] rounded-xl border border-(--border) bg-(--surface)' />
          <div className='h-[340px] rounded-xl border border-(--border) bg-(--surface)' />
        </div>

        <div className='h-[320px] rounded-xl border border-(--border) bg-(--surface)' />

        <div className='grid gap-5 lg:grid-cols-2'>
          <div className='h-[260px] rounded-xl border border-(--border) bg-(--surface)' />
          <div className='h-[260px] rounded-xl border border-(--border) bg-(--surface)' />
        </div>
      </div>
    </phantom-ui>
  );
}
