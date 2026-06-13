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
    <div className='overflow-hidden rounded-xl border border-(--border) bg-(--surface)'>
      <div className='overflow-x-auto'>
        <div className='grid min-w-[760px] grid-cols-8 border-b border-(--border) bg-(--surface) px-4 py-3 text-[11px] font-semibold tracking-wider text-(--text-secondary) uppercase'>
          <span>Service Area</span>
          <span className='text-center'>Open</span>
          <span className='text-center'>Close</span>
          <span className='text-center'>Teknisi</span>
          <span className='text-center'>Reg</span>
          <span className='text-center'>Gold</span>
          <span className='text-center'>Plat</span>
          <span className='text-center'>Diam</span>
        </div>
      </div>
      <div className='overflow-x-auto'>
        <div className='min-w-[760px]'>
          {areas.map((area, index) => (
            <div
              key={area.name}
              className={`grid min-w-[760px] grid-cols-8 items-center px-4 py-3.5 text-sm transition-colors hover:bg-(--surface-hover) ${
                index !== areas.length - 1 ? 'border-b border-(--border)' : ''
              }`}
            >
              <div className='flex items-center gap-2 font-semibold'>
                <span className='truncate text-(--text-primary)'>
                  {area.name}
                </span>
              </div>
              <span className='text-center font-bold text-(--text-primary)'>
                {area.open}
              </span>
              <span className='text-center font-bold text-emerald-400'>
                {area.close}
              </span>
              <span className='text-center font-bold text-amber-400'>
                {area.teknisi}
              </span>
              <span className='text-center font-bold text-blue-400'>
                {area.reguler}
              </span>
              <span className='text-center font-bold text-yellow-400'>
                {area.hvcGold}
              </span>
              <span className='text-center font-bold text-purple-400'>
                {area.hvcPlatinum}
              </span>
              <span className='text-center font-bold text-cyan-400'>
                {area.hvcDiamond}
              </span>
            </div>
          ))}
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
