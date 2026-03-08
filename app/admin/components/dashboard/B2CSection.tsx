import CustomerTypeCard from './CustomerTypeCard';
import B2CSummaryCard from './B2CSummaryCard';
import { TicketCtype } from '@/app/types/ticket';

interface B2CData {
  summary: {
    total: number;
    open: number;
    assigned: number;
    close: number;
    regulerCount: number;
    sqmCount: number;
    unspecCount: number;
    ffgCount: number;
    p1Count: number;
    pPlusCount: number;
  };
  reguler: {
    total: number;
    open: number;
    assigned: number;
    close: number;
    regulerCount: number;
    sqmCount: number;
    unspecCount: number;
    ffgCount: number;
    p1Count: number;
    pPlusCount: number;
  };
  hvcGold: {
    total: number;
    open: number;
    assigned: number;
    close: number;
    regulerCount: number;
    sqmCount: number;
    unspecCount: number;
    ffgCount: number;
    p1Count: number;
    pPlusCount: number;
  };
  hvcPlatinum: {
    total: number;
    open: number;
    assigned: number;
    close: number;
    regulerCount: number;
    sqmCount: number;
    unspecCount: number;
    ffgCount: number;
    p1Count: number;
    pPlusCount: number;
  };
  hvcDiamond: {
    total: number;
    open: number;
    assigned: number;
    close: number;
    regulerCount: number;
    sqmCount: number;
    unspecCount: number;
    ffgCount: number;
    p1Count: number;
    pPlusCount: number;
  };
}

interface B2CSectionProps {
  data: B2CData;
  activeType?: TicketCtype | 'all';
  onSelectType?: (type: TicketCtype | 'all') => void;
  isDailyScope?: boolean; // NEW: indicates daily operational scope
}

const filterTabs: {
  key: TicketCtype | 'all';
  label: string;
  icon?: string;
  dataKey: keyof Omit<B2CData, 'summary'> | 'summary';
}[] = [
  { key: 'all', label: 'All', dataKey: 'summary' },
  { key: 'REGULER', label: 'Reguler', icon: '👤', dataKey: 'reguler' },
  { key: 'HVC_GOLD', label: 'Gold', icon: '⭐', dataKey: 'hvcGold' },
  {
    key: 'HVC_PLATINUM',
    label: 'Platinum',
    icon: '💎',
    dataKey: 'hvcPlatinum',
  },
  { key: 'HVC_DIAMOND', label: 'Diamond', icon: '🔷', dataKey: 'hvcDiamond' },
];

const tierCards: {
  key: TicketCtype;
  icon: string;
  name: string;
  dataKey: keyof Omit<B2CData, 'summary'>;
  accentColor: string;
}[] = [
  {
    key: 'REGULER',
    icon: '👤',
    name: 'Reguler',
    dataKey: 'reguler',
    accentColor: '#10b981',
  },
  {
    key: 'HVC_GOLD',
    icon: '⭐',
    name: 'HVC Gold',
    dataKey: 'hvcGold',
    accentColor: '#f59e0b',
  },
  {
    key: 'HVC_PLATINUM',
    icon: '💎',
    name: 'HVC Platinum',
    dataKey: 'hvcPlatinum',
    accentColor: '#6366f1',
  },
  {
    key: 'HVC_DIAMOND',
    icon: '🔷',
    name: 'HVC Diamond',
    dataKey: 'hvcDiamond',
    accentColor: '#0ea5e9',
  },
];

export default function B2CSection({
  data,
  activeType = 'all',
  onSelectType,
  isDailyScope = true, // DEFAULT to true for daily operational scope
}: B2CSectionProps) {
  const totalAll = data.summary.total;

  return (
    <div className='space-y-4'>
      {/* Section header with filter tabs */}
      <div className='flex flex-wrap items-center justify-between gap-3'>
        {/* Left: title */}
        <div className='flex items-center gap-2'>
          <div className='flex h-9 w-9 items-center justify-center rounded-xl bg-linear-to-br from-blue-500 to-indigo-600 text-base shadow-sm'>
            👥
          </div>
          <div>
            <p className='text-sm font-bold text-slate-800'>B2C Overview</p>
            <p className='text-[10px] text-slate-400'>Customer Type Overview</p>
          </div>
        </div>

        {/* Right: filter tabs */}
        <div className='flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-100 p-1'>
          {filterTabs.map((tab) => {
            const count =
              tab.key === 'all'
                ? data.summary.total
                : (data[tab.dataKey as keyof Omit<B2CData, 'summary'>]?.total ??
                  0);
            const isActive = activeType === tab.key;

            return (
              <button
                key={tab.key}
                type='button'
                onClick={() => onSelectType?.(tab.key)}
                className='flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-semibold transition-all duration-150'
                style={{
                  background: isActive ? '#fff' : 'transparent',
                  color: isActive ? '#0f172a' : '#64748b',
                  boxShadow: isActive ? '0 1px 4px rgba(0,0,0,0.1)' : 'none',
                }}
              >
                {tab.icon && <span>{tab.icon}</span>}
                <span>{tab.label}</span>
                <span
                  className='rounded-full px-1.5 py-0.5 text-[9px] font-bold text-white'
                  style={{ background: isActive ? '#3b82f6' : '#94a3b8' }}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Summary banner */}
      <B2CSummaryCard
        total={data.summary.total}
        open={data.summary.open}
        assigned={data.summary.assigned}
        close={data.summary.close}
        regulerCount={data.summary.regulerCount}
        sqmCount={data.summary.sqmCount}
        unspecCount={data.summary.unspecCount}
        ffgCount={data.summary.ffgCount}
        p1Count={data.summary.p1Count}
        pPlusCount={data.summary.pPlusCount}
        isDailyScope={isDailyScope}
      />

      {/* Tier cards */}
      <div className='grid grid-cols-2 gap-4 md:grid-cols-4'>
        {tierCards.map((tier) => {
          const d = data[tier.dataKey];
          return (
            <CustomerTypeCard
              key={tier.key}
              icon={tier.icon}
              name={tier.name}
              total={d.total}
              open={d.open}
              assigned={d.assigned}
              close={d.close}
              regulerCount={d.regulerCount}
              sqmCount={d.sqmCount}
              unspecCount={d.unspecCount}
              ffgCount={d.ffgCount}
              p1Count={d.p1Count}
              pPlusCount={d.pPlusCount}
              accentColor={tier.accentColor}
              active={activeType === tier.key}
              onClick={() => onSelectType?.(tier.key)}
              totalAll={totalAll}
            />
          );
        })}
      </div>
    </div>
  );
}
