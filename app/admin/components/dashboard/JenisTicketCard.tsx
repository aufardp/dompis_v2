import React from 'react';

interface JenisTicketCardProps {
  jenisKey: 'sqm-ccan' | 'indibiz' | 'datin' | 'reseller' | 'wifi-id';
  label: string;
  icon: string;
  accentColor: string;
  total: number;
  open: number;
  assigned: number;
  close: number;
  totalGroup: number;
  ttrLabel?: string;
}

function StatusDot({
  value,
  color,
  label,
}: {
  value: number;
  color: string;
  label: string;
}) {
  const isActive = value > 0;
  return (
    <div
      className='flex items-center gap-1.5 transition-opacity duration-300'
      style={{ opacity: isActive ? 1 : 0.5 }}
    >
      <span
        className='h-1.5 w-1.5 rounded-full ring-2 ring-offset-1 dark:ring-offset-slate-900'
        style={{
          background: color,
          boxShadow: isActive
            ? `0 0 0 2px ${color}40, 0 0 8px ${color}80`
            : 'none',
        }}
      />
      <div className='flex items-baseline gap-0.5'>
        <span
          className='text-[10px] leading-none font-black'
          style={{ color: isActive ? 'inherit' : '#94a3b8' }}
        >
          {value}
        </span>
        <span className='text-[9px] font-bold tracking-tighter text-slate-400 uppercase dark:text-slate-500'>
          {label}
        </span>
      </div>
    </div>
  );
}

export default function JenisTicketCard({
  label,
  icon,
  accentColor,
  total,
  open,
  assigned,
  close,
  totalGroup,
  ttrLabel,
}: JenisTicketCardProps) {
  const shareOfGroup =
    totalGroup > 0 ? ((total / totalGroup) * 100).toFixed(1) : '0';
  const progressWidth = totalGroup > 0 ? (total / totalGroup) * 100 : 0;

  return (
    <div
      className={[
        'group relative flex flex-col overflow-hidden rounded-3xl p-5',
        'transition-all duration-300 hover:-translate-y-1',
        'bg-white backdrop-blur-md dark:bg-slate-900/40',
        'border border-slate-100 dark:border-slate-800/60',
        'hover:shadow-2xl hover:shadow-slate-200/50 dark:hover:shadow-none',
      ].join(' ')}
      style={{
        // Memberikan border aksen tipis saat di-hover
        borderTop: `3px solid ${accentColor}`,
      }}
    >
      {/* Background Subtle Gradient */}
      <div
        className='absolute -top-4 -right-4 h-20 w-20 rounded-full opacity-10 blur-3xl transition-opacity group-hover:opacity-20'
        style={{ backgroundColor: accentColor }}
      />

      {/* Header: icon + label + ttrLabel */}
      <div className='relative z-10 mb-4 flex items-center justify-between'>
        <div className='flex items-center gap-2.5'>
          <div
            className='flex h-8 w-8 items-center justify-center rounded-xl text-sm transition-transform group-hover:scale-110 group-hover:rotate-3'
            style={{
              background: `${accentColor}15`,
              color: accentColor,
              border: `1px solid ${accentColor}30`,
            }}
          >
            {icon}
          </div>
          <div className='flex flex-col'>
            <span className='text-[9px] font-black tracking-[0.2em] uppercase opacity-50 dark:text-slate-400'>
              Category
            </span>
            <span className='text-[11px] leading-tight font-bold dark:text-slate-200'>
              {label}
            </span>
          </div>
        </div>

        {ttrLabel && (
          <div
            className='flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-black tracking-wider uppercase shadow-sm'
            style={{
              background: `${accentColor}10`,
              color: accentColor,
              border: `1px solid ${accentColor}20`,
            }}
          >
            <span className='text-[10px]'>⏱</span> {ttrLabel}
          </div>
        )}
      </div>

      {/* Stats Section: Total & Progress Bar */}
      <div className='relative z-10 mb-5 flex items-end justify-between gap-2'>
        <div className='flex flex-col'>
          <h3
            className='text-4xl font-black tracking-tighter transition-colors group-hover:text-slate-900 dark:group-hover:text-white'
            style={{ color: accentColor }}
          >
            {total.toLocaleString()}
          </h3>
          <span className='text-[10px] font-bold tracking-widest text-slate-400 uppercase'>
            Tickets
          </span>
        </div>

        <div className='flex w-1/2 flex-col items-end gap-1.5'>
          <div className='flex w-full justify-between text-[10px] font-bold'>
            <span className='text-slate-400 uppercase'>{shareOfGroup}%</span>
            <span className='text-slate-500 dark:text-slate-400'>Share</span>
          </div>
          <div className='h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800'>
            <div
              className='h-full rounded-full shadow-[0_0_8px_rgba(0,0,0,0.1)] transition-all duration-1000 ease-out'
              style={{
                width: `${progressWidth}%`,
                background: accentColor,
              }}
            />
          </div>
        </div>
      </div>

      {/* Footer Row: Status dots */}
      <div className='relative z-10 mt-auto flex items-center justify-between border-t border-slate-50 pt-4 dark:border-slate-800/50'>
        <div className='flex items-center gap-4'>
          <StatusDot value={open} color='#f59e0b' label='Open' />
          <StatusDot value={assigned} color='#3b82f6' label='Assigned' />
          <StatusDot value={close} color='#10b981' label='Close' />
        </div>
      </div>
    </div>
  );
}
