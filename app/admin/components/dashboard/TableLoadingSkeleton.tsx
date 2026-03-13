'use client';

interface TableLoadingSkeletonProps {
  rows?: number;
  cols?: number;
}

export default function TableLoadingSkeleton({
  rows = 8,
  cols = 10,
}: TableLoadingSkeletonProps) {
  return (
    <div className='space-y-2 py-4'>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div
          key={rowIndex}
          className='flex items-center gap-4 rounded-xl border border-(--border) bg-(--surface) p-4'
        >
          {Array.from({ length: cols }).map((_, colIndex) => (
            <div
              key={colIndex}
              className='h-4 animate-shimmer rounded bg-(--surface-2)'
              style={{
                width: colIndex === 0 ? '2rem' : colIndex < 3 ? '6rem' : '4rem',
                background: 'linear-gradient(90deg, var(--surface-2) 25%, var(--surface-3) 50%, var(--surface-2) 75%)',
                backgroundSize: '200% 100%',
                animation: 'shimmer 1.5s ease-in-out infinite',
              }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
