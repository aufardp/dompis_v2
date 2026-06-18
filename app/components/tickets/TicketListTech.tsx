'use client';

import '@aejkatappaja/phantom-ui';
import { useEffect, useState } from 'react';
import { Ticket } from '@/app/types/ticket';
import { fetchWithAuth } from '@/app/libs/fetcher';
import { isTicketClosed, getStatusLabel } from '@/app/libs/ticket-utils';
import { calculateTicketAge, getTicketAgeColor } from '@/app/utils/datetime';
import Badge from '../ui/badge/Badge';
import { getStatusColor } from './helpers';

interface Props {
  limit?: number;
}

function TicketListTechLoading() {
  return (
    <phantom-ui suppressHydrationWarning fallback-radius={8}
      loading
      animation='shimmer'
      reveal={0.12}
      loading-label='Loading technical ticket list'
    >
      <div className='grid gap-4'>
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className='rounded-xl border border-slate-200 bg-white p-4 shadow-sm'
          >
            <div className='flex items-start justify-between gap-4'>
              <div className='min-w-0 flex-1'>
                <div className='mb-2 flex flex-wrap items-center gap-2'>
                  <div className='h-4 w-24 rounded-full bg-slate-200' />
                  <div className='h-5 w-20 rounded-full bg-slate-100' />
                  <div className='h-5 w-16 rounded-full bg-slate-100' />
                </div>
                <div className='h-4 w-5/6 rounded-full bg-slate-200' />
                <div className='mt-2 grid grid-cols-2 gap-2'>
                  <div className='h-3.5 rounded-full bg-slate-100' />
                  <div className='h-3.5 rounded-full bg-slate-100' />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </phantom-ui>
  );
}

export default function TicketListTech({ limit }: Props) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchTickets = async () => {
      try {
        const fetchLimit = limit ?? 10;
        const res = await fetchWithAuth(`/api/tickets?limit=${fetchLimit}`);
        if (!res) return;
        const data = await res.json();
        if (data.success && data.data?.data) {
          setTickets(data.data.data);
        } else {
          setError(data.message || 'Failed to fetch tickets');
        }
      } catch {
        setError('Failed to fetch tickets');
      } finally {
        setLoading(false);
      }
    };
    fetchTickets();
  }, [limit]);

  if (loading) {
    return <TicketListTechLoading />;
  }

  if (error)
    return <div className='py-8 text-center text-red-500'>{error}</div>;
  if (tickets.length === 0)
    return (
      <div className='py-8 text-center text-slate-500'>No tickets found</div>
    );

  return (
    <div className='grid gap-4'>
      {tickets.map((ticket) => (
        <div
          key={ticket.idTicket}
          className='rounded-xl border border-slate-200 bg-white p-4 shadow-sm'
        >
          <div className='flex items-start justify-between gap-4'>
            <div className='min-w-0 flex-1'>
              <div className='mb-2 flex flex-wrap items-center gap-2'>
                <span className='font-mono text-sm font-medium text-slate-500'>
                  #{ticket.ticket}
                </span>
                <Badge
                  color={
                    isTicketClosed(ticket.status_update)
                      ? 'success'
                      : getStatusColor(ticket.status_update || '')
                  }
                >
                  {getStatusLabel(ticket.status_update || '')}
                </Badge>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    getTicketAgeColor(
                      ticket.reportedDate,
                      ticket.hasilVisit,
                      ticket.closedAt,
                    ) === 'green'
                      ? 'bg-green-100 text-green-700'
                      : getTicketAgeColor(
                            ticket.reportedDate,
                            ticket.hasilVisit,
                            ticket.closedAt,
                          ) === 'yellow'
                        ? 'bg-yellow-100 text-yellow-700'
                        : getTicketAgeColor(
                              ticket.reportedDate,
                              ticket.hasilVisit,
                              ticket.closedAt,
                            ) === 'orange'
                          ? 'bg-orange-100 text-orange-700'
                          : getTicketAgeColor(
                                ticket.reportedDate,
                                ticket.hasilVisit,
                                ticket.closedAt,
                              ) === 'red'
                            ? 'bg-red-100 text-red-700'
                            : 'bg-gray-100 text-gray-700'
                  }`}
                >
                  {calculateTicketAge(
                    ticket.reportedDate,
                    ticket.hasilVisit,
                    ticket.closedAt,
                  )}
                </span>
              </div>
              <h4 className='line-clamp-2 text-sm font-semibold text-slate-800'>
                {ticket.summary || ticket.symptom || '-'}
              </h4>
              <div className='mt-2 grid grid-cols-2 gap-2 text-xs text-slate-600'>
                <div>
                  <span className='text-slate-400'>Pelanggan:</span>{' '}
                  {ticket.contactName || '-'}
                </div>
                <div>
                  <span className='text-slate-400'>Service:</span>{' '}
                  {ticket.serviceNo || '-'}
                </div>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
