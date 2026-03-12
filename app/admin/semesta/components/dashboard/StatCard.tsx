'use client';

import { cn } from '@/app/libs/utils';

export type StatCardVariant = 'total' | 'open' | 'progress' | 'closed';

const variantStyles: Record<
  StatCardVariant,
  { accent: string; pill: string; dot: string }
> = {
  total: {
    accent: 'from-blue-500/20 via-indigo-500/10 to-transparent',
    pill: 'bg-blue-500/10 text-blue-300',
    dot: 'bg-blue-400',
  },
  open: {
    accent: 'from-amber-500/20 via-orange-500/10 to-transparent',
    pill: 'bg-amber-500/10 text-amber-300',
    dot: 'bg-amber-400',
  },
  progress: {
    accent: 'from-violet-500/20 via-fuchsia-500/10 to-transparent',
    pill: 'bg-violet-500/10 text-violet-300',
    dot: 'bg-violet-400',
  },
  closed: {
    accent: 'from-emerald-500/20 via-teal-500/10 to-transparent',
    pill: 'bg-emerald-500/10 text-emerald-300',
    dot: 'bg-emerald-400',
  },
};

export default function StatCard({
  title,
  value,
  subtitle,
  variant,
  loading,
}: {
  title: string;
  value: number;
  subtitle?: string;
  variant: StatCardVariant;
  loading?: boolean;
}) {
  const v = variantStyles[variant];

  return (
    <div
      className={cn(
        'group bg-surface relative overflow-hidden rounded-xl border border-(--border) p-4',
        'transition-all duration-300 ease-in-out hover:scale-[1.02] hover:border-white/10',
      )}
    >
      <div
        className={cn(
          'pointer-events-none absolute inset-0 opacity-80',
          'bg-gradient-to-br',
          v.accent,
        )}
      />

      <div className='relative flex items-start justify-between gap-3'>
        <div className='min-w-0'>
          <div
            className={cn(
              'inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-[10px] font-bold tracking-[1.2px] uppercase',
              v.pill,
            )}
          >
            <span className={cn('h-2 w-2 rounded-full', v.dot)} />
            {title}
          </div>

          {loading ? (
            <div className='bg-surface-2 mt-3 h-9 w-28 animate-pulse rounded-lg' />
          ) : (
            <div className='font-syne mt-3 text-3xl font-extrabold tracking-tight text-(--text-primary) md:text-4xl'>
              {value.toLocaleString()}
            </div>
          )}

          {subtitle && (
            <div className='mt-1 text-xs text-(--text-muted)'>{subtitle}</div>
          )}
        </div>

        <div className='hidden sm:block'>
          <div className='bg-surface-2 rounded-xl border border-(--border) px-3 py-2 text-xs font-semibold text-(--text-secondary)'>
            KPI
          </div>
        </div>
      </div>
    </div>
  );
}
