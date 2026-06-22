'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowUpDown, ChevronDown, ChevronUp } from 'lucide-react';
import { Technician, TechnicianTicket } from '@/app/types/technician';

type SortField = 'nama' | 'total' | 'status';
type SortOrder = 'asc' | 'desc';

type BucketKey =
  | 'kpi_customer'
  | 'kpi_proactive'
  | 'non_kpi_unspec'
  | 'non_technical'
  | 'sqm_update'
  | 'obsolete';

type BucketStatusKey = 'assigned' | 'on_progress' | 'pending' | 'closed';

type BucketStatusCounts = Record<BucketStatusKey, number>;

type BucketJenisItem = {
  key: string;
  label: string;
  count: number;
};

type BucketGroup = {
  key: BucketKey;
  label: string;
  counts: BucketStatusCounts;
  jenis: BucketJenisItem[];
};

interface TechnicianSummaryTableProps {
  technicians: Technician[];
  onFilterByTech?: (
    techId: number,
    filterType?: 'assigned' | 'on_progress' | 'pending',
  ) => void;
  onScrollToTech?: (techId: number) => void;
}

const BUCKET_COLUMNS: Array<{ key: BucketKey; label: string }> = [
  { key: 'kpi_customer', label: 'Cust' },
  { key: 'kpi_proactive', label: 'ProAct' },
  { key: 'non_kpi_unspec', label: 'Unspec' },
  { key: 'non_technical', label: 'NonTech' },
  { key: 'sqm_update', label: 'SQM-UPD' },
  { key: 'obsolete', label: 'Obs' },
];

const BUCKET_STYLES: Record<
  BucketKey,
  { border: string; bg: string; chip: string; text: string }
> = {
  kpi_customer: {
    border: 'border-blue-200 dark:border-blue-500/30',
    bg: 'bg-blue-50/70 dark:bg-blue-500/10',
    chip: 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-200',
    text: 'text-blue-700 dark:text-blue-300',
  },
  kpi_proactive: {
    border: 'border-amber-200 dark:border-amber-500/30',
    bg: 'bg-amber-50/70 dark:bg-amber-500/10',
    chip: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-200',
    text: 'text-amber-700 dark:text-amber-300',
  },
  non_kpi_unspec: {
    border: 'border-slate-200 dark:border-slate-700',
    bg: 'bg-slate-50/70 dark:bg-slate-800/50',
    chip: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200',
    text: 'text-slate-700 dark:text-slate-300',
  },
  non_technical: {
    border: 'border-rose-200 dark:border-rose-500/30',
    bg: 'bg-rose-50/70 dark:bg-rose-500/10',
    chip: 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-200',
    text: 'text-rose-700 dark:text-rose-300',
  },
  sqm_update: {
    border: 'border-violet-200 dark:border-violet-500/30',
    bg: 'bg-violet-50/70 dark:bg-violet-500/10',
    chip: 'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-200',
    text: 'text-violet-700 dark:text-violet-300',
  },
  obsolete: {
    border: 'border-zinc-200 dark:border-zinc-700',
    bg: 'bg-zinc-50/70 dark:bg-zinc-800/60',
    chip: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200',
    text: 'text-zinc-700 dark:text-zinc-300',
  },
};

const STATUS_STYLE = {
  IDLE: 'bg-gray-100 text-gray-600 dark:bg-gray-700/50 dark:text-gray-300',
  AKTIF: 'bg-blue-100 text-blue-600 dark:bg-blue-500/20 dark:text-blue-300',
  OVERLOAD: 'bg-red-100 text-red-600 dark:bg-red-500/20 dark:text-red-300',
};

function getStatusLabel(total: number): 'IDLE' | 'AKTIF' | 'OVERLOAD' {
  if (total === 0) return 'IDLE';
  if (total > 5) return 'OVERLOAD';
  return 'AKTIF';
}

function normalizeJenisKey(raw: string | undefined | null): string {
  if (!raw) return 'unknown';
  const normalized = raw.toLowerCase().trim().replace(/[\s_]/g, '-');
  if (
    ['reg', 'reguler', 'regular'].includes(normalized) ||
    normalized.includes('reguler') ||
    normalized.includes('regular')
  ) {
    return 'reguler';
  }
  if (normalized.includes('sqm-ccan')) return 'sqm-ccan';
  if (normalized.includes('sqm')) return 'sqm';
  if (normalized.includes('hvc')) return 'hvc';
  if (normalized.includes('unspec')) return 'unspec';
  if (normalized.includes('indibiz')) return 'indibiz';
  if (normalized.includes('datin')) return 'datin';
  if (normalized.includes('reseller')) return 'reseller';
  if (normalized.includes('wifi-id') || normalized.includes('wifiid'))
    return 'wifi-id';
  if (normalized.includes('unknown')) return 'unknown';
  return normalized;
}

