'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { ChevronUp, ChevronDown, ArrowUpDown } from 'lucide-react';
import { Technician } from '@/app/types/technician';

type SortField = 'nama' | 'assigned' | 'on_progress' | 'pending' | 'closed' | 'total' | 'status';
type SortOrder = 'asc' | 'desc';

interface TechnicianSummaryTableProps {
  technicians: Technician[];
  onFilterByTech?: (techId: number, filterType?: 'assigned' | 'on_progress' | 'pending') => void;
  onScrollToTech?: (techId: number) => void;
}

const STATUS_STYLES = {
  IDLE: {
    badge: 'bg-gray-100 text-gray-600 dark:bg-gray-700/50 dark:text-gray-300',
    dot: '',
  },
  AKTIF: {
    badge: 'bg-blue-100 text-blue-600 dark:bg-blue-500/20 dark:text-blue-300',
    dot: '',
  },
  OVERLOAD: {
    badge: 'bg-red-100 text-red-600 dark:bg-red-500/20 dark:text-red-300',
    dot: '🔴',
  },
};

function getStatusLabel(total: number): 'IDLE' | 'AKTIF' | 'OVERLOAD' {
  if (total === 0) return 'IDLE';
  if (total > 5) return 'OVERLOAD';
  return 'AKTIF';
}

const HEADER_CONFIG = [
  { key: 'nama', label: 'Nama Teknisi', align: 'left' as const },
  { key: 'assigned', label: 'Assigned', align: 'center' as const },
  { key: 'on_progress', label: 'Dikerjakan', align: 'center' as const },
  { key: 'pending', label: 'Pending', align: 'center' as const },
  { key: 'closed', label: 'Closed H-Ini', align: 'center' as const },
  { key: 'total', label: 'Total', align: 'center' as const },
  { key: 'status', label: 'Status', align: 'center' as const },
];

