'use client';

import { useState, useEffect } from 'react';
import { Ticket } from '@/app/types/ticket';
import { fetchWithAuth } from '@/app/libs/fetcher';

interface DashboardStats {
  totalTickets: number;
  open: number;
  inProgress: number;
  closed: number;
}

export default function SuperadminPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [stats, setStats] = useState<DashboardStats>({
    totalTickets: 0,
    open: 0,
    inProgress: 0,
    closed: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [ticketsRes, statsRes] = await Promise.all([
        fetchWithAuth('/api/tickets'),
        fetchWithAuth('/api/dashboard/stats?type=stats'),
      ]);

      if (!ticketsRes || !statsRes) return;

      const ticketsData = await ticketsRes.json();
      const statsData = await statsRes.json();

      if (ticketsData.success) {
        setTickets(ticketsData.data?.data || []);
      }

      if (statsData.success) {
        const s = statsData.data || {};
        setStats({
          totalTickets: s.totalTickets || 0,
          open:
            (s.totalTickets || 0) -
            (s.completedTickets || 0) -
            (s.unfinishedTickets || 0),
          inProgress: s.unfinishedTickets || 0,
          closed: s.completedTickets || 0,
        });
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Open':
        return 'blue';
      case 'In Progress':
        return 'amber';
      case 'Closed':
        return 'green';
      case 'Pending':
        return 'gray';
      default:
        return 'gray';
    }
  };

  return (
    <div className='min-h-screen bg-gray-50 p-4 md:p-6'>
      <div className='mx-auto max-w-7xl'>
        <div className='mb-6 md:mb-8'>
          <h1 className='text-2xl font-bold text-gray-800 md:text-3xl'>
            Superadmin Dashboard
          </h1>
          <p className='text-sm text-gray-600 md:text-base'>
            Manage and monitor all tickets
          </p>
        </div>

        <div className='mb-6 grid grid-cols-2 gap-3 md:mb-8 md:grid-cols-4 md:gap-4'>
          <div className='rounded-xl border border-slate-200 bg-white p-4 md:p-5'>
            <div className='text-xl font-bold text-blue-600 md:text-2xl'>
              {stats.totalTickets}
            </div>
            <div className='text-xs text-slate-500 md:text-sm'>
              Total Tickets
            </div>
          </div>
          <div className='rounded-xl border border-slate-200 bg-white p-4 md:p-5'>
            <div className='text-xl font-bold text-amber-600 md:text-2xl'>
              {stats.open}
            </div>
            <div className='text-xs text-slate-500 md:text-sm'>Open</div>
          </div>
          <div className='rounded-xl border border-slate-200 bg-white p-4 md:p-5'>
            <div className='text-xl font-bold text-green-600 md:text-2xl'>
              {stats.inProgress}
            </div>
            <div className='text-xs text-slate-500 md:text-sm'>In Progress</div>
          </div>
          <div className='rounded-xl border border-slate-200 bg-white p-4 md:p-5'>
            <div className='text-xl font-bold text-slate-600 md:text-2xl'>
              {stats.closed}
            </div>
            <div className='text-xs text-slate-500 md:text-sm'>Closed</div>
          </div>
        </div>

        <div className='grid grid-cols-1 gap-6 lg:grid-cols-3'>
          <div className='lg:col-span-2'>
            <div className='overflow-hidden rounded-xl border bg-white shadow-sm'>
              <div className='border-b p-4'>
                <h2 className='text-lg font-semibold text-gray-800'>
                  Recent Tickets
                </h2>
              </div>
              <div className='overflow-x-auto'>
                <table className='w-full text-left text-sm'>
                  <thead className='bg-slate-50'>
                    <tr>
                      <th className='px-4 py-3'>Ticket</th>
                      <th className='px-4 py-3'>Customer</th>
                      <th className='px-4 py-3'>Issue</th>
                      <th className='px-4 py-3'>Status</th>
                      <th className='px-4 py-3'>Technician</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td
                          colSpan={5}
                          className='px-4 py-8 text-center text-slate-500'
                        >
                          Loading...
                        </td>
                      </tr>
                    ) : tickets.length === 0 ? (
                      <tr>
                        <td
                          colSpan={5}
                          className='px-4 py-8 text-center text-slate-500'
                        >
                          No tickets found
                        </td>
                      </tr>
                    ) : (
                      tickets.slice(0, 10).map((ticket, index) => (
                        <tr
                          key={ticket.idTicket || index}
                          className='border-t hover:bg-slate-50'
                        >
                          <td className='px-4 py-3 font-mono font-medium'>
                            #{ticket.ticket || ticket.idTicket}
                          </td>
                          <td className='px-4 py-3'>
                            <div className='font-medium'>
                              {ticket.contactName}
                            </div>
                            <div className='text-xs text-slate-500'>
                              {ticket.serviceNo}
                            </div>
                          </td>
                          <td
                            className='max-w-xs truncate px-4 py-3'
                            title={ticket.summary || ticket.symptom}
                          >
                            {ticket.summary || ticket.symptom}
                          </td>
                          <td className='px-4 py-3'>
                            <span
                              className={`rounded px-2 py-1 text-xs font-medium ${
                                getStatusColor(ticket.status) === 'blue'
                                  ? 'bg-blue-100 text-blue-700'
                                  : getStatusColor(ticket.status) === 'amber'
                                    ? 'bg-amber-100 text-amber-700'
                                    : getStatusColor(ticket.status) === 'green'
                                      ? 'bg-green-100 text-green-700'
                                      : 'bg-gray-100 text-gray-700'
                              }`}
                            >
                              {ticket.status || 'Open'}
                            </span>
                          </td>
                          <td className='px-4 py-3'>
                            {ticket.technicianName ? (
                              <span className='font-medium text-green-600'>
                                {ticket.technicianName || 'Assigned'}
                              </span>
                            ) : (
                              <span className='text-slate-400'>Unassigned</span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
