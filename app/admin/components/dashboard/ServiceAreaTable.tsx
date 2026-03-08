interface ServiceArea {
  name: string;
  dept?: 'b2b' | 'b2c';
  total: number;
  open: number;
  assigned: number;
  close: number;
  unassigned: number;
}

export default function ServiceAreaTable({ areas }: { areas: ServiceArea[] }) {
  return (
    <div className='bg-surface overflow-hidden rounded-xl border border-(--border)'>
      {/* Header - scrollable on mobile */}
      <div className='overflow-x-auto'>
        <div className='bg-surface-2 grid min-w-150 grid-cols-5 border-b border-(--border) px-4 py-3 text-[11px] font-semibold tracking-wider text-(--text-secondary) uppercase'>
          <span>Service Area</span>
          <span className='text-center'>Total</span>
          <span className='text-center'>Assigned</span>
          <span className='text-center'>Close</span>
          <span className='text-center'>Unassigned</span>
        </div>
      </div>

      {/* Body - scrollable on mobile */}
      <div className='overflow-x-auto'>
        <div className='min-w-150'>
          {areas.map((area, index) => (
            <div
              key={area.name}
              className={`hover:bg-surface-2 grid min-w-150 grid-cols-5 items-center px-4 py-3.5 text-sm transition-colors ${
                index !== areas.length - 1 ? 'border-b border-(--border)' : ''
              }`}
            >
              <div className='flex items-center gap-2 font-semibold'>
                <span
                  className='h-2 w-2 shrink-0 rounded-sm'
                  style={{
                    background:
                      area.dept === 'b2b'
                        ? '#3b82f6'
                        : area.dept === 'b2c'
                          ? '#8b5cf6'
                          : 'rgba(148, 163, 184, 0.9)',
                  }}
                />
                <span className='truncate text-(--text-primary)'>
                  {area.name}
                </span>
              </div>
              <span className='font-syne text-center font-bold text-(--text-primary)'>
                {area.total}
              </span>
              <span className='text-center font-bold text-amber-400'>
                {area.assigned}
              </span>
              <span className='text-center font-bold text-emerald-400'>
                {area.close}
              </span>
              <span className='text-center font-bold text-red-400'>
                {area.unassigned}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Empty state */}
      {areas.length === 0 && (
        <div className='py-8 text-center text-sm text-(--text-secondary)'>
          No service areas found
        </div>
      )}
    </div>
  );
}
