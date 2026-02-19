'use client';

import TicketList from '@/app/components/tickets/TicketListTech';
import { useEffect, useState } from 'react';
import { fetchWithAuth } from '@/app/libs/fetcher';

interface Stats {
  total: number;
  open: number;
  assigned: number;
  closed: number;
}

export default function HelpdeskPage() {
  const [stats, setStats] = useState<Stats>({
    total: 0,
    open: 0,
    assigned: 0,
    closed: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetchWithAuth('/api/tickets/stats');
        if (!res) return;
        const data = await res.json();
        if (data.success) {
          setStats(data.data);
        }
      } catch (err) {
        console.error('Failed to fetch stats:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, []);

  return (
    <div className='min-h-screen bg-gray-50 p-6'>
      <div className='mx-auto max-w-7xl'>
        <div className='mb-8'>
          <h1 className='text-3xl font-bold text-gray-800'>
            Helpdesk Dashboard
          </h1>
          <p className='text-gray-600'>Manage and monitor all tickets</p>
        </div>

        <div className='mb-8 grid grid-cols-1 gap-4 md:grid-cols-4'>
          <div className='rounded-xl border border-slate-200 bg-white p-5'>
            <div className='text-2xl font-bold text-blue-600'>
              {loading ? '...' : stats.total}
            </div>
            <div className='text-sm text-slate-500'>Total Tickets</div>
          </div>
          <div className='rounded-xl border border-slate-200 bg-white p-5'>
            <div className='text-2xl font-bold text-amber-600'>
              {loading ? '...' : stats.open}
            </div>
            <div className='text-sm text-slate-500'>Open</div>
          </div>
          <div className='rounded-xl border border-slate-200 bg-white p-5'>
            <div className='text-2xl font-bold text-green-600'>
              {loading ? '...' : stats.assigned}
            </div>
            <div className='text-sm text-slate-500'>Assigned</div>
          </div>
          <div className='rounded-xl border border-slate-200 bg-white p-5'>
            <div className='text-2xl font-bold text-slate-600'>
              {loading ? '...' : stats.closed}
            </div>
            <div className='text-sm text-slate-500'>Closed</div>
          </div>
        </div>

        <div>
          <h2 className='mb-4 text-xl font-semibold text-gray-800'>
            Recent Tickets
          </h2>
          <TicketList limit={10} />
        </div>
      </div>
    </div>
  );
}