function formatJenisLabel(raw: string | undefined | null): string {
  const key = normalizeJenisKey(raw);
  const labels: Record<string, string> = {
    reguler: 'Reguler',
    sqm: 'SQM',
    'sqm-ccan': 'SQM-CCAN',
    hvc: 'HVC',
    unspec: 'Unspec',
    indibiz: 'Indibiz',
    datin: 'Datin',
    reseller: 'Reseller',
    'wifi-id': 'WiFi-ID',
    unknown: 'Unknown',
  };
  return labels[key] ?? (raw?.trim() || 'Unknown');
}

function getBucketKey(ticket: TechnicianTicket): BucketKey {
  return (ticket.operationalBucket as BucketKey | undefined) ?? 'non_technical';
}

function emptyBucketGroup(key: BucketKey): BucketGroup {
  const label = BUCKET_COLUMNS.find((item) => item.key === key)?.label ?? 'Unk';
  return {
    key,
    label,
    counts: { assigned: 0, on_progress: 0, pending: 0, closed: 0 },
    jenis: [],
  };
}

function groupTicketsByBucket(
  assignedTickets: TechnicianTicket[],
  closedTickets: TechnicianTicket[] = [],
): Record<BucketKey, BucketGroup> {
  const initial = Object.fromEntries(
    BUCKET_COLUMNS.map((item) => [item.key, emptyBucketGroup(item.key)]),
  ) as Record<BucketKey, BucketGroup>;

  const pushJenis = (bucket: BucketGroup, ticket: TechnicianTicket) => {
    const jenisKey = normalizeJenisKey(
      ticket.jenisTiket1 ?? ticket.jenisTiket ?? null,
    );
    const jenisLabel = formatJenisLabel(
      ticket.jenisTiket1 ?? ticket.jenisTiket ?? null,
    );
    const existing = bucket.jenis.find((item) => item.key === jenisKey);
    if (existing) existing.count += 1;
    else bucket.jenis.push({ key: jenisKey, label: jenisLabel, count: 1 });
  };

  for (const ticket of assignedTickets) {
    const bucket = initial[getBucketKey(ticket)];
    const status = String(ticket.statusUpdate ?? '').toLowerCase();
    if (status === 'on_progress') bucket.counts.on_progress += 1;
    else if (status === 'pending') bucket.counts.pending += 1;
    else bucket.counts.assigned += 1;
    pushJenis(bucket, ticket);
  }

  for (const ticket of closedTickets) {
    const bucket = initial[getBucketKey(ticket)];
    bucket.counts.closed += 1;
    pushJenis(bucket, ticket);
  }

  return initial;
}

function getVisibleTotal(tech: Technician): number {
  return (
    (tech.order_counts?.assigned ?? 0) +
    (tech.order_counts?.on_progress ?? 0) +
    (tech.order_counts?.pending ?? 0)
  );
}

