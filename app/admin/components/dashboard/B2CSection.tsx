import CustomerTypeCard from './CustomerTypeCard';
import { TicketCtype } from '@/app/types/ticket';

interface B2CData {
  reguler: { total: number; open: number; assigned: number; closed: number };
  hvcGold: { total: number; open: number; assigned: number; closed: number };
  hvcPlatinum: {
    total: number;
    open: number;
    assigned: number;
    closed: number;
  };
  hvcDiamond: { total: number; open: number; assigned: number; closed: number };
}

interface B2CSectionProps {
  data: B2CData;
  activeType?: TicketCtype | 'all';
  onSelectType?: (type: TicketCtype) => void;
}

export default function B2CSection({
  data,
  activeType = 'all',
  onSelectType,
}: B2CSectionProps) {
  return (
    <div className='space-y-3 md:space-y-4'>
      <div className='mb-3 flex items-center gap-2 border-b border-[var(--border)] pb-2 text-[10px] font-bold tracking-[1.5px] text-[var(--text-muted)] uppercase md:mb-3'>
        <span>👤</span>
        <span>B2C - Customer Type</span>
      </div>
      <div className='grid grid-cols-2 gap-3 md:grid-cols-4'>
        <CustomerTypeCard
          icon='👤'
          name='Reguler'
          total={data.reguler.total}
          open={data.reguler.open}
          assigned={data.reguler.assigned}
          closed={data.reguler.closed}
          accentColor='#10b981'
          active={activeType === 'REGULER'}
          onClick={() => onSelectType?.('REGULER')}
        />
        <CustomerTypeCard
          icon='⭐'
          name='HVC Gold'
          total={data.hvcGold.total}
          open={data.hvcGold.open}
          assigned={data.hvcGold.assigned}
          closed={data.hvcGold.closed}
          accentColor='#f59e0b'
          active={activeType === 'HVC_GOLD'}
          onClick={() => onSelectType?.('HVC_GOLD')}
        />
        <CustomerTypeCard
          icon='💎'
          name='HVC Platinum'
          total={data.hvcPlatinum.total}
          open={data.hvcPlatinum.open}
          assigned={data.hvcPlatinum.assigned}
          closed={data.hvcPlatinum.closed}
          accentColor='#94a3b8'
          active={activeType === 'HVC_PLATINUM'}
          onClick={() => onSelectType?.('HVC_PLATINUM')}
        />
        <CustomerTypeCard
          icon='🔷'
          name='HVC Diamond'
          total={data.hvcDiamond.total}
          open={data.hvcDiamond.open}
          assigned={data.hvcDiamond.assigned}
          closed={data.hvcDiamond.closed}
          accentColor='#67e8f9'
          active={activeType === 'HVC_DIAMOND'}
          onClick={() => onSelectType?.('HVC_DIAMOND')}
        />
      </div>
    </div>
  );
}
