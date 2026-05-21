'use client';

import { useQuery } from '@tanstack/react-query';
import DataFreshnessBadge from '../DataFreshnessBadge';
import TicketDurationPanel from './TicketDurationPanel';
import DurationPanelSkeleton from './DurationPanelSkeleton';

interface PanelData {
  type: string;
  label: string;
  buckets: string[];
  areas: { name: string; region: string; sas: { name: string; counts: number[] }[] }[];
  totals: number[];
  grandTotal?: number;
}

interface DashboardResponse {
  syncDate: string | null;
  generatedAt: string;
  panels: PanelData[];
  error?: string;
}

export default function DashboardDurasiClient() {
  const { data, isLoading, isError, refetch, isFetching } = useQuery<DashboardResponse>({
    queryKey: ['dashboard-durasi'],
    queryFn: async () => {
      const res = await fetch('/api/dashboard/durasi');
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to fetch');
      }
      return res.json();
    },
    refetchInterval: 60000,
    staleTime: 30000,
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="xl:col-span-2"><DurationPanelSkeleton /></div>
        <DurationPanelSkeleton />
        <DurationPanelSkeleton />
        <DurationPanelSkeleton />
        <DurationPanelSkeleton />
        <div className="xl:col-span-2"><DurationPanelSkeleton /></div>
        <DurationPanelSkeleton />
        <DurationPanelSkeleton />
      </div>
    );
  }

  if (isError || data?.error) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-12">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          {data?.error || 'Gagal memuat data. Klik refresh untuk mencoba lagi.'}
        </p>
        <button onClick={() => refetch()} className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
          Refresh
        </button>
      </div>
    );
  }

  if (!data?.panels?.length) {
    return (
      <div className="flex flex-col items-center gap-3 py-12">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Tidak ada Service Area yang dikonfigurasi untuk akun ini
        </p>
      </div>
    );
  }

  const panelMap = new Map(data.panels.map((p) => [p.type, p]));
  const getPanel = (type: string) => panelMap.get(type);

  return (
    <div className="space-y-4">
      {data.generatedAt && (
        <DataFreshnessBadge generatedAt={data.generatedAt} onRefresh={() => refetch()} isRefreshing={isFetching} />
      )}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="xl:col-span-2">
          {getPanel('REGULER') && <TicketDurationPanel panel={getPanel('REGULER')!} />}
        </div>
        {getPanel('HVC_DIAMOND_PLATINUM') && <TicketDurationPanel panel={getPanel('HVC_DIAMOND_PLATINUM')!} />}
        {getPanel('HVC_GOLD') && <TicketDurationPanel panel={getPanel('HVC_GOLD')!} />}
        {getPanel('MANJA') && <TicketDurationPanel panel={getPanel('MANJA')!} />}
        {getPanel('FFG') && <TicketDurationPanel panel={getPanel('FFG')!} />}
        <div className="xl:col-span-2">
          {getPanel('SQM') && <TicketDurationPanel panel={getPanel('SQM')!} />}
        </div>
        {getPanel('ANAK_GAMAS') && <TicketDurationPanel panel={getPanel('ANAK_GAMAS')!} />}
        {getPanel('HSI') && <TicketDurationPanel panel={getPanel('HSI')!} />}
      </div>
    </div>
  );
}
