'use client';

import { useEffect, useMemo, useState } from 'react';
import { fetchWithAuth } from '@/app/libs/fetcher';

interface ByServiceAreaRow {
  id_sa: number;
  nama_sa: string;
  total: number;
  unassigned: number;
  open: number;
  assigned: number;
  closed: number;
}

interface TicketStatsData {
  total: number;
  unassigned: number;
  open: number;
  assigned: number;
  closed: number;
  byServiceArea?: ByServiceAreaRow[];
}

interface Props {
  workzone?: string; // selected service_area id_sa
}

export default function TicketStats({ workzone }: Props) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<TicketStatsData>({
    total: 0,
    unassigned: 0,
    open: 0,
    assigned: 0,
    closed: 0,
    byServiceArea: [],
  });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const params = new URLSearchParams({ includeBy: 'sa' });
        if (workzone) params.set('workzone', workzone);

        const res = await fetchWithAuth(
          `/api/tickets/stats?${params.toString()}`,
        );
        if (!res) return;
        const json = await res.json().catch(() => null);

        if (!res.ok || !json?.success) {
          throw new Error(json?.message || 'Failed to load stats');
        }

        if (!cancelled) {
          setData({
            total: Number(json.data?.total || 0),
            unassigned: Number(json.data?.unassigned || 0),
            open: Number(json.data?.open || 0),
            assigned: Number(json.data?.assigned || 0),
            closed: Number(json.data?.closed || 0),
            byServiceArea: (json.data?.byServiceArea || []).map((r: any) => ({
              id_sa: Number(r.id_sa),
              nama_sa: String(r.nama_sa ?? ''),
              total: Number(r.total || 0),
              unassigned: Number(r.unassigned || 0),
              open: Number(r.open || 0),
              assigned: Number(r.assigned || 0),
              closed: Number(r.closed || 0),
            })),
          });
        }
      } catch (e) {
        if (!cancelled) {
          setData({
            total: 0,
            unassigned: 0,
            open: 0,
            assigned: 0,
            closed: 0,
            byServiceArea: [],
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [workzone]);

  const bySa = useMemo(() => data.byServiceArea || [], [data.byServiceArea]);

  return (
    <div className='space-y-4'>
      <div className='grid grid-cols-2 gap-4 md:grid-cols-5'>
        <StatCard title='Total' value={data.total} loading={loading} />
        <StatCard
          title='Open'
          value={data.open}
          color='yellow'
          loading={loading}
        />
        <StatCard
          title='Assigned'
          value={data.assigned}
          color='blue'
          loading={loading}
        />
        <StatCard
          title='Closed'
          value={data.closed}
          color='green'
          loading={loading}
        />
        <StatCard
          title='Unassigned'
          value={data.unassigned}
          color='red'
          loading={loading}
        />
      </div>

      {bySa.length > 0 && (
        <div className='overflow-hidden rounded-xl border bg-white shadow-sm'>
          <div className='border-b px-4 py-3'>
            <p className='text-sm font-semibold text-slate-900'>
              By Service Area
            </p>
            <p className='text-xs text-slate-500'>Auto-synced from tickets</p>
          </div>

          <div className='overflow-x-auto'>
            <table className='min-w-full text-sm'>
              <thead className='bg-slate-50 text-xs text-slate-500 uppercase'>
                <tr>
                  <th className='px-4 py-3 text-left'>Service Area</th>
                  <th className='px-4 py-3 text-center'>Total</th>
                  <th className='px-4 py-3 text-center'>Open</th>
                  <th className='px-4 py-3 text-center'>Assigned</th>
                  <th className='px-4 py-3 text-center'>Closed</th>
                  <th className='px-4 py-3 text-center'>Unassigned</th>
                </tr>
              </thead>
              <tbody>
                {bySa.map((row) => (
                  <tr key={row.id_sa} className='border-t hover:bg-slate-50'>
                    <td className='px-4 py-3 font-medium text-slate-900'>
                      {row.nama_sa || `SA #${row.id_sa}`}
                    </td>
                    <td className='px-4 py-3 text-center tabular-nums'>
                      {row.total}
                    </td>
                    <td className='px-4 py-3 text-center tabular-nums'>
                      {row.open}
                    </td>
                    <td className='px-4 py-3 text-center tabular-nums'>
                      {row.assigned}
                    </td>
                    <td className='px-4 py-3 text-center tabular-nums'>
                      {row.closed}
                    </td>
                    <td className='px-4 py-3 text-center tabular-nums'>
                      {row.unassigned}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({
  title,
  value,
  color = 'gray',
  loading = false,
}: {
  title: string;
  value: number;
  color?: string;
  loading?: boolean;
}) {
  const colorMap: Record<string, string> = {
    gray: 'bg-gray-100 text-gray-700',
    yellow: 'bg-yellow-100 text-yellow-700',
    blue: 'bg-blue-100 text-blue-700',
    green: 'bg-green-100 text-green-700',
    red: 'bg-red-100 text-red-700',
  };

  return (
    <div className='rounded-xl border bg-white p-4 shadow-sm'>
      <p className='text-sm text-gray-500'>{title}</p>
      <p className={`mt-2 text-2xl font-semibold ${colorMap[color]}`}>
        {loading ? '…' : value}
      </p>
    </div>
  );
}
