import CustomerTypeCard from './CustomerTypeCard';
import B2CSummaryCard from './B2CSummaryCard';
import { TicketCtype } from '@/app/types/ticket';

interface B2CData {
  summary: {
    total: number;
    open: number;
    assigned: number;
    close: number;
    customerCount: number;
    sqmCount: number;
    unspecCount: number;
    ffgCount: number;
    gamasCount: number;
    p1Count: number;
    pPlusCount: number;
  };
  reguler: {
    total: number;
    open: number;
    assigned: number;
    close: number;
    customerCount: number;
    sqmCount: number;
    unspecCount: number;
    ffgCount: number;
    gamasCount: number;
    p1Count: number;
    pPlusCount: number;
  };
  hvcGold: {
    total: number;
    open: number;
    assigned: number;
    close: number;
    customerCount: number;
    sqmCount: number;
    unspecCount: number;
    ffgCount: number;
    gamasCount: number;
    p1Count: number;
    pPlusCount: number;
  };
  hvcPlatinum: {
    total: number;
    open: number;
    assigned: number;
    close: number;
    customerCount: number;
    sqmCount: number;
    unspecCount: number;
    ffgCount: number;
    gamasCount: number;
    p1Count: number;
    pPlusCount: number;
  };
  hvcDiamond: {
    total: number;
    open: number;
    assigned: number;
    close: number;
    customerCount: number;
    sqmCount: number;
    unspecCount: number;
    ffgCount: number;
    gamasCount: number;
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
      <div className='flex flex-col gap-3 rounded-2xl border border-(--border) bg-(--surface) p-3.5 shadow-sm lg:flex-row lg:items-center lg:justify-between'>
        <div className='space-y-1'>
          <div className='flex items-center gap-2'>
            <div className='grid h-9 w-9 place-items-center rounded-xl bg-blue-600 text-sm font-black text-white shadow-sm'>
              C
            </div>
            <div>
              <p className='text-sm font-black tracking-tight text-(--text-primary)'>
                B2C Overview
              </p>
              <p className='text-[10px] font-semibold tracking-[0.18em] text-(--text-muted) uppercase'>
                Customer family · B2C / SQM / Unspec
              </p>
            </div>
          </div>
        </div>

        <div className='flex flex-wrap items-center gap-1.5 rounded-2xl border border-(--border) bg-(--bg) p-1'>
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
                className={[
                  'flex items-center gap-1.5 rounded-full px-2.5 py-1.25 text-[11px] font-semibold',
                  'transition-all duration-150',
                  isActive
                    ? 'bg-(--surface-2) text-(--text-primary) shadow-sm ring-1 ring-(--border)'
                    : 'text-(--text-secondary) hover:bg-(--surface) hover:text-(--text-primary)',
                ].join(' ')}
              >
                <span>{tab.label}</span>
                <span
                  className='rounded-full bg-(--border) px-1.5 py-0.5 text-[9px] font-bold text-(--text-secondary)'
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <B2CSummaryCard
        total={data.summary.total}
        open={data.summary.open}
        assigned={data.summary.assigned}
        close={data.summary.close}
        customerCount={data.summary.customerCount}
        sqmCount={data.summary.sqmCount}
        unspecCount={data.summary.unspecCount}
        ffgCount={data.summary.ffgCount}
        gamasCount={data.summary.gamasCount}
        p1Count={data.summary.p1Count}
        pPlusCount={data.summary.pPlusCount}
        isDailyScope={isDailyScope}
      />

      <div className='grid gap-3 md:grid-cols-2 xl:grid-cols-4'>
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
              customerCount={d.customerCount}
              sqmCount={d.sqmCount}
              unspecCount={d.unspecCount}
              ffgCount={d.ffgCount}
              gamasCount={d.gamasCount}
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
