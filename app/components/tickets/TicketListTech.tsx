'use client';

import { useEffect, useState } from 'react';
import { Ticket } from '@/app/types/ticket';
import { fetchWithAuth } from '@/app/libs/fetcher';

interface Props {
  limit?: number;
}

export default function TicketListTech({ limit }: Props) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchTickets = async () => {
      try {
        const res = await fetchWithAuth('/api/tickets?limit=100');
        if (!res) return;
        const data = await res.json();
        if (data.success && data.data?.data) {
          setTickets(limit ? data.data.data.slice(0, limit) : data.data.data);
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
    return (
      <div className='flex items-center justify-center py-8'>
        <div className='h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent'></div>
      </div>
    );
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
              <div className='mb-2 flex items-center gap-2'>
                <span className='font-mono text-sm font-medium text-slate-500'>
                  #{ticket.ticket}
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    ticket.hasilVisit === 'ASSIGNED'
                      ? 'bg-amber-100 text-amber-700'
                      : ticket.hasilVisit === 'ON_PROGRESS'
                        ? 'bg-blue-100 text-blue-700'
                        : ticket.hasilVisit === 'CLOSE'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-100 text-gray-700'
                  }`}
                >
                  {ticket.hasilVisit || 'Open'}
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
