'use client';

import { getEffectiveMaxTtrLabel, isBookingBased } from '@/app/libs/tickets/effective';
import TtrCountdownBadge from './TtrCountdownBadge';
import { CalendarDays } from 'lucide-react';

interface Props {
  ticket: any;
}

export default function MaxTtrCell({ ticket }: Props) {
  const maxTtrLabel = getEffectiveMaxTtrLabel(ticket);
  const isBooking = isBookingBased(ticket);

  return (
    <div className='inline-flex flex-col items-center gap-0.5'>
      {maxTtrLabel ? (
        <>
          {isBooking && (
            <span className='inline-flex items-center gap-1 text-[10px] text-blue-400'>
              <CalendarDays size={11} />
              Booking
            </span>
          )}
          <span className='text-xs font-medium whitespace-nowrap text-(--text-primary)'>
            {maxTtrLabel}
          </span>
        </>
      ) : (
        <span className='text-xs text-(--text-secondary) italic'>—</span>
      )}
      <TtrCountdownBadge ticket={ticket} />
    </div>
  );
}
