import CustomerTypeCard from './CustomerTypeCard';
import B2BGroupSummary from './B2BGroupSummary';

interface B2BData {
  summary: {
    datin: {
      total: number;
      open: number;
      assigned: number;
      closed: number;
      regulerCount: number;
      sqmCount: number;
    };
    indibiz: {
      total: number;
      open: number;
      assigned: number;
      closed: number;
      regulerCount: number;
      sqmCount: number;
    };
    resellerWifi: {
      total: number;
      open: number;
      assigned: number;
      closed: number;
      regulerCount: number;
      sqmCount: number;
    };
  };
  datinK1: {
    total: number;
    open: number;
    assigned: number;
    closed: number;
    regulerCount: number;
    sqmCount: number;
  };
  datinK1K2: {
    total: number;
    open: number;
    assigned: number;
    closed: number;
    regulerCount: number;
    sqmCount: number;
  };
  datinK3: {
    total: number;
    open: number;
    assigned: number;
    closed: number;
    regulerCount: number;
    sqmCount: number;
  };
  indibiz4: {
    total: number;
    open: number;
    assigned: number;
    closed: number;
    regulerCount: number;
    sqmCount: number;
  };
  indibiz24: {
    total: number;
    open: number;
    assigned: number;
    closed: number;
    regulerCount: number;
    sqmCount: number;
  };
  reseller6: {
    total: number;
    open: number;
    assigned: number;
    closed: number;
    regulerCount: number;
    sqmCount: number;
  };
  reseller36: {
    total: number;
    open: number;
    assigned: number;
    closed: number;
    regulerCount: number;
    sqmCount: number;
  };
  wifi24: {
    total: number;
    open: number;
    assigned: number;
    closed: number;
    regulerCount: number;
    sqmCount: number;
  };
}

interface B2BSectionProps {
  data: B2BData;
}

// Group total for "% of group" in tier cards
function groupTotal(items: { total: number }[]) {
  return items.reduce((sum, i) => sum + i.total, 0);
}

