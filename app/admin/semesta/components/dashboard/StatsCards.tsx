'use client';

import StatCard from './StatCard';
import type { StatMetrics } from '../../hooks/useTicketAnalytics';

export default function StatsCards({
  metrics,
  loading,
}: {
  metrics?: StatMetrics;
  loading?: boolean;
}) {
  return (
    <div className='grid grid-cols-2 gap-4 md:grid-cols-4'>
      <StatCard
        title='Total Tickets'
        value={metrics?.total ?? 0}
        variant='total'
        loading={loading}
      />
      <StatCard
        title='Open Tickets'
        value={metrics?.open ?? 0}
        variant='open'
        loading={loading}
      />
      <StatCard
        title='On Progress'
        value={metrics?.onProgress ?? 0}
        variant='progress'
        loading={loading}
      />
      <StatCard
        title='Closed Tickets'
        value={metrics?.closed ?? 0}
        variant='closed'
        loading={loading}
      />
    </div>
  );
}
