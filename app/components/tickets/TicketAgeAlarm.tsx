'use client';

import { useEffect, useState } from 'react';
import { fetchWithAuth } from '@/app/libs/fetcher';
import { formatDateWIB, getSlaHours } from '@/app/utils/datetime';
import { CustomerType } from '@/app/types/ticket';

interface ExpiredTicket {
  idTicket: number;
  ticket: string;
  customerType?: string;
  reportedDate: string;
  status: string;
  technicianName?: string;
}

interface TicketAgeAlarmProps {
  onTicketClick?: (ticketId: number) => void;
}

export default function TicketAgeAlarm({ onTicketClick }: TicketAgeAlarmProps) {
  const [expiredTickets, setExpiredTickets] = useState<ExpiredTicket[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadExpiredTickets() {
      try {
        const res = await fetchWithAuth('/api/tickets/expired');
        if (!res) return;

        const data = await res.json();
        if (data.success) {
          setExpiredTickets(data.data || []);
        }
      } catch (err) {
        console.error('Failed to load expired tickets:', err);
      } finally {
        setLoading(false);
      }
    }

    loadExpiredTickets();

    const interval = setInterval(loadExpiredTickets, 60000);
    return () => clearInterval(interval);
  }, []);

  const getHoursOverdue = (ticket: ExpiredTicket) => {
    if (!ticket.reportedDate) return 0;
    const slaHours = getSlaHours(ticket.customerType);
    const reported = new Date(ticket.reportedDate);
    const now = new Date();
    const hoursElapsed =
      (now.getTime() - reported.getTime()) / (1000 * 60 * 60);
    return Math.max(0, hoursElapsed - slaHours);
  };

  if (loading) {
    return (
      <div className='rounded-xl border border-red-200 bg-red-50 p-4'>
        <div className='flex items-center gap-2'>
          <div className='h-5 w-5 animate-spin rounded-full border-2 border-red-500 border-t-transparent'></div>
          <span className='text-sm text-red-700'>
            Loading expired tickets...
          </span>
        </div>
      </div>
    );
  }

  if (expiredTickets.length === 0) {
    return null;
  }

  return (
    <div className='rounded-xl border border-red-300 bg-red-50 p-4 shadow-sm'>
      <div className='mb-3 flex items-center justify-between'>
        <div className='flex items-center gap-2'>
          <svg
            className='h-5 w-5 text-red-600'
            fill='none'
            stroke='currentColor'
            viewBox='0 0 24 24'
          >
            <path
              strokeLinecap='round'
              strokeLinejoin='round'
              strokeWidth={2}
              d='M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z'
            />
          </svg>
          <h3 className='font-semibold text-red-800'>
            ⚠️ Expired Tickets ({expiredTickets.length})
          </h3>
        </div>
        <span className='text-xs text-red-600'>
          Auto-refreshes every minute
        </span>
      </div>

      <div className='max-h-64 overflow-y-auto'>
        <table className='w-full text-sm'>
          <thead className='sticky top-0 bg-red-100 text-xs text-red-700'>
            <tr>
              <th className='px-2 py-2 text-left'>Ticket</th>
              <th className='px-2 py-2 text-left'>Type</th>
              <th className='px-2 py-2 text-left'>Reported</th>
              <th className='px-2 py-2 text-left'>Technician</th>
              <th className='px-2 py-2 text-center'>Overdue</th>
            </tr>
          </thead>
          <tbody>
            {expiredTickets.map((ticket) => {
              const hoursOverdue = getHoursOverdue(ticket);
              const ctype = ticket.customerType as keyof typeof CustomerType;
              const config = CustomerType[ctype];

              return (
                <tr
                  key={ticket.idTicket}
                  className='cursor-pointer border-b border-red-100 hover:bg-red-100/50'
                  onClick={() => onTicketClick?.(ticket.idTicket)}
                >
                  <td className='px-2 py-2 font-medium text-red-900'>
                    {ticket.ticket}
                  </td>
                  <td className='px-2 py-2'>
                    {config ? (
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${config.bg} ${config.color}`}
                      >
                        {config.icon} {config.label}
                      </span>
                    ) : (
                      <span className='text-gray-500'>-</span>
                    )}
                  </td>
                  <td className='px-2 py-2 text-red-700'>
                    {formatDateWIB(ticket.reportedDate, 'dd MMM HH:mm')}
                  </td>
                  <td className='px-2 py-2 text-red-700'>
                    {ticket.technicianName || (
                      <span className='text-red-400 italic'>Unassigned</span>
                    )}
                  </td>
                  <td className='px-2 py-2 text-center'>
                    <span className='rounded-full bg-red-600 px-2 py-1 text-xs font-bold text-white'>
                      {hoursOverdue.toFixed(1)}h
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
