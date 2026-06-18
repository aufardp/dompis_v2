import { memo } from 'react';

interface TableLoadingSkeletonProps {
  rows?: number;
  cols?: number;
}

function TableLoadingSkeleton({
  rows = 8,
  cols = 10,
}: TableLoadingSkeletonProps) {
  return (
    <div className='space-y-3 py-4'>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div
          key={rowIndex}
          className='flex items-center gap-4 rounded-2xl border border-(--border) bg-(--surface) px-4 py-4 shadow-sm'
        >
          {Array.from({ length: cols }).map((_, colIndex) => (
            <div
              key={colIndex}
              className='h-4 animate-shimmer rounded-full bg-(--surface-2)'
              style={{
                width: colIndex === 0 ? '2rem' : colIndex < 3 ? '6.5rem' : '4.5rem',
                background:
                  'linear-gradient(90deg, var(--surface-2) 25%, var(--surface-3) 50%, var(--surface-2) 75%)',
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

export default memo(TableLoadingSkeleton);
