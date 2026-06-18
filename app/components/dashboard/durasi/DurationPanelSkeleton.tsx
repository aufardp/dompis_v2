'use client';

export default function DurationPanelSkeleton() {
  return (
    <div className='overflow-hidden rounded-lg border border-(--border) bg-(--surface)'>
      <div className='animate-pulse bg-(--surface-2) px-4 py-3'>
        <div className='h-4 w-40 rounded-full bg-(--surface-3)' />
        <div className='mt-2 h-3 w-56 rounded-full bg-(--surface-3)' />
      </div>
      <div className='space-y-2 p-3'>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className='flex gap-2 py-1.5'>
            <div className='h-4 w-20 rounded-full bg-(--surface-3)' />
            {Array.from({ length: 6 }).map((_, j) => (
              <div
                key={j}
                className='h-4 flex-1 rounded-full bg-(--surface-2)'
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
