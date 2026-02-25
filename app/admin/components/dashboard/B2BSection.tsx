import CustomerTypeCard from './CustomerTypeCard';

interface B2BData {
  datinK1: { total: number; open: number; assigned: number; closed: number };
  datinK1K2: { total: number; open: number; assigned: number; closed: number };
  datinK3: { total: number; open: number; assigned: number; closed: number };
  indibiz4: { total: number; open: number; assigned: number; closed: number };
  indibiz24: { total: number; open: number; assigned: number; closed: number };
  reseller6: { total: number; open: number; assigned: number; closed: number };
  reseller36: { total: number; open: number; assigned: number; closed: number };
  wifi24: { total: number; open: number; assigned: number; closed: number };
}

interface B2BSectionProps {
  data: B2BData;
}

export default function B2BSection({ data }: B2BSectionProps) {
  return (
    <div className='space-y-4 md:space-y-6'>
      {/* Datin Group */}
      <div>
        <div className='mb-3 flex items-center gap-2 border-b border-[var(--border)] pb-2 text-[10px] font-bold tracking-[1.5px] text-[var(--text-muted)] uppercase md:mb-3'>
          <span>🔷</span>
          <span>B2B - Datin</span>
        </div>
        <div className='grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3'>
          <CustomerTypeCard
            icon='🔷'
            name='K1 Datin'
            total={data.datinK1.total}
            open={data.datinK1.open}
            assigned={data.datinK1.assigned}
            closed={data.datinK1.closed}
            accentColor='#06b6d4'
            ttrLabel='1.5 Jam'
          />
          <CustomerTypeCard
            icon='🔹'
            name='K1 Repair & K2'
            total={data.datinK1K2.total}
            open={data.datinK1K2.open}
            assigned={data.datinK1K2.assigned}
            closed={data.datinK1K2.closed}
            accentColor='#0891b2'
            ttrLabel='3.6 Jam'
          />
          <CustomerTypeCard
            icon='🔸'
            name='K3 Datin'
            total={data.datinK3.total}
            open={data.datinK3.open}
            assigned={data.datinK3.assigned}
            closed={data.datinK3.closed}
            accentColor='#ec4899'
            ttrLabel='7.2 Jam'
          />
        </div>
      </div>

      {/* Indibiz Group */}
      <div>
        <div className='mb-3 flex items-center gap-2 border-b border-[var(--border)] pb-2 text-[10px] font-bold tracking-[1.5px] text-[var(--text-muted)] uppercase md:mb-3'>
          <span>📡</span>
          <span>B2B - Indibiz</span>
        </div>
        <div className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
          <CustomerTypeCard
            icon='📡'
            name='Indibiz'
            total={data.indibiz4.total}
            open={data.indibiz4.open}
            assigned={data.indibiz4.assigned}
            closed={data.indibiz4.closed}
            accentColor='#3b82f6'
            ttrLabel='4 Jam'
          />
          <CustomerTypeCard
            icon='📡'
            name='Indibiz'
            total={data.indibiz24.total}
            open={data.indibiz24.open}
            assigned={data.indibiz24.assigned}
            closed={data.indibiz24.closed}
            accentColor='#2563eb'
            ttrLabel='24 Jam'
          />
        </div>
      </div>

      {/* Reseller & WiFi Group */}
      <div>
        <div className='mb-3 flex items-center gap-2 border-b border-[var(--border)] pb-2 text-[10px] font-bold tracking-[1.5px] text-[var(--text-muted)] uppercase md:mb-3'>
          <span>🏠</span>
          <span>B2B - Reseller & WiFi</span>
        </div>
        <div className='grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3'>
          <CustomerTypeCard
            icon='🏠'
            name='Reseller'
            total={data.reseller6.total}
            open={data.reseller6.open}
            assigned={data.reseller6.assigned}
            closed={data.reseller6.closed}
            accentColor='#f97316'
            ttrLabel='6 Jam'
          />
          <CustomerTypeCard
            icon='🏠'
            name='Reseller'
            total={data.reseller36.total}
            open={data.reseller36.open}
            assigned={data.reseller36.assigned}
            closed={data.reseller36.closed}
            accentColor='#ea580c'
            ttrLabel='36 Jam'
          />
          <CustomerTypeCard
            icon='📶'
            name='WiFi'
            total={data.wifi24.total}
            open={data.wifi24.open}
            assigned={data.wifi24.assigned}
            closed={data.wifi24.closed}
            accentColor='#84cc16'
            ttrLabel='24 Jam'
          />
        </div>
      </div>
    </div>
  );
}