export default function TechnicianSummaryTable({
  technicians,
  onFilterByTech,
  onScrollToTech,
}: TechnicianSummaryTableProps) {
  const [sortField, setSortField] = useState<SortField>('nama');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
  const [showIdleTechnicians, setShowIdleTechnicians] = useState(false);

  const sorted = useMemo(() => {
    return [...technicians].sort((a, b) => {
      const aTotal = getVisibleTotal(a);
      const bTotal = getVisibleTotal(b);

      let aVal: number | string = 0;
      let bVal: number | string = 0;

      switch (sortField) {
        case 'nama':
          aVal = (a.nama ?? '').toLowerCase();
          bVal = (b.nama ?? '').toLowerCase();
          break;
        case 'total':
          aVal = aTotal;
          bVal = bTotal;
          break;
        case 'status':
          aVal = getStatusLabel(aTotal);
          bVal = getStatusLabel(bTotal);
          break;
      }

      if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
  }, [technicians, sortField, sortOrder]);

  const visibleTechnicians = useMemo(() => {
    if (showIdleTechnicians) return sorted;
    return sorted.filter((tech) => getVisibleTotal(tech) > 0);
  }, [sorted, showIdleTechnicians]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field)
      return <ArrowUpDown className='h-3 w-3 opacity-40' />;
    return sortOrder === 'asc' ? (
      <ChevronUp className='h-3 w-3' />
    ) : (
      <ChevronDown className='h-3 w-3' />
    );
  };

  const bucketStatusLabels: Array<{
    key: BucketStatusKey;
    label: string;
    title: string;
  }> = [
    { key: 'assigned', label: 'A', title: 'Assigned' },
    { key: 'on_progress', label: 'D', title: 'Dikerjakan' },
    { key: 'pending', label: 'P', title: 'Pending' },
    { key: 'closed', label: 'C', title: 'Closed H-Ini' },
  ];

  return (
    <div className='mt-3'>
      <div className='mb-2.5 flex flex-wrap items-center justify-between gap-2'>
        <p className='text-[11px] text-slate-500 dark:text-slate-400'>
          Keterangan, A = Assigned, D = Dikerjakan, P = Pending, C = Closed
          H-Ini
        </p>
        <button
          type='button'
          onClick={() => setShowIdleTechnicians((value) => !value)}
          className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
            showIdleTechnicians
              ? 'border-blue-500 bg-blue-500 text-white'
              : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
          }`}
        >
          {showIdleTechnicians ? 'Sembunyikan Idle' : 'Tampilkan Idle'}
        </button>
      </div>

      <div className='overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-950/60'>
        <table className='w-full min-w-550 table-fixed text-[11px]'>
          <thead>
            <tr className='border-b-2 border-slate-200 dark:border-slate-700'>
              <th
                rowSpan={2}
                onClick={() => handleSort('nama')}
                className='sticky left-0 z-30 cursor-pointer border-r border-slate-200 bg-slate-50 px-2 py-2 text-left font-bold tracking-wide whitespace-nowrap text-slate-700 uppercase transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800'
              >
                <div className='flex items-center gap-1'>
                  Teknisi
                  <SortIcon field='nama' />
                </div>
              </th>
              {BUCKET_COLUMNS.map((bucket) => (
                <th
                  key={bucket.key}
                  colSpan={4}
                  className='border-x border-slate-200 px-0.5 py-1.5 text-center font-bold tracking-[0.16em] text-slate-700 uppercase dark:border-slate-700 dark:text-slate-200'
                >
                  <div
                    className={`rounded-md border px-1.5 py-0.5 shadow-sm ${BUCKET_STYLES[bucket.key].border} ${BUCKET_STYLES[bucket.key].bg}`}
                  >
                    <div
                      className={`text-[11px] font-bold tracking-wide ${BUCKET_STYLES[bucket.key].text}`}
                    >
                      {bucket.label}
                    </div>
                  </div>
                </th>
              ))}
              <th
                rowSpan={2}
                onClick={() => handleSort('total')}
                className='sticky right-21 z-30 cursor-pointer border-r border-l border-slate-200 bg-slate-50 px-2 py-2 text-center font-bold tracking-wide whitespace-nowrap text-slate-700 uppercase transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800'
              >
                <div className='flex items-center justify-center gap-1'>
                  Total
                  <SortIcon field='total' />
                </div>
              </th>
              <th
                rowSpan={2}
                onClick={() => handleSort('status')}
                className='sticky right-0 z-30 cursor-pointer border-l border-slate-200 bg-slate-50 px-2 py-2 text-center font-bold tracking-wide whitespace-nowrap text-slate-700 uppercase transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800'
              >
                <div className='flex items-center justify-center gap-1'>
                  Status
                  <SortIcon field='status' />
                </div>
              </th>
            </tr>
            <tr className='border-b-2 border-slate-200 dark:border-slate-700'>
              {BUCKET_COLUMNS.flatMap((bucket) =>
                bucketStatusLabels.map((status) => {
                  const style = BUCKET_STYLES[bucket.key];
                  return (
                    <th
                      key={`${bucket.key}-${status.key}`}
                      className='border border-slate-200 px-0.5 py-1 text-center font-bold tracking-wide whitespace-nowrap text-slate-700 uppercase dark:border-slate-700 dark:text-slate-200'
                      title={status.title}
                    >
                      <span
                        className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-bold ${style.border} ${style.bg} ${style.text}`}
                      >
                        {status.label}
                      </span>
                    </th>
                  );
                }),
              )}
            </tr>
          </thead>
          <tbody className='divide-y divide-slate-100 dark:divide-slate-700/50'>
            {visibleTechnicians.map((tech) => {
              const assigned = tech.order_counts?.assigned ?? 0;
              const onProgress = tech.order_counts?.on_progress ?? 0;
              const pending = tech.order_counts?.pending ?? 0;
              const closed = tech.total_closed_today ?? 0;
              const total = assigned + onProgress + pending;
              const status = getStatusLabel(total);
              const bucketGroups = groupTicketsByBucket(
                tech.assigned_tickets ?? [],
                tech.closed_tickets_today ?? [],
              );

              return (
                <tr
                  key={tech.id_user}
                  className='align-top transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50'
                >
                  <td className='sticky left-0 z-20 border-r border-slate-200 bg-white px-2 py-2 dark:border-slate-700 dark:bg-slate-900'>
                    <Link
                      href={`/admin/technicians/${tech.id_user}`}
                      className='block'
                    >
                      <p className='truncate font-semibold text-slate-900 hover:text-blue-700 dark:text-slate-50 dark:hover:text-blue-300'>
                        {tech.nama}
                      </p>
                    </Link>
                    <p className='truncate text-[10px] font-medium text-slate-500 dark:text-slate-400'>
                      {tech.workzone}
                    </p>
                  </td>

                  {BUCKET_COLUMNS.flatMap((bucket) => {
                    const group = bucketGroups[bucket.key];
                    const style = BUCKET_STYLES[bucket.key];
                    const cells: Array<{
                      key: BucketStatusKey;
                      value: number;
                      color: string;
                    }> = [
                      {
                        key: 'assigned',
                        value: group.counts.assigned,
                        color: 'text-blue-700 dark:text-blue-300',
                      },
                      {
                        key: 'on_progress',
                        value: group.counts.on_progress,
                        color: 'text-amber-700 dark:text-amber-300',
                      },
                      {
                        key: 'pending',
                        value: group.counts.pending,
                        color: 'text-orange-700 dark:text-orange-300',
                      },
                      {
                        key: 'closed',
                        value: group.counts.closed,
                        color: 'text-emerald-700 dark:text-emerald-300',
                      },
                    ];

                    return cells.map((cell) => (
                      <td
                        key={`${tech.id_user}-${bucket.key}-${cell.key}`}
                        className='border-r border-b border-slate-100 px-0.5 py-1 text-center dark:border-slate-800'
                      >
                        {cell.value > 0 ? (
                          <div
                            className={`rounded-md border px-1 py-0.5 shadow-sm ${style.border} ${style.bg}`}
                          >
                            <div
                              className={`text-[11px] font-bold ${cell.color}`}
                            >
                              {cell.value}
                            </div>
                            {group.jenis.length > 0 && (
                              <div className='mt-0.5 truncate text-[9px] leading-3 font-medium text-slate-600 dark:text-slate-300'>
                                {group.jenis
                                  .slice(0, 2)
                                  .map((item) => item.label)
                                  .join(' · ')}
                                {group.jenis.length > 2
                                  ? ` +${group.jenis.length - 2}`
                                  : ''}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className='rounded-md border border-dashed border-slate-200 px-0.5 py-0.5 text-[10px] font-medium text-slate-500 dark:border-slate-700 dark:text-slate-400'>
                            -
                          </div>
                        )}
                      </td>
                    ));
                  })}

                  <td className='sticky right-21 z-20 border-l border-slate-200 bg-white px-2 py-2 text-center dark:border-slate-700 dark:bg-slate-900'>
                    <span className='inline-flex min-w-8 items-center justify-center rounded-full bg-slate-200 px-1 py-0.5 text-[11px] font-bold text-slate-700 dark:bg-slate-700 dark:text-slate-100'>
                      {total}
                    </span>
                  </td>

                  <td className='sticky right-0 z-20 border-l border-slate-200 bg-white px-2 py-2 text-center dark:border-slate-700 dark:bg-slate-900'>
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold tracking-wide ${STATUS_STYLE[status]}`}
                    >
                      {status}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {visibleTechnicians.length === 0 && (
        <div className='py-8 text-center text-sm text-slate-400 dark:text-slate-500'>
          Tidak ada teknisi aktif ditemukan
        </div>
      )}
    </div>
  );
}
