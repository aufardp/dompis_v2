'use client';

import { TicketCtype, CustomerType } from '@/app/types/ticket';

interface CustomerTypeTabFilterProps {
  activeType: TicketCtype | 'all';
  onChange: (type: TicketCtype | 'all') => void;
  counts?: {
    all: number;
    REGULER: number;
    HVC_GOLD: number;
    HVC_PLATINUM: number;
    HVC_DIAMOND: number;
  };
}

const tabs: Array<{ key: TicketCtype | 'all'; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'REGULER', label: 'Reguler' },
  { key: 'HVC_GOLD', label: 'HVC Gold' },
  { key: 'HVC_PLATINUM', label: 'HVC Platinum' },
  { key: 'HVC_DIAMOND', label: 'HVC Diamond' },
];

export default function CustomerTypeTabFilter({
  activeType,
  onChange,
  counts,
}: CustomerTypeTabFilterProps) {
  return (
    <div className='w-full overflow-x-auto pb-2'>
      <div className='flex min-w-max items-center gap-1 rounded-lg bg-gray-100 p-1'>
        {tabs.map((tab) => {
          const isActive = activeType === tab.key;
          const count = counts ? counts[tab.key] : undefined;

          return (
            <button
              key={tab.key}
              onClick={() => onChange(tab.key)}
              className={`relative flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-all sm:gap-2 ${
                isActive
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.key !== 'all' && tab.key !== 'REGULER' && (
                <span className='text-xs sm:text-sm'>
                  {CustomerType[tab.key as TicketCtype]?.icon}
                </span>
              )}
              <span className='xs:inline hidden'>{tab.label}</span>
              <span className='xs:hidden'>{tab.label.replace('HVC ', '')}</span>
              {count !== undefined && (
                <span
                  className={`flex h-5 min-w-5 items-center justify-center rounded-full text-xs ${
                    isActive
                      ? 'bg-blue-100 text-blue-600'
                      : 'bg-gray-200 text-gray-600'
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
