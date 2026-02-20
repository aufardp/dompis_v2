'use client';

import { TicketCtype, CustomerType } from '@/app/types/ticket';
import CustomerTypeBadge from './CustomerTypeBadge';

interface CustomerTypeCardProps {
  ctype: TicketCtype;
  total: number;
  open: number;
  unassigned: number;
  assigned: number;
  closed: number;
  isActive?: boolean;
  onClick?: () => void;
}

export default function CustomerTypeCard({
  ctype,
  total,
  open,
  unassigned,
  assigned,
  closed,
  isActive = false,
  onClick,
}: CustomerTypeCardProps) {
  const config = CustomerType[ctype];
  const activeClasses = isActive
    ? `ring-2 ${config.color.replace('text-', 'ring-')}`
    : 'hover:shadow-md';

  return (
    <button
      onClick={onClick}
      className={`rounded-xl border bg-white p-3 text-left transition-all sm:p-4 ${activeClasses}`}
    >
      <div className='flex items-center justify-between'>
        <CustomerTypeBadge ctype={ctype} size='sm' />
        <span className={`text-xl font-bold sm:text-2xl ${config.color}`}>
          {total}
        </span>
      </div>

      <div className='mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs sm:mt-3 sm:gap-4'>
        <div className='flex items-center gap-1'>
          <span className='h-1.5 w-1.5 rounded-full bg-red-400 sm:h-2 sm:w-2'></span>
          <span className='text-gray-500'>
            <span className='xs:hidden'>O:</span>
            <span className='xs:inline hidden'>Unassigned:</span>
            {unassigned}
          </span>
        </div>
        <div className='flex items-center gap-1'>
          <span className='h-1.5 w-1.5 rounded-full bg-blue-400 sm:h-2 sm:w-2'></span>
          <span className='text-gray-500'>
            <span className='xs:hidden'>A:</span>
            <span className='xs:inline hidden'>Assigned:</span>
            {assigned}
          </span>
        </div>
        <div className='flex items-center gap-1'>
          <span className='h-1.5 w-1.5 rounded-full bg-green-400 sm:h-2 sm:w-2'></span>
          <span className='text-gray-500'>
            <span className='xs:hidden'>C:</span>
            <span className='xs:inline hidden'>Closed:</span>
            {closed}
          </span>
        </div>
      </div>
    </button>
  );
}