export default function TechnicianSummaryTable({
  technicians,
  onFilterByTech,
  onScrollToTech,
}: TechnicianSummaryTableProps) {
  const [sortField, setSortField] = useState<SortField>('nama');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');

  const sorted = useMemo(() => {
    return [...technicians].sort((a, b) => {
      let aVal: number | string = 0;
      let bVal: number | string = 0;

      const aAssigned = a.order_counts?.assigned ?? 0;
      const aOnProgress = a.order_counts?.on_progress ?? 0;
      const aPending = a.order_counts?.pending ?? 0;
      const aClosed = a.total_closed_today ?? 0;
      const aTotal = aAssigned + aOnProgress + aPending;

      const bAssigned = b.order_counts?.assigned ?? 0;
      const bOnProgress = b.order_counts?.on_progress ?? 0;
      const bPending = b.order_counts?.pending ?? 0;
      const bClosed = b.total_closed_today ?? 0;
      const bTotal = bAssigned + bOnProgress + bPending;

      switch (sortField) {
        case 'nama':
          aVal = (a.nama ?? '').toLowerCase();
          bVal = (b.nama ?? '').toLowerCase();
          break;
        case 'assigned':
          aVal = aAssigned;
          bVal = bAssigned;
          break;
        case 'on_progress':
          aVal = aOnProgress;
          bVal = bOnProgress;
          break;
        case 'pending':
          aVal = aPending;
          bVal = bPending;
          break;
        case 'closed':
          aVal = aClosed;
          bVal = bClosed;
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

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) {
      return <ArrowUpDown className='h-3 w-3 opacity-40' />;
    }
    return sortOrder === 'asc' ? (
      <ChevronUp className='h-3 w-3' />
    ) : (
      <ChevronDown className='h-3 w-3' />
    );
  };

  return (
    <div className='mt-4 overflow-x-auto'>
      <table className='w-full text-sm'>
        <thead>
          <tr className='border-b border-slate-200 dark:border-slate-700'>
            {HEADER_CONFIG.map((h) => (
              <th
                key={h.key}
                onClick={() => handleSort(h.key as SortField)}
                className={`cursor-pointer px-3 py-2.5 text-[11px] font-semibold tracking-wide text-slate-500 uppercase transition-colors hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800 ${h.align === 'left' ? 'text-left' : 'text-center'}`}
              >
                <div className={`flex items-center gap-1 ${h.align === 'left' ? 'justify-start' : 'justify-center'}`}>
                  {h.label}
                  <SortIcon field={h.key as SortField} />
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className='divide-y divide-slate-100 dark:divide-slate-700/50'>
          {sorted.map((tech) => {
            const assigned = tech.order_counts?.assigned ?? 0;
            const onProgress = tech.order_counts?.on_progress ?? 0;
            const pending = tech.order_counts?.pending ?? 0;
            const closed = tech.total_closed_today ?? 0;
            const total = assigned + onProgress + pending;
            const status = getStatusLabel(total);
            const statusStyle = STATUS_STYLES[status];

            return (
              <tr
                key={tech.id_user}
                className='group transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50'
              >
                {/* Nama + Workzone */}
                <td className='px-3 py-2.5'>
                  <Link
                    href={`/admin/technicians/${tech.id_user}`}
                    className='block'
                  >
                    <p className='font-medium text-slate-800 dark:text-slate-100 hover:text-blue-600 dark:hover:text-blue-400'>
                      {tech.nama}
                    </p>
                    <p className='text-xs text-slate-400 dark:text-slate-500'>
                      {tech.workzone}
                    </p>
                  </Link>
                </td>

                {/* Assigned */}
                <td className='px-3 py-2.5 text-center'>
                  <button
                    type='button'
                    onClick={() => {
                      onFilterByTech?.(tech.id_user, 'assigned');
                      onScrollToTech?.(tech.id_user);
                    }}
                    className={`rounded px-2 py-0.5 text-xs font-semibold transition-colors hover:bg-blue-100 dark:hover:bg-blue-500/30 ${
                      assigned > 0
                        ? 'text-blue-600 dark:text-blue-400'
                        : 'text-slate-400 dark:text-slate-500'
                    }`}
                  >
                    {assigned}
                  </button>
                </td>

                {/* Dikerjakan */}
                <td className='px-3 py-2.5 text-center'>
                  <button
                    type='button'
                    onClick={() => {
                      onFilterByTech?.(tech.id_user, 'on_progress');
                      onScrollToTech?.(tech.id_user);
                    }}
                    className={`rounded px-2 py-0.5 text-xs font-semibold transition-colors hover:bg-amber-100 dark:hover:bg-amber-500/30 ${
                      onProgress > 0
                        ? 'text-amber-600 dark:text-amber-400'
                        : 'text-slate-400 dark:text-slate-500'
                    }`}
                  >
                    {onProgress}
                  </button>
                </td>

                {/* Pending */}
                <td className='px-3 py-2.5 text-center'>
                  <button
                    type='button'
                    onClick={() => {
                      onFilterByTech?.(tech.id_user, 'pending');
                      onScrollToTech?.(tech.id_user);
                    }}
                    className={`rounded px-2 py-0.5 text-xs font-semibold transition-colors hover:bg-orange-100 dark:hover:bg-orange-500/30 ${
                      pending > 0
                        ? 'text-orange-600 dark:text-orange-400'
                        : 'text-slate-400 dark:text-slate-500'
                    }`}
                  >
                    {pending}
                  </button>
                </td>

                {/* Closed */}
                <td className='px-3 py-2.5 text-center'>
                  <span className='rounded px-2 py-0.5 text-xs font-semibold text-green-600 dark:text-green-400'>
                    {closed}
                  </span>
                </td>

                {/* Total */}
                <td className='px-3 py-2.5 text-center'>
                  <span className='rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600 dark:bg-slate-700 dark:text-slate-300'>
                    {total}
                  </span>
                </td>

                {/* Status */}
                <td className='px-3 py-2.5 text-center'>
                  <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${statusStyle.badge}`}>
                    {status === 'OVERLOAD' && (
                      <span className='relative flex h-1.5 w-1.5'>
                        <span className='absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75' />
                        <span className='relative inline-flex h-1.5 w-1.5 rounded-full bg-red-500' />
                      </span>
                    )}
                    {status}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {sorted.length === 0 && (
        <div className='py-8 text-center text-sm text-slate-400 dark:text-slate-500'>
          Tidak ada teknisi ditemukan
        </div>
      )}
    </div>
  );
}