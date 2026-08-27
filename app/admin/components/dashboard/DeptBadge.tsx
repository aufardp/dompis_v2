import { memo } from 'react';
import { cn } from '@/app/libs/utils';

function DeptBadge({ dept }: { dept: 'b2b' | 'b2c' | 'netral' | 'neutral' | string }) {
  const normalized = dept?.toLowerCase() === 'neutral' ? 'netral' : dept?.toLowerCase();
  const isB2b = normalized === 'b2b';
  const isNetral = normalized === 'netral';

  return (
    <span
      className={cn(
        'font-syne inline-block rounded px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase',
        isB2b
          ? 'bg-blue-500/10 text-blue-400'
          : isNetral
            ? 'bg-slate-500/10 text-slate-400'
            : 'bg-violet-500/10 text-violet-400',
      )}
    >
      {normalized?.toUpperCase()}
    </span>
  );
}

export default memo(DeptBadge);
