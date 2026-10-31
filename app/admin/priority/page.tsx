// app/admin/priority/page.tsx

'use client';

import { useEffect, useState, useMemo } from 'react';
import AdminLayout from '@/app/components/layout/AdminLayout';
import { useCurrentUser } from '@/app/hooks/useCurrentUser';
import { useQuery } from '@tanstack/react-query';
import {
  PriorityBranchCode,
  BranchFullPrioritySummary,
  PrioritySummaryData,
} from '@/app/libs/priority/types';
import { Button } from '@/app/components/ui/shadcn-button';
import {
  Loader2,
  RefreshCcw,
  Download,
  AlertCircle,
  CheckCircle2,
  Clock,
  X,
  Search,
  Eye,
  BarChart2,
  PieChart,
  Layers,
  AlertTriangle,
} from 'lucide-react';
import { BRANCH_LIST } from '@/app/libs/priority/constants';
import { cn } from '@/app/libs/utils';

const PRIORITY_BRANCH_CODES: PriorityBranchCode[] = [
  'PKL',
  'DPS',
  'MTR',
  'KPG',
  'FLO',
];

function formatNumber(num: number): string {
  return num.toLocaleString('id-ID');
}

export default function PriorityPage() {
  const { user, loading: userLoading } = useCurrentUser();

  // Modal State for drill down
  const [drillDown, setDrillDown] = useState<{
    open: boolean;
    branch: PriorityBranchCode;
    kind: string;
    subKind?: string;
    bucket?: string;
    state?: string;
    label: string;
  }>({
    open: false,
    branch: 'PKL',
    kind: 'reguler',
    label: '',
  });

  const [ticketSearch, setTicketSearch] = useState('');
  const [page, setPage] = useState(1);

  const {
    data: summaryData,
    isLoading: summaryLoading,
    refetch: refetchSummary,
  } = useQuery<{
    success: boolean;
    data: PrioritySummaryData;
  }>({
    queryKey: ['priority', 'summary'],
    queryFn: async () => {
      const res = await fetch('/api/priority/summary');
      if (!res.ok) throw new Error('Gagal memuat summary');
      return res.json();
    },
    enabled: !!user?.priority_access,
    refetchInterval: 60000,
  });

  const data = summaryData?.data;

  const [isStale, setIsStale] = useState(false);
  useEffect(() => {
    if (data?.last_update) {
      setIsStale(false);
    }
  }, [data]);

  const branchDataMap = useMemo(() => {
    if (!data?.branches) return {} as Record<PriorityBranchCode, BranchFullPrioritySummary>;
    const map: Record<PriorityBranchCode, BranchFullPrioritySummary> = {} as any;
    PRIORITY_BRANCH_CODES.forEach((code) => {
      if (data.branches[code]) {
        map[code] = data.branches[code];
      }
    });
    return map;
  }, [data?.branches]);

  const { data: ticketsData, isLoading: ticketsLoading } = useQuery({
    queryKey: [
      'priority',
      'tickets',
      drillDown.branch,
      drillDown.kind,
      drillDown.bucket,
      drillDown.state,
      drillDown.subKind,
      ticketSearch,
      page,
    ],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append('branch', drillDown.branch);
      params.append('kind', drillDown.kind);
      if (drillDown.subKind) params.append('subKind', drillDown.subKind);
      if (drillDown.bucket) params.append('bucket', drillDown.bucket);
      if (drillDown.state) params.append('state', drillDown.state);
      if (ticketSearch) params.append('q', ticketSearch);
      params.append('page', String(page));
      params.append('limit', '20');

      const res = await fetch(`/api/priority/tickets?${params.toString()}`);
      if (!res.ok) throw new Error('Gagal memuat tickets');
      return res.json();
    },
    enabled: drillDown.open,
  });

  const handleOpenDrillDown = (
    branch: PriorityBranchCode,
    kind: string,
    label: string,
    bucket?: string,
    state?: string,
    subKind?: string,
  ) => {
    setDrillDown({ open: true, branch, kind, label, bucket, state, subKind });
    setTicketSearch('');
    setPage(1);
  };

  const handleExportTickets = async () => {
    const params = new URLSearchParams();
    params.append('scope', 'tickets');
    params.append('branch', drillDown.branch);
    params.append('kind', drillDown.kind);
    if (drillDown.subKind) params.append('subKind', drillDown.subKind);
    if (drillDown.bucket) params.append('bucket', drillDown.bucket);
    if (drillDown.state) params.append('state', drillDown.state || 'all');
    if (ticketSearch) params.append('q', ticketSearch);

    window.open(`/api/priority/export?${params.toString()}`, '_blank');
  };

  if (userLoading) {
    return (
      <AdminLayout>
        <div className='flex min-h-[60vh] items-center justify-center p-8'>
          <Loader2 className='h-8 w-8 animate-spin text-blue-600' />
        </div>
      </AdminLayout>
    );
  }

  if (!user?.priority_access) {
    return (
      <AdminLayout>
        <div className='p-8 text-center'>
          <p className='font-semibold text-red-600'>
            Akses ditolak. Anda tidak memiliki izin ke halaman Monitoring
            Priority.
          </p>
        </div>
      </AdminLayout>
    );
  }

  const totalOpenAll = data?.total_saldo_open || 0;
  const totalOverSlaAll = data?.total_over_sla || 0;

  return (
    <AdminLayout>
      <div className='bg-bg min-h-screen space-y-8 p-4 text-(--text-primary) md:p-6'>
        {/* 3.1 Header Halaman */}
        <div className='flex flex-col gap-4 border-b border-(--border) pb-4 md:flex-row md:items-center md:justify-between'>
          <div className='space-y-1'>
            <div className='flex items-center gap-2'>
              <h1 className='text-lg font-bold uppercase md:text-xl'>
                MONITORING TIKET PRIORITAS
              </h1>
            </div>
            <div className='flex items-center gap-3 pl-3 text-xs text-(--text-secondary)'>
              <span className='flex items-center gap-1.5'>
                <Clock className='h-3.5 w-3.5 text-red-500' />
                LAST UPDATE : {data?.last_update || '-'}
              </span>
              <span
                className={cn(
                  'rounded px-2 py-0.5 text-[10px] font-bold tracking-widest uppercase',
                  isStale
                    ? 'border border-amber-200 bg-amber-100 text-amber-700 dark:border-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
                    : 'border border-red-100 bg-red-50 text-red-600 dark:border-red-900 dark:bg-red-950/40 dark:text-red-400',
                )}
              >
                {isStale ? 'TERTUNDA' : 'LIVE'}
              </span>
            </div>
          </div>

          <div className='flex items-center gap-2 pl-3 md:pl-0'>
            <Button
              variant='default'
              size='sm'
              className='gap-2 border-none bg-blue-600 font-semibold text-white shadow-md hover:bg-blue-700'
              onClick={() =>
                window.open('/api/priority/export?scope=summary', '_blank')
              }
            >
              <Download className='h-4 w-4' />
              Export
            </Button>
            <Button
              variant='outline'
              size='sm'
              className='bg-surface hover:bg-surface-2 border-(--border) text-(--text-secondary) hover:text-(--text-primary)'
              onClick={() => refetchSummary()}
            >
              <RefreshCcw
                className={cn('h-4 w-4', summaryLoading && 'animate-spin')}
              />
            </Button>
          </div>
        </div>

        {/* 3.2 Seksi 1 — SUMMARY TIKET PER BRANCH */}
        <div className='space-y-3'>
          <div className='bg-surface flex flex-col gap-2 rounded border border-(--border) px-4 py-2.5 shadow-sm sm:flex-row sm:items-center sm:justify-between'>
            <div className='flex items-center gap-2 text-xs font-bold tracking-wider text-(--text-primary) uppercase'>
              <BarChart2 className='h-4 w-4 text-blue-500' />
              SUMMARY TIKET PER BRANCH
            </div>
            <div className='flex items-center gap-2'>
              <span className='rounded border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700 dark:border-blue-800/60 dark:bg-blue-900/30 dark:text-blue-300'>
                TOTAL SALDO TIKET OPEN: {formatNumber(totalOpenAll)}
              </span>
              <span className='rounded border border-red-100 bg-red-50 px-3 py-1 text-xs font-bold text-red-700 dark:border-red-800/60 dark:bg-red-900/30 dark:text-red-300'>
                TOTAL OVER SLA (BRANCH): {formatNumber(totalOverSlaAll)}
              </span>
            </div>
          </div>

          <div className='grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5'>
            {BRANCH_LIST.map((b) => {
              const brData = branchDataMap[b.code as PriorityBranchCode];
              const card = brData?.card || {
                reguler_open: 0,
                sqm_open: 0,
                underspec_open: 0,
                total_open: 0,
              };

              return (
                <div
                  key={b.code}
                  className='bg-surface space-y-3 rounded border border-(--border) p-3.5 shadow-sm'
                >
                  <div className='flex items-center justify-between border-b border-(--border) pb-2'>
                    <div className='flex items-center gap-2'>
                      <div className='h-2.5 w-2.5 rounded-full bg-blue-500 shadow-sm' />
                      <span className='text-xs font-bold tracking-wider text-(--text-primary)'>
                        {b.name}
                      </span>
                    </div>
                    <span className='bg-bg rounded border border-(--border) px-2 py-0.5 text-[11px] font-semibold text-(--text-secondary)'>
                      Total Open: {formatNumber(card.total_open)}
                    </span>
                  </div>

                  <div className='grid grid-cols-3 gap-1.5 text-center'>
                    <div className='bg-bg/50 rounded border border-(--border) p-2'>
                      <p className='text-[9px] font-bold tracking-tight text-(--text-muted) uppercase'>
                        TIKET REGULER
                      </p>
                      <p className='mt-1 text-sm font-extrabold text-blue-600 dark:text-blue-400'>
                        {formatNumber(card.reguler_open)}
                      </p>
                    </div>
                    <div className='bg-bg/50 rounded border border-(--border) p-2'>
                      <p className='text-[9px] font-bold tracking-tight text-(--text-muted) uppercase'>
                        TIKET SQM
                      </p>
                      <p className='mt-1 text-sm font-extrabold text-amber-600 dark:text-amber-400'>
                        {formatNumber(card.sqm_open)}
                      </p>
                    </div>
                    <div className='bg-bg/50 rounded border border-(--border) p-2'>
                      <p className='text-[9px] font-bold tracking-tight text-(--text-muted) uppercase'>
                        UNDERSPEC
                      </p>
                      <p className='mt-1 text-sm font-extrabold text-red-600 dark:text-red-400'>
                        {formatNumber(card.underspec_open)}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 3.3 Seksi 2 — SUMMARY TIKET REGULER */}
        <div className='space-y-3'>
          <div className='bg-surface flex items-center justify-between rounded border border-(--border) px-4 py-2.5 shadow-sm'>
            <div className='flex items-center gap-2 text-xs font-bold tracking-wider text-(--text-primary) uppercase'>
              <PieChart className='h-4 w-4 text-purple-500' />
              SUMMARY TIKET REGULER
            </div>
            <span className='text-[11px] text-(--text-muted) italic'>
              *Klik sel untuk detail data
            </span>
          </div>

          <div className='bg-surface overflow-x-auto rounded border border-(--border) shadow-sm'>
            <table className='w-full text-left text-xs'>
              <thead className='bg-bg border-b border-(--border) text-[10px] font-bold tracking-wider text-(--text-secondary) uppercase'>
                <tr>
                  <th className='w-1/4 border-r border-(--border) px-4 py-3'>
                    PARETO
                  </th>
                  {BRANCH_LIST.map((b, i) => (
                    <th
                      key={b.code}
                      className={cn(
                        'w-[15%] px-4 py-3 text-center',
                        i < BRANCH_LIST.length - 1 &&
                          'border-r border-(--border)',
                      )}
                    >
                      {b.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className='divide-y divide-(--border)'>
                {/* SALDO TIKET OPEN */}
                <tr className='hover:bg-surface-2 transition-colors'>
                  <td className='border-r border-(--border) px-4 py-3 font-semibold text-(--text-primary)'>
                    SALDO TIKET OPEN
                  </td>
                  {BRANCH_LIST.map((b, i) => {
                    const br = branchDataMap[b.code as PriorityBranchCode];
                    const val = br?.card?.reguler_open || 0;
                    return (
                      <td
                        key={b.code}
                        className={cn(
                          'px-4 py-3 text-center font-bold',
                          i < BRANCH_LIST.length - 1 &&
                            'border-r border-(--border)',
                        )}
                      >
                        {val > 0 ? (
                          <button
                            onClick={() =>
                              handleOpenDrillDown(
                                b.code as PriorityBranchCode,
                                'reguler',
                                `${b.name} - Saldo Tiket Open`,
                              )
                            }
                            className='cursor-pointer text-blue-600 hover:underline dark:text-blue-400'
                          >
                            {formatNumber(val)}
                          </button>
                        ) : (
                          '0'
                        )}
                      </td>
                    );
                  })}
                </tr>

                {/* TIKET OSLA */}
                <tr className='hover:bg-surface-2 transition-colors'>
                  <td className='border-r border-(--border) px-4 py-3 font-semibold text-(--text-primary)'>
                    TIKET OSLA
                  </td>
                  {BRANCH_LIST.map((b, i) => {
                    const br = branchDataMap[b.code as PriorityBranchCode];
                    const val = br?.reguler_summary?.osla || 0;
                    return (
                      <td
                        key={b.code}
                        className={cn(
                          'px-4 py-3 text-center font-bold',
                          i < BRANCH_LIST.length - 1 &&
                            'border-r border-(--border)',
                        )}
                      >
                        {val > 0 ? (
                          <button
                            onClick={() =>
                              handleOpenDrillDown(
                                b.code as PriorityBranchCode,
                                'reguler',
                                `${b.name} - Tiket OSLA`,
                                undefined,
                                'over',
                              )
                            }
                            className='cursor-pointer text-red-600 hover:underline dark:text-red-400'
                          >
                            {formatNumber(val)}
                          </button>
                        ) : (
                          '0'
                        )}
                      </td>
                    );
                  })}
                </tr>

                {/* TIKET OPEN HI */}
                <tr className='hover:bg-surface-2 transition-colors'>
                  <td className='border-r border-(--border) px-4 py-3 font-semibold text-(--text-primary)'>
                    TIKET OPEN HI
                  </td>
                  {BRANCH_LIST.map((b, i) => {
                    const br = branchDataMap[b.code as PriorityBranchCode];
                    const val = br?.reguler_summary?.open_hi || 0;
                    return (
                      <td
                        key={b.code}
                        className={cn(
                          'px-4 py-3 text-center font-bold text-amber-600 dark:text-amber-500',
                          i < BRANCH_LIST.length - 1 &&
                            'border-r border-(--border)',
                        )}
                      >
                        {formatNumber(val)}
                      </td>
                    );
                  })}
                </tr>

                {/* TIKET CLOSE HI */}
                <tr className='hover:bg-surface-2 transition-colors'>
                  <td className='border-r border-(--border) px-4 py-3 font-semibold text-(--text-primary)'>
                    TIKET CLOSE HI
                  </td>
                  {BRANCH_LIST.map((b, i) => {
                    const br = branchDataMap[b.code as PriorityBranchCode];
                    const val = br?.reguler_summary?.close_hi || 0;
                    return (
                      <td
                        key={b.code}
                        className={cn(
                          'px-4 py-3 text-center font-bold text-emerald-600 dark:text-emerald-500',
                          i < BRANCH_LIST.length - 1 &&
                            'border-r border-(--border)',
                        )}
                      >
                        {formatNumber(val)}
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* 3.4 Seksi 3 — TIKET REGULER OPEN */}
        <div className='space-y-3'>
          <div className='bg-surface flex flex-col gap-2 rounded border border-(--border) px-4 py-2.5 shadow-sm sm:flex-row sm:items-center sm:justify-between'>
            <div className='flex items-center gap-2 text-xs font-bold tracking-wider text-(--text-primary) uppercase'>
              <Layers className='h-4 w-4 text-emerald-500' />
              TIKET REGULER OPEN
            </div>
            <div className='flex items-center gap-4 text-xs'>
              <div className='flex items-center gap-1.5'>
                <div className='h-3 w-3 rounded-sm border border-emerald-500 bg-emerald-500/10' />
                <span className='text-(--text-secondary)'>TTR Kritis</span>
              </div>
              <div className='flex items-center gap-1.5'>
                <div className='h-3 w-3 rounded-sm border border-red-500 bg-red-500/10' />
                <span className='text-(--text-secondary)'>TTR Terlewat</span>
              </div>
            </div>
          </div>

          <div className='bg-surface overflow-x-auto rounded border border-(--border) shadow-sm'>
            <table className='w-full table-fixed border-collapse text-left text-xs'>
              <thead className='bg-bg border-b border-(--border) text-center text-[10px] font-bold tracking-wider text-(--text-secondary)'>
                <tr>
                  <th
                    rowSpan={2}
                    className='w-28 border-r border-(--border) px-3 py-3 text-left align-middle'
                  >
                    BRANCH
                  </th>
                  <th
                    colSpan={3}
                    className='bg-bg/40 border-r-2 border-blue-500/40 px-2 py-2'
                  >
                    3 JAM HVC DIAMOND, VVIP
                  </th>
                  <th
                    colSpan={3}
                    className='bg-bg/40 border-r-2 border-blue-500/40 px-2 py-2'
                  >
                    6 JAM HVC PLATINUM
                  </th>
                  <th
                    colSpan={3}
                    className='bg-bg/40 border-r-2 border-blue-500/40 px-2 py-2'
                  >
                    3 JAM MANJA REGULER
                  </th>
                  <th colSpan={3} className='bg-bg/40 px-2 py-2'>
                    36 JAM REGULER
                  </th>
                </tr>
                <tr className='border-b border-(--border) text-[9px]'>
                  {/* Diamond */}
                  <th className='w-11 border-r border-(--border) bg-amber-50/50 px-1.5 py-2 font-semibold text-amber-700 dark:bg-amber-950/20 dark:text-amber-400'>
                    ALL
                  </th>
                  <th className='w-11 border-r border-(--border) bg-emerald-50/50 px-1.5 py-2 font-semibold text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400'>
                    &lt;3H
                  </th>
                  <th className='w-11 border-r-2 border-blue-500/40 bg-red-50/50 px-1.5 py-2 font-semibold text-red-700 dark:bg-red-950/20 dark:text-red-400'>
                    &gt;3H
                  </th>
                  {/* Platinum */}
                  <th className='w-11 border-r border-(--border) bg-amber-50/50 px-1.5 py-2 font-semibold text-amber-700 dark:bg-amber-950/20 dark:text-amber-400'>
                    ALL
                  </th>
                  <th className='w-11 border-r border-(--border) bg-emerald-50/50 px-1.5 py-2 font-semibold text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400'>
                    &lt;6H
                  </th>
                  <th className='w-11 border-r-2 border-blue-500/40 bg-red-50/50 px-1.5 py-2 font-semibold text-red-700 dark:bg-red-950/20 dark:text-red-400'>
                    &gt;6H
                  </th>
                  {/* Manja */}
                  <th className='w-11 border-r border-(--border) bg-amber-50/50 px-1.5 py-2 font-semibold text-amber-700 dark:bg-amber-950/20 dark:text-amber-400'>
                    ALL
                  </th>
                  <th className='w-11 border-r border-(--border) bg-emerald-50/50 px-1.5 py-2 font-semibold text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400'>
                    &lt;3H
                  </th>
                  <th className='w-11 border-r-2 border-blue-500/40 bg-red-50/50 px-1.5 py-2 font-semibold text-red-700 dark:bg-red-950/20 dark:text-red-400'>
                    &gt;3H
                  </th>
                  {/* Reguler */}
                  <th className='w-11 border-r border-(--border) bg-amber-50/50 px-1.5 py-2 font-semibold text-amber-700 dark:bg-amber-950/20 dark:text-amber-400'>
                    ALL
                  </th>
                  <th className='w-11 border-r border-(--border) bg-emerald-50/50 px-1.5 py-2 font-semibold text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400'>
                    &lt;36H
                  </th>
                  <th className='w-11 bg-red-50/50 px-1.5 py-2 font-semibold text-red-700 dark:bg-red-950/20 dark:text-red-400'>
                    &gt;36H
                  </th>
                </tr>
              </thead>
              <tbody className='divide-y divide-(--border)'>
                {BRANCH_LIST.map((b) => {
                  const br = branchDataMap[b.code as PriorityBranchCode];
                  const ttr = br?.reguler_ttr || {
                    diamond_vvip: { all: 0, within: 0, over: 0 },
                    platinum: { all: 0, within: 0, over: 0 },
                    manja: { all: 0, within: 0, over: 0 },
                    reguler: { all: 0, within: 0, over: 0 },
                  };

                  return (
                    <tr
                      key={b.code}
                      className='hover:bg-surface-2 text-center transition-colors'
                    >
                      <td className='w-28 truncate border-r border-(--border) px-3 py-3 text-left font-bold text-(--text-primary)'>
                        {b.name}
                      </td>

                      {/* Diamond */}
                      <td className='border-r border-(--border) bg-amber-50/20 px-1 py-3 font-bold text-(--text-primary) dark:bg-amber-950/10'>
                        {ttr.diamond_vvip.all > 0 ? (
                          <button
                            onClick={() =>
                              handleOpenDrillDown(
                                b.code as PriorityBranchCode,
                                'reguler',
                                `${b.name} - Diamond VVIP All`,
                                'diamond_vvip',
                              )
                            }
                            className='text-amber-600 hover:underline dark:text-amber-400'
                          >
                            {ttr.diamond_vvip.all}
                          </button>
                        ) : (
                          '0'
                        )}
                      </td>
                      <td className='border-r border-(--border) bg-emerald-50/20 px-1 py-3 font-bold text-emerald-600 dark:bg-emerald-950/10 dark:text-emerald-400'>
                        {ttr.diamond_vvip.within > 0 ? (
                          <button
                            onClick={() =>
                              handleOpenDrillDown(
                                b.code as PriorityBranchCode,
                                'reguler',
                                `${b.name} - Diamond VVIP Kritis (<3h)`,
                                'diamond_vvip',
                                'within',
                              )
                            }
                            className='text-emerald-700 hover:underline dark:text-emerald-300'
                          >
                            {ttr.diamond_vvip.within}
                          </button>
                        ) : (
                          '0'
                        )}
                      </td>
                      <td className='border-r-2 border-blue-500/40 bg-red-50/20 px-1 py-3 font-bold text-red-600 dark:bg-red-950/10 dark:text-red-400'>
                        {ttr.diamond_vvip.over > 0 ? (
                          <button
                            onClick={() =>
                              handleOpenDrillDown(
                                b.code as PriorityBranchCode,
                                'reguler',
                                `${b.name} - Diamond VVIP Terlewat (>3h)`,
                                'diamond_vvip',
                                'over',
                              )
                            }
                            className='text-red-700 hover:underline dark:text-red-300'
                          >
                            {ttr.diamond_vvip.over}
                          </button>
                        ) : (
                          '0'
                        )}
                      </td>

                      {/* Platinum */}
                      <td className='border-r border-(--border) bg-amber-50/20 px-1 py-3 font-bold text-(--text-primary) dark:bg-amber-950/10'>
                        {ttr.platinum.all > 0 ? (
                          <button
                            onClick={() =>
                              handleOpenDrillDown(
                                b.code as PriorityBranchCode,
                                'reguler',
                                `${b.name} - Platinum All`,
                                'platinum',
                              )
                            }
                            className='text-amber-600 hover:underline dark:text-amber-400'
                          >
                            {ttr.platinum.all}
                          </button>
                        ) : (
                          '0'
                        )}
                      </td>
                      <td className='border-r border-(--border) bg-emerald-50/20 px-1 py-3 font-bold text-emerald-600 dark:bg-emerald-950/10 dark:text-emerald-400'>
                        {ttr.platinum.within > 0 ? (
                          <button
                            onClick={() =>
                              handleOpenDrillDown(
                                b.code as PriorityBranchCode,
                                'reguler',
                                `${b.name} - Platinum Kritis (<6h)`,
                                'platinum',
                                'within',
                              )
                            }
                            className='text-emerald-700 hover:underline dark:text-emerald-300'
                          >
                            {ttr.platinum.within}
                          </button>
                        ) : (
                          '0'
                        )}
                      </td>
                      <td className='border-r-2 border-blue-500/40 bg-red-50/20 px-1 py-3 font-bold text-red-600 dark:bg-red-950/10 dark:text-red-400'>
                        {ttr.platinum.over > 0 ? (
                          <button
                            onClick={() =>
                              handleOpenDrillDown(
                                b.code as PriorityBranchCode,
                                'reguler',
                                `${b.name} - Platinum Terlewat (>6h)`,
                                'platinum',
                                'over',
                              )
                            }
                            className='text-red-700 hover:underline dark:text-red-300'
                          >
                            {ttr.platinum.over}
                          </button>
                        ) : (
                          '0'
                        )}
                      </td>

                      {/* Manja */}
                      <td className='border-r border-(--border) bg-amber-50/20 px-1 py-3 font-bold text-(--text-primary) dark:bg-amber-950/10'>
                        {ttr.manja.all > 0 ? (
                          <button
                            onClick={() =>
                              handleOpenDrillDown(
                                b.code as PriorityBranchCode,
                                'reguler',
                                `${b.name} - Manja All`,
                                'manja',
                              )
                            }
                            className='text-amber-600 hover:underline dark:text-amber-400'
                          >
                            {ttr.manja.all}
                          </button>
                        ) : (
                          '0'
                        )}
                      </td>
                      <td className='border-r border-(--border) bg-emerald-50/20 px-1 py-3 font-bold text-emerald-600 dark:bg-emerald-950/10 dark:text-emerald-400'>
                        {ttr.manja.within > 0 ? (
                          <button
                            onClick={() =>
                              handleOpenDrillDown(
                                b.code as PriorityBranchCode,
                                'reguler',
                                `${b.name} - Manja Kritis (<3h)`,
                                'manja',
                                'within',
                              )
                            }
                            className='text-emerald-700 hover:underline dark:text-emerald-300'
                          >
                            {ttr.manja.within}
                          </button>
                        ) : (
                          '0'
                        )}
                      </td>
                      <td className='border-r-2 border-blue-500/40 bg-red-50/20 px-1 py-3 font-bold text-red-600 dark:bg-red-950/10 dark:text-red-400'>
                        {ttr.manja.over > 0 ? (
                          <button
                            onClick={() =>
                              handleOpenDrillDown(
                                b.code as PriorityBranchCode,
                                'reguler',
                                `${b.name} - Manja Terlewat (>3h)`,
                                'manja',
                                'over',
                              )
                            }
                            className='text-red-700 hover:underline dark:text-red-300'
                          >
                            {ttr.manja.over}
                          </button>
                        ) : (
                          '0'
                        )}
                      </td>

                      {/* Reguler */}
                      <td className='border-r border-(--border) bg-amber-50/20 px-1 py-3 font-bold text-(--text-primary) dark:bg-amber-950/10'>
                        {ttr.reguler.all > 0 ? (
                          <button
                            onClick={() =>
                              handleOpenDrillDown(
                                b.code as PriorityBranchCode,
                                'reguler',
                                `${b.name} - Reguler All`,
                                'reguler',
                              )
                            }
                            className='text-amber-600 hover:underline dark:text-amber-400'
                          >
                            {ttr.reguler.all}
                          </button>
                        ) : (
                          '0'
                        )}
                      </td>
                      <td className='border-r border-(--border) bg-emerald-50/20 px-1 py-3 font-bold text-emerald-600 dark:bg-emerald-950/10 dark:text-emerald-400'>
                        {ttr.reguler.within > 0 ? (
                          <button
                            onClick={() =>
                              handleOpenDrillDown(
                                b.code as PriorityBranchCode,
                                'reguler',
                                `${b.name} - Reguler Kritis (<36h)`,
                                'reguler',
                                'within',
                              )
                            }
                            className='text-emerald-700 hover:underline dark:text-emerald-300'
                          >
                            {ttr.reguler.within}
                          </button>
                        ) : (
                          '0'
                        )}
                      </td>
                      <td className='bg-red-50/20 px-1 py-3 font-bold text-red-600 dark:bg-red-950/10 dark:text-red-400'>
                        {ttr.reguler.over > 0 ? (
                          <button
                            onClick={() =>
                              handleOpenDrillDown(
                                b.code as PriorityBranchCode,
                                'reguler',
                                `${b.name} - Reguler Terlewat (>36h)`,
                                'reguler',
                                'over',
                              )
                            }
                            className='text-red-700 hover:underline dark:text-red-300'
                          >
                            {ttr.reguler.over}
                          </button>
                        ) : (
                          '0'
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* 3.5 Seksi 4 — TIKET SQM & UNDERSPEC OPEN */}
        <div className='space-y-3 pb-8'>
          <div className='bg-surface flex items-center justify-between rounded border border-(--border) px-4 py-2.5 shadow-sm'>
            <div className='flex items-center gap-2 text-xs font-bold tracking-wider text-(--text-primary) uppercase'>
              <AlertTriangle className='h-4 w-4 text-amber-500' />
              TIKET SQM & UNDERSPEC OPEN
            </div>
          </div>

          <div className='bg-surface overflow-x-auto rounded border border-(--border) shadow-sm'>
            <table className='w-full border-collapse text-left text-xs'>
              <thead className='bg-bg border-b border-(--border) text-center text-[10px] font-bold tracking-wider text-(--text-secondary)'>
                <tr>
                  <th
                    rowSpan={2}
                    className='w-36 border-r border-(--border) px-4 py-3 text-left align-middle'
                  >
                    BRANCH
                  </th>
                  <th
                    colSpan={2}
                    className='bg-bg/40 border-r border-(--border) px-2 py-2'
                  >
                    TIKET SQM
                  </th>
                  <th colSpan={2} className='bg-bg/40 px-2 py-2'>
                    TIKET/SALDO UNDERSPEC
                  </th>
                </tr>
                <tr className='border-b border-(--border) text-[9px]'>
                  <th className='border-r border-(--border) bg-amber-50/50 px-2 py-2 font-semibold text-amber-700 dark:bg-amber-950/20 dark:text-amber-400'>
                    POTENSI GANGGUAN
                  </th>
                  <th className='border-r border-(--border) bg-red-50/50 px-2 py-2 font-semibold text-red-700 dark:bg-red-950/20 dark:text-red-400'>
                    POTENSI GAUL
                  </th>
                  <th className='border-r border-(--border) bg-amber-50/50 px-2 py-2 font-semibold text-amber-700 dark:bg-amber-950/20 dark:text-amber-400'>
                    POTENSI GANGGUAN
                  </th>
                  <th className='bg-red-50/50 px-2 py-2 font-semibold text-red-700 dark:bg-red-950/20 dark:text-red-400'>
                    POTENSI GAUL
                  </th>
                </tr>
              </thead>
              <tbody className='divide-y divide-(--border)'>
                {BRANCH_LIST.map((b) => {
                  const br = branchDataMap[b.code as PriorityBranchCode];
                  const sqmUnder = br?.sqm_underspec || {
                    sqm_disruption: 0,
                    sqm_gaul: 0,
                    underspec_disruption: 0,
                    underspec_gaul: 0,
                  };

                  return (
                    <tr
                      key={b.code}
                      className='hover:bg-surface-2 text-center transition-colors'
                    >
                      <td className='border-r border-(--border) px-4 py-3 text-left font-bold text-(--text-primary)'>
                        {b.name}
                      </td>

                      {/* SQM Disruption */}
                      <td className='border-r border-(--border) bg-amber-50/20 px-2 py-3 font-bold text-amber-600 dark:bg-amber-950/10 dark:text-amber-400'>
                        {sqmUnder.sqm_disruption > 0 ? (
                          <button
                            onClick={() =>
                              handleOpenDrillDown(
                                b.code as PriorityBranchCode,
                                'sqm',
                                `${b.name} - SQM Potensi Gangguan`,
                                undefined,
                                undefined,
                                'disruption',
                              )
                            }
                            className='text-amber-700 hover:underline dark:text-amber-300'
                          >
                            {sqmUnder.sqm_disruption}
                          </button>
                        ) : (
                          '0'
                        )}
                      </td>

                      {/* SQM Gaul */}
                      <td className='border-r border-(--border) bg-red-50/20 px-2 py-3 font-bold text-red-600 dark:bg-red-950/10 dark:text-red-400'>
                        {sqmUnder.sqm_gaul > 0 ? (
                          <button
                            onClick={() =>
                              handleOpenDrillDown(
                                b.code as PriorityBranchCode,
                                'sqm',
                                `${b.name} - SQM Potensi Gaul`,
                                undefined,
                                undefined,
                                'gaul',
                              )
                            }
                            className='text-red-700 hover:underline dark:text-red-300'
                          >
                            {sqmUnder.sqm_gaul}
                          </button>
                        ) : (
                          '0'
                        )}
                      </td>

                      {/* Underspec Disruption */}
                      <td className='border-r border-(--border) bg-amber-50/20 px-2 py-3 font-bold text-amber-600 dark:bg-amber-950/10 dark:text-amber-400'>
                        {sqmUnder.underspec_disruption > 0 ? (
                          <button
                            onClick={() =>
                              handleOpenDrillDown(
                                b.code as PriorityBranchCode,
                                'underspec',
                                `${b.name} - Underspec Potensi Gangguan`,
                                undefined,
                                undefined,
                                'disruption',
                              )
                            }
                            className='text-amber-700 hover:underline dark:text-amber-300'
                          >
                            {sqmUnder.underspec_disruption}
                          </button>
                        ) : (
                          '0'
                        )}
                      </td>

                      {/* Underspec Gaul */}
                      <td className='bg-red-50/20 px-2 py-3 font-bold text-red-600 dark:bg-red-950/10 dark:text-red-400'>
                        {sqmUnder.underspec_gaul > 0 ? (
                          <button
                            onClick={() =>
                              handleOpenDrillDown(
                                b.code as PriorityBranchCode,
                                'underspec',
                                `${b.name} - Underspec Potensi Gaul`,
                                undefined,
                                undefined,
                                'gaul',
                              )
                            }
                            className='text-red-700 hover:underline dark:text-red-300'
                          >
                            {sqmUnder.underspec_gaul}
                          </button>
                        ) : (
                          '0'
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Drill Down Modal */}
        {drillDown.open && (
          <div className='fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm'>
            <div className='bg-surface flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded border border-(--border) text-(--text-primary) shadow-2xl'>
              <div className='bg-bg flex items-center justify-between border-b border-(--border) p-4'>
                <div>
                  <h3 className='flex items-center gap-2 font-bold text-(--text-primary)'>
                    <Eye className='h-4 w-4 text-blue-500' />
                    {drillDown.label}
                  </h3>
                  <p className='mt-0.5 text-[10px] font-semibold tracking-widest text-(--text-secondary) uppercase'>
                    Daftar Tiket Detail
                  </p>
                </div>
                <button
                  onClick={() => setDrillDown({ ...drillDown, open: false })}
                  className='hover:bg-surface-2 rounded-full p-2 text-(--text-secondary) transition-colors hover:text-(--text-primary)'
                >
                  <X className='h-5 w-5' />
                </button>
              </div>

              <div className='bg-surface flex flex-wrap items-center gap-4 border-b border-(--border) p-4'>
                <div className='relative min-w-[200px] flex-1'>
                  <Search className='absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-(--text-muted)' />
                  <input
                    type='text'
                    placeholder='Cari incident, srv_no, atau nama pelanggan...'
                    className='bg-bg w-full rounded border border-(--border) py-2 pr-4 pl-10 text-sm text-(--text-primary) transition-all outline-none focus:ring-2 focus:ring-blue-500'
                    value={ticketSearch}
                    onChange={(e) => {
                      setTicketSearch(e.target.value);
                      setPage(1);
                    }}
                  />
                </div>
                <Button
                  variant='outline'
                  size='sm'
                  onClick={handleExportTickets}
                  className='bg-bg hover:bg-surface-2 border-(--border) text-(--text-secondary) hover:text-(--text-primary)'
                >
                  <Download className='mr-2 h-4 w-4' />
                  Export CSV
                </Button>
              </div>

              <div className='flex-1 overflow-auto p-4'>
                {ticketsLoading ? (
                  <div className='flex h-64 flex-col items-center justify-center gap-3 text-(--text-secondary)'>
                    <Loader2 className='h-8 w-8 animate-spin text-blue-500' />
                    <span className='text-sm font-medium'>
                      Memuat data tiket...
                    </span>
                  </div>
                ) : (
                  <div className='overflow-x-auto rounded border border-(--border)'>
                    <table className='w-full min-w-[1500px] text-left text-xs'>
                      <thead className='bg-bg sticky top-0 border-b border-(--border) font-bold text-(--text-secondary)'>
                        <tr>
                          <th className='px-4 py-3'>Incident</th>
                          <th className='px-4 py-3'>Service No</th>
                          <th className='px-4 py-3'>Jenis Tiket</th>
                          <th className='px-4 py-3'>Customer</th>
                          <th className='px-4 py-3'>Workzone</th>
                          <th className='px-4 py-3'>Jenis Pelanggan</th>
                          <th className='px-4 py-3'>Status</th>
                          <th className='px-4 py-3'>Reported At</th>
                          <th className='px-4 py-3'>Bucket</th>
                          <th className='px-4 py-3'>Max TTR</th>
                          <th className='px-4 py-3'>Booking Date</th>
                          <th className='px-4 py-3'>Sisa TTR</th>
                          <th className='px-4 py-3'>TTR State</th>
                        </tr>
                      </thead>
                      <tbody className='divide-y divide-(--border)'>
                        {ticketsData?.data?.rows?.length === 0 ? (
                          <tr>
                            <td
                              colSpan={13}
                              className='px-4 py-8 text-center text-(--text-muted) italic'
                            >
                              Tidak ada tiket ditemukan.
                            </td>
                          </tr>
                        ) : (
                          ticketsData?.data?.rows?.map((row: any) => (
                            <tr
                              key={row.id_ticket}
                              className='hover:bg-bg/50 transition-colors'
                            >
                              <td className='px-4 py-3 font-bold text-(--text-primary)'>
                                {row.incident}
                              </td>
                              <td className='px-4 py-3 font-mono text-(--text-secondary)'>
                                {row.service_no}
                              </td>
                              <td className='px-4 py-3 text-xs font-medium text-(--text-primary)'>
                                {row.jenis_tiket_2 || '-'}
                              </td>
                              <td className='max-w-[150px] truncate px-4 py-3 text-(--text-secondary)'>
                                {row.customer_name}
                              </td>
                              <td className='px-4 py-3 text-(--text-secondary)'>
                                {row.workzone}
                              </td>
                              <td className='px-4 py-3 text-xs font-medium text-(--text-primary)'>
                                {row.customer_type || '-'}
                              </td>
                              <td className='px-4 py-3'>
                                <span className='bg-bg rounded-full border border-(--border) px-2 py-0.5 text-[10px] font-semibold text-(--text-secondary) uppercase'>
                                  {row.status || 'N/A'}
                                </span>
                              </td>
                              <td className='px-4 py-3 text-(--text-secondary)'>
                                {row.reported_date_dt
                                  ? new Date(
                                      row.reported_date_dt,
                                    ).toLocaleString('id-ID')
                                  : '-'}
                              </td>
                              <td className='px-4 py-3 font-medium text-(--text-primary)'>
                                {row.evidence?.bucket || '-'}
                              </td>
                              <td className='px-4 py-3 text-(--text-secondary)'>
                                {row.evidence?.max_ttr_deadline
                                  ? new Date(
                                      row.evidence.max_ttr_deadline,
                                    ).toLocaleString('id-ID')
                                  : '-'}
                              </td>
                              <td className='px-4 py-3 text-(--text-secondary)'>
                                {row.evidence?.manja_deadline_info
                                  ? new Date(
                                      row.evidence.manja_deadline_info,
                                    ).toLocaleString('id-ID')
                                  : '-'}
                              </td>
                              <td className='px-4 py-3 font-mono text-(--text-secondary)'>
                                {row.evidence?.remaining_ms !== undefined &&
                                row.evidence?.remaining_ms !== null
                                  ? formatRemaining(row.evidence.remaining_ms)
                                  : '-'}
                              </td>
                              <td className='px-4 py-3'>
                                <span
                                  className={cn(
                                    'rounded-full px-2 py-0.5 text-[10px] font-bold uppercase',
                                    row.evidence?.ttr_state === 'over'
                                      ? 'border border-red-100 bg-red-50 text-red-600 dark:border-red-900 dark:bg-red-950/40 dark:text-red-400'
                                      : row.evidence?.ttr_state === 'near'
                                        ? 'border border-amber-100 bg-amber-50 text-amber-600 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-400'
                                        : 'border border-emerald-100 bg-emerald-50 text-emerald-600 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-400',
                                  )}
                                >
                                  {row.evidence?.ttr_state_label ||
                                    row.evidence?.ttr_state ||
                                    '-'}
                                </span>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className='bg-bg flex items-center justify-between border-t border-(--border) p-4'>
                <span className='text-[11px] font-medium text-(--text-secondary)'>
                  Showing {ticketsData?.data?.rows?.length ?? 0} of{' '}
                  {ticketsData?.data?.meta?.total ?? 0} tickets
                </span>
                <div className='flex gap-2'>
                  <Button
                    variant='outline'
                    size='sm'
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                    className='bg-bg hover:bg-surface-2 border-(--border) text-(--text-secondary)'
                  >
                    Prev
                  </Button>
                  <Button
                    variant='outline'
                    size='sm'
                    disabled={!ticketsData?.data?.meta?.has_more}
                    onClick={() => setPage((p) => p + 1)}
                    className='bg-bg hover:bg-surface-2 border-(--border) text-(--text-secondary)'
                  >
                    Next
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}

function formatRemaining(ms: number): string {
  if (ms <= 0) return 'OVER';
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  if (hours > 0) return `${hours}j ${minutes}m`;
  return `${minutes}m`;
}
