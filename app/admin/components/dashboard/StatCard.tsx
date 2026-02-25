interface StatCardProps {
  label: string;
  value: number;
  subInfo?: string;
  variant: 'total' | 'unassigned' | 'assigned' | 'closed';
}

const accentMap = {
  total: {
    gradient: 'linear-gradient(90deg, #3b82f6, #8b5cf6)',
    valueClass: 'text-[var(--text-primary)]',
    bgAccent: 'bg-blue-500/10',
  },
  unassigned: {
    gradient: '#ef4444',
    valueClass: 'text-red-400',
    bgAccent: 'bg-red-500/10',
  },
  assigned: {
    gradient: '#f59e0b',
    valueClass: 'text-amber-400',
    bgAccent: 'bg-amber-500/10',
  },
  closed: {
    gradient: '#10b981',
    valueClass: 'text-emerald-400',
    bgAccent: 'bg-emerald-500/10',
  },
};

export default function StatCard({
  label,
  value,
  subInfo,
  variant,
}: StatCardProps) {
  const accent = accentMap[variant];

  return (
    <div className='group bg-surface relative overflow-hidden rounded-xl border border-(--border) p-4 transition-all duration-200 hover:-translate-y-1 hover:border-white/10 hover:shadow-lg md:p-5'>
      {/* Accent bar */}
      <div
        className='absolute top-0 right-0 left-0 h-1'
        style={{ background: accent.gradient }}
      />

      <div className='flex items-start justify-between'>
        <div className='flex-1'>
          <p className='mb-1 text-xs font-medium tracking-wider text-(--text-secondary) uppercase md:text-[11px]'>
            {label}
          </p>
          <p
            className={`font-syne text-3xl font-extrabold tracking-tight md:text-4xl lg:text-[42px] ${accent.valueClass}`}
          >
            {value.toLocaleString()}
          </p>
          {subInfo && (
            <p className='mt-1 text-[10px] text-(--text-muted) md:text-[11px]'>
              {subInfo}
            </p>
          )}
        </div>

        {/* Icon Circle */}
        <div
          className={`hidden rounded-full p-2.5 sm:block ${accent.bgAccent}`}
        >
          <div
            className='h-4 w-4 rounded-full'
            style={{ background: accent.gradient }}
          />
        </div>
      </div>
    </div>
  );
}
