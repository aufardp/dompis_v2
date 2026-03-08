import JenisTicketCard from './JenisTicketCard';
import B2BGroupSummary from './B2BGroupSummary';

interface JenisCounts {
  total: number;
  open: number;
  assigned: number;
  close: number;
  ffgCount: number;
  p1Count: number;
  pPlusCount: number;
}

interface B2BData {
  sqmCcan: JenisCounts;
  indibiz: JenisCounts;
  datin: JenisCounts;
  reseller: JenisCounts;
  wifiId: JenisCounts;
  summary: JenisCounts;
}

interface B2BSectionProps {
  data: B2BData;
}

export default function B2BSection({ data }: B2BSectionProps) {
  return (
    <div className='space-y-6 md:space-y-8'>
      {/* Section header / Summary Banner */}
      <B2BGroupSummary
        title='B2B'
        icon='🏢'
        total={data.summary.total}
        open={data.summary.open}
        assigned={data.summary.assigned}
        close={data.summary.close}
        regulerCount={0}
        sqmCount={0}
        ffgCount={data.summary.ffgCount}
        p1Count={data.summary.p1Count}
        pPlusCount={data.summary.pPlusCount}
        accentColor='#3b82f6'
      />

      {/* Responsive card grid - 5 JenisTicketCards */}
      <div className='grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5'>
        <JenisTicketCard
          jenisKey='sqm-ccan'
          label='SQM-CCAN'
          icon='📡'
          accentColor='#a855f7'
          total={data.sqmCcan.total}
          open={data.sqmCcan.open}
          assigned={data.sqmCcan.assigned}
          close={data.sqmCcan.close}
          totalGroup={data.summary.total}
          ttrLabel='4 Jam'
        />
        <JenisTicketCard
          jenisKey='indibiz'
          label='Indibiz'
          icon='🏢'
          accentColor='#3b82f6'
          total={data.indibiz.total}
          open={data.indibiz.open}
          assigned={data.indibiz.assigned}
          close={data.indibiz.close}
          totalGroup={data.summary.total}
          ttrLabel='4 Jam'
        />
        <JenisTicketCard
          jenisKey='datin'
          label='Datin'
          icon='🔷'
          accentColor='#06b6d4'
          total={data.datin.total}
          open={data.datin.open}
          assigned={data.datin.assigned}
          close={data.datin.close}
          totalGroup={data.summary.total}
          ttrLabel='1.5 Jam'
        />
        <JenisTicketCard
          jenisKey='reseller'
          label='Reseller'
          icon='🏠'
          accentColor='#f97316'
          total={data.reseller.total}
          open={data.reseller.open}
          assigned={data.reseller.assigned}
          close={data.reseller.close}
          totalGroup={data.summary.total}
          ttrLabel='6 Jam'
        />
        <JenisTicketCard
          jenisKey='wifi-id'
          label='WiFi-ID'
          icon='📶'
          accentColor='#10b981'
          total={data.wifiId.total}
          open={data.wifiId.open}
          assigned={data.wifiId.assigned}
          close={data.wifiId.close}
          totalGroup={data.summary.total}
          ttrLabel='24 Jam'
        />
      </div>
    </div>
  );
}
