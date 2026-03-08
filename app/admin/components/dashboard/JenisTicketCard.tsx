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
  return (
    <div className='flex items-center gap-1.5 text-[10px] text-slate-400'>
      <span
        className='h-2 w-2 rounded-full'
        style={{
          background: value > 0 ? color : color + '40',
        }}
      />
      <span className='font-semibold' style={{ color: value > 0 ? color : undefined }}>
        {value}
      </span>
      {label}
    </div>
  );
}

export default function JenisTicketCard({
  jenisKey,
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
      className='group relative flex flex-col overflow-hidden rounded-2xl bg-white p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md'
      style={{
        border: `1px solid ${accentColor}30`,
      }}
    >
      {/* Header: icon + label + ttrLabel */}
      <div className='mb-3 flex items-center justify-between'>
        <div className='flex items-center gap-2'>
          <div
            className='flex h-7 w-7 items-center justify-center rounded-full text-xs'
            style={{
              background: accentColor + '15',
              border: `1.5px solid ${accentColor}35`,
            }}
          >
            {icon}
          </div>
          <span
            className='text-[10px] font-bold tracking-widest uppercase'
            style={{ color: accentColor }}
          >
            {label}
          </span>
        </div>
        {ttrLabel && (
          <span
            className='rounded-md px-1.5 py-0.5 text-[9px] font-bold'
            style={{
              background: accentColor + '12',
              color: accentColor,
            }}
          >
            ⏱ {ttrLabel}
          </span>
        )}
      </div>

      {/* Large total number */}
      <p
        className='text-3xl font-black tracking-tight'
        style={{ color: accentColor }}
      >
        {total.toLocaleString()}
      </p>

      {/* % of group subtitle */}
      <p className='mb-2 text-[10px] text-slate-400'>{shareOfGroup}% of group</p>

      {/* Mini horizontal progress bar */}
      <div className='mb-3 h-1 w-full overflow-hidden rounded-full bg-slate-200'>
        <div
          className='h-full transition-all duration-700'
          style={{
            width: `${progressWidth}%`,
            background: accentColor,
          }}
        />
      </div>

      {/* Status row: open · assigned · close */}
      <div className='mt-auto flex items-center gap-3'>
        <StatusDot value={open} color='#f59e0b' label='Open' />
        <StatusDot value={assigned} color='#3b82f6' label='Assigned' />
        <StatusDot value={close} color='#10b981' label='Close' />
      </div>
    </div>
  );
}
