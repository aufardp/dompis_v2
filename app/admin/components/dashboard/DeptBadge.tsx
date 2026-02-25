import { cn } from '@/app/libs/utils';

export default function DeptBadge({ dept }: { dept: 'b2b' | 'b2c' | string }) {
  const isB2b = dept?.toLowerCase() === 'b2b';

  return (
    <span
      className={cn(
        'font-syne inline-block rounded px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase',
        isB2b
          ? 'bg-blue-500/10 text-blue-400'
          : 'bg-violet-500/10 text-violet-400',
      )}
    >
      {dept?.toUpperCase()}
    </span>
  );
}
