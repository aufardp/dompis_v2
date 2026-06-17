import { memo } from 'react';

interface ServiceArea {
  name: string;
  open: number;
  close: number;
  teknisi: number;
  reguler: number;
  hvcGold: number;
  hvcPlatinum: number;
  hvcDiamond: number;
}

function ServiceAreaTable({ areas }: { areas: ServiceArea[] }) {
  return (
    <div className='overflow-hidden rounded-3xl border border-(--border) bg-(--surface) shadow-sm'>
      <div className='border-b border-(--border) px-4 py-4'>
        <div className='flex flex-wrap items-center justify-between gap-3'>
          <div>
            <p className='text-[11px] font-bold tracking-[0.22em] text-(--text-secondary) uppercase'>
              Service Area Performance
            </p>
            <p className='mt-1 text-sm text-(--text-muted)'>
              Distribusi open, close, dan komposisi customer type per service area.
            </p>
          </div>
          <span className='rounded-full border border-(--border) bg-surface-2 px-3 py-1 text-xs font-semibold text-(--text-secondary)'>
            {areas.length.toLocaleString('id-ID')} area
          </span>
        </div>
      </div>

      <div className='overflow-x-auto'>
        <div className='min-w-[860px]'>
          <div className='grid grid-cols-8 border-b border-(--border) bg-surface-2 px-4 py-3 text-[10px] font-bold tracking-[0.22em] text-(--text-muted) uppercase'>
            <span>Service Area</span>
            <span className='text-center'>Open</span>
            <span className='text-center'>Close</span>
            <span className='text-center'>Teknisi</span>
            <span className='text-center'>Reg</span>
            <span className='text-center'>Gold</span>
            <span className='text-center'>Plat</span>
            <span className='text-center'>Diam</span>
          </div>

          <div>
            {areas.map((area, index) => (
              <div
                key={area.name}
                className={`grid grid-cols-8 items-center px-4 py-3.5 text-sm transition-colors hover:bg-surface-2/70 ${
                  index !== areas.length - 1 ? 'border-b border-(--border)' : ''
                }`}
              >
                <div className='flex min-w-0 items-center gap-2'>
                  <span className='truncate font-semibold text-(--text-primary)'>
                    {area.name}
                  </span>
                </div>
                <span className='text-center font-bold text-(--text-primary)'>
                  {area.open}
                </span>
                <span className='text-center font-bold text-emerald-500'>
                  {area.close}
                </span>
                <span className='text-center font-bold text-amber-500'>
                  {area.teknisi}
                </span>
                <span className='text-center font-bold text-blue-500'>
                  {area.reguler}
                </span>
                <span className='text-center font-bold text-amber-600 dark:text-amber-400'>
                  {area.hvcGold}
                </span>
                <span className='text-center font-bold text-violet-500'>
                  {area.hvcPlatinum}
                </span>
                <span className='text-center font-bold text-cyan-500'>
                  {area.hvcDiamond}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {areas.length === 0 && (
        <div className='py-8 text-center text-sm text-(--text-secondary)'>
          No service areas found
        </div>
      )}
    </div>
  );
}

export default memo(ServiceAreaTable);
