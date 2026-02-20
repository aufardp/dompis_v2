'use client';

import { useEffect, useMemo, useState } from 'react';
import { fetchWithAuth } from '@/app/libs/fetcher';
import { TicketCtype, CustomerType } from '@/app/types/ticket';
import CustomerTypeCard from './CustomerTypeCard';

interface ByServiceAreaRow {
  id_sa: number;
  nama_sa: string;
  total: number;
  unassigned: number;
  open: number;
  assigned: number;
  closed: number;
}

interface ByCustomerTypeRow {
  ctype: TicketCtype;
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
  byCustomerType?: ByCustomerTypeRow[];
}

interface Props {
  workzone?: string;
  ctype?: string;
  onCtypeChange?: (ctype: TicketCtype | 'all') => void;
  onCountsChange?: (counts: Record<string, number>) => void;
}

export default function TicketStats({
  workzone,
  ctype,
  onCtypeChange,
  onCountsChange,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<TicketStatsData>({
    total: 0,
    unassigned: 0,
    open: 0,
    assigned: 0,
    closed: 0,
    byServiceArea: [],
    byCustomerType: [],
  });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const params = new URLSearchParams({ includeBy: 'sa,ctype' });
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
            byCustomerType: (json.data?.byCustomerType || []).map((r: any) => ({
              ctype: r.ctype as TicketCtype,
              total: Number(r.total || 0),
              unassigned: Number(r.unassigned || 0),
              open: Number(r.open || 0),
              assigned: Number(r.assigned || 0),
              closed: Number(r.closed || 0),
            })),
          });

          // Pass counts to parent
          const counts: Record<string, number> = {
            all: Number(json.data?.total || 0),
          };
          (json.data?.byCustomerType || []).forEach((r: any) => {
            counts[r.ctype] = Number(r.total || 0);
          });
          onCountsChange?.(counts);
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
            byCustomerType: [],
          });
          onCountsChange?.({ all: 0 });
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
  const byCtype = useMemo(
    () => data.byCustomerType || [],
    [data.byCustomerType],
  );

  const handleCtypeClick = (ctypeKey: TicketCtype) => {
    if (onCtypeChange) {
      onCtypeChange(ctypeKey);
    }
  };

  return (
    <div className='space-y-5 sm:space-y-6'>
      <div className='grid grid-cols-2 gap-3 sm:gap-4'>
        <StatCard title='Total' value={data.total} loading={loading} />
        <StatCard
          title='Unassigned'
          value={data.unassigned}
          color='red'
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
      </div>

      {byCtype.length > 0 && (
        <div className='space-y-3'>
          <p className='text-sm font-semibold text-slate-900'>
            By Customer Type
          </p>
          <div className='grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4'>
            {byCtype.map((row) => (
              <CustomerTypeCard
                key={row.ctype}
                ctype={row.ctype}
                total={row.total}
                open={row.open}
                unassigned={row.unassigned}
                assigned={row.assigned}
                closed={row.closed}
                isActive={ctype === row.ctype}
                onClick={() => handleCtypeClick(row.ctype)}
              />
            ))}
          </div>
        </div>
      )}

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
    <div className='rounded-xl border bg-white p-3 shadow-sm sm:p-4'>
      <p className='text-xs text-gray-500 sm:text-sm'>{title}</p>
      <p
        className={`mt-1 text-xl font-semibold sm:mt-2 sm:text-2xl ${colorMap[color]}`}
      >
        {loading ? '…' : value}
      </p>
    </div>
  );
}