export default function B2BSection({ data }: B2BSectionProps) {
  const datinTotal = groupTotal([data.datinK1, data.datinK1K2, data.datinK3]);
  const indibizTotal = groupTotal([data.indibiz4, data.indibiz24]);
  const resellerWifiTotal = groupTotal([
    data.reseller6,
    data.reseller36,
    data.wifi24,
  ]);

  return (
    <div className='space-y-6 md:space-y-8'>
      {/* Section header */}
      <div className='flex items-center gap-2 border-b border-slate-200 pb-2'>
        <div className='flex h-9 w-9 items-center justify-center rounded-xl bg-linear-to-br from-cyan-500 to-blue-600 text-base shadow-sm'>
          🏢
        </div>
        <div>
          <p className='text-sm font-bold text-slate-800'>B2B Overview</p>
          <p className='text-[10px] text-slate-400'>
            Business Customer Type Overview
          </p>
        </div>
      </div>

      {/* ── Datin Group ── */}
      <div className='space-y-3'>
        <B2BGroupSummary
          title='Datin'
          icon='🔷'
          total={data.summary.datin.total}
          open={data.summary.datin.open}
          assigned={data.summary.datin.assigned}
          closed={data.summary.datin.closed}
          regulerCount={data.summary.datin.regulerCount}
          sqmCount={data.summary.datin.sqmCount}
          accentColor='#06b6d4'
        />
        <div className='grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3'>
          <CustomerTypeCard
            icon='🔷'
            name='K1 Datin'
            total={data.datinK1.total}
            open={data.datinK1.open}
            assigned={data.datinK1.assigned}
            closed={data.datinK1.closed}
            regulerCount={data.datinK1.regulerCount}
            sqmCount={data.datinK1.sqmCount}
            accentColor='#06b6d4'
            ttrLabel='1.5 Jam'
            totalAll={datinTotal}
          />
          <CustomerTypeCard
            icon='🔹'
            name='K1 Repair & K2'
            total={data.datinK1K2.total}
            open={data.datinK1K2.open}
            assigned={data.datinK1K2.assigned}
            closed={data.datinK1K2.closed}
            regulerCount={data.datinK1K2.regulerCount}
            sqmCount={data.datinK1K2.sqmCount}
            accentColor='#0891b2'
            ttrLabel='3.6 Jam'
            totalAll={datinTotal}
          />
          <CustomerTypeCard
            icon='🔸'
            name='K3 Datin'
            total={data.datinK3.total}
            open={data.datinK3.open}
            assigned={data.datinK3.assigned}
            closed={data.datinK3.closed}
            regulerCount={data.datinK3.regulerCount}
            sqmCount={data.datinK3.sqmCount}
            accentColor='#ec4899'
            ttrLabel='7.2 Jam'
            totalAll={datinTotal}
          />
        </div>
      </div>

      {/* ── Indibiz Group ── */}
      <div className='space-y-3'>
        <B2BGroupSummary
          title='Indibiz'
          icon='📡'
          total={data.summary.indibiz.total}
          open={data.summary.indibiz.open}
          assigned={data.summary.indibiz.assigned}
          closed={data.summary.indibiz.closed}
          regulerCount={data.summary.indibiz.regulerCount}
          sqmCount={data.summary.indibiz.sqmCount}
          accentColor='#3b82f6'
        />
        <div className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
          <CustomerTypeCard
            icon='📡'
            name='Indibiz 4 Jam'
            total={data.indibiz4.total}
            open={data.indibiz4.open}
            assigned={data.indibiz4.assigned}
            closed={data.indibiz4.closed}
            regulerCount={data.indibiz4.regulerCount}
            sqmCount={data.indibiz4.sqmCount}
            accentColor='#3b82f6'
            ttrLabel='4 Jam'
            totalAll={indibizTotal}
          />
          <CustomerTypeCard
            icon='📡'
            name='Indibiz 24 Jam'
            total={data.indibiz24.total}
            open={data.indibiz24.open}
            assigned={data.indibiz24.assigned}
            closed={data.indibiz24.closed}
            regulerCount={data.indibiz24.regulerCount}
            sqmCount={data.indibiz24.sqmCount}
            accentColor='#2563eb'
            ttrLabel='24 Jam'
            totalAll={indibizTotal}
          />
        </div>
      </div>

      {/* ── Reseller & WiFi Group ── */}
      <div className='space-y-3'>
        <B2BGroupSummary
          title='Reseller & WiFi'
          icon='🏠'
          total={data.summary.resellerWifi.total}
          open={data.summary.resellerWifi.open}
          assigned={data.summary.resellerWifi.assigned}
          closed={data.summary.resellerWifi.closed}
          regulerCount={data.summary.resellerWifi.regulerCount}
          sqmCount={data.summary.resellerWifi.sqmCount}
          accentColor='#f97316'
        />
        <div className='grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3'>
          <CustomerTypeCard
            icon='🏠'
            name='Reseller 6 Jam'
            total={data.reseller6.total}
            open={data.reseller6.open}
            assigned={data.reseller6.assigned}
            closed={data.reseller6.closed}
            regulerCount={data.reseller6.regulerCount}
            sqmCount={data.reseller6.sqmCount}
            accentColor='#f97316'
            ttrLabel='6 Jam'
            totalAll={resellerWifiTotal}
          />
          <CustomerTypeCard
            icon='🏠'
            name='Reseller 36 Jam'
            total={data.reseller36.total}
            open={data.reseller36.open}
            assigned={data.reseller36.assigned}
            closed={data.reseller36.closed}
            regulerCount={data.reseller36.regulerCount}
            sqmCount={data.reseller36.sqmCount}
            accentColor='#ea580c'
            ttrLabel='36 Jam'
            totalAll={resellerWifiTotal}
          />
          <CustomerTypeCard
            icon='📶'
            name='WiFi 24 Jam'
            total={data.wifi24.total}
            open={data.wifi24.open}
            assigned={data.wifi24.assigned}
            closed={data.wifi24.closed}
            regulerCount={data.wifi24.regulerCount}
            sqmCount={data.wifi24.sqmCount}
            accentColor='#84cc16'
            ttrLabel='24 Jam'
            totalAll={resellerWifiTotal}
          />
        </div>
      </div>
    </div>
  );
}
