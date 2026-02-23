'use client';

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { id } from 'date-fns/locale';
import {
  RefreshCw,
  Search,
  Users,
  Clock,
  AlertCircle,
  MapPin,
  Calendar,
  CheckCircle,
} from 'lucide-react';
import AdminLayout from '@/app/components/layout/AdminLayout';
import Button from '@/app/components/ui/Button';
import Select from '@/app/components/form/Select';
import { useTechnicianTickets } from '@/app/hooks/useTechnicianTickets';
import { TechnicianStatus, Technician } from '@/app/types/technician';

function stringToColor(str: string): string {
  const colors = [
    'bg-red-500',
    'bg-orange-500',
    'bg-amber-500',
    'bg-yellow-500',
    'bg-lime-500',
    'bg-green-500',
    'bg-emerald-500',
    'bg-teal-500',
    'bg-cyan-500',
    'bg-sky-500',
    'bg-blue-500',
    'bg-indigo-500',
    'bg-violet-500',
    'bg-purple-500',
    'bg-fuchsia-500',
    'bg-pink-500',
    'bg-rose-500',
  ];
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

const STATUS_CONFIG: Record<
  TechnicianStatus,
  { label: string; color: string; bg: string; border: string }
> = {
  IDLE: {
    label: 'Idle',
    color: 'text-gray-600',
    bg: 'bg-gray-50',
    border: 'border-gray-200',
  },
  AKTIF: {
    label: 'Aktif',
    color: 'text-blue-600',
    bg: 'bg-blue-50',
    border: 'border-blue-200',
  },
  OVERLOAD: {
    label: 'Overload',
    color: 'text-red-600',
    bg: 'bg-red-50',
    border: 'border-red-200',
  },
};

function getTechnicianStatusValue(ticketCount: number): TechnicianStatus {
  if (ticketCount === 0) return 'IDLE';
  if (ticketCount > 3) return 'OVERLOAD';
  return 'AKTIF';
}

function getAgeColor(hours: number): string {
  if (hours >= 24) return 'text-red-600';
  if (hours >= 8) return 'text-amber-600';
  return 'text-green-600';
}

function getAgeBgColor(hours: number): string {
  if (hours >= 24) return 'bg-red-100';
  if (hours >= 8) return 'bg-amber-100';
  return 'bg-green-100';
}

function getAgeBorderColor(hours: number): string {
  if (hours >= 24) return 'border-l-red-500';
  if (hours >= 8) return 'border-l-amber-500';
  return 'border-l-green-500';
}

function getWorstTicketAge(tickets: { ageHours: number }[]): number {
  if (tickets.length === 0) return 0;
  return Math.max(...tickets.map((t) => t.ageHours));
}

function SkeletonCard() {
  return (
    <div className='animate-pulse rounded-xl border border-slate-200 bg-white p-5'>
      <div className='flex items-center gap-3'>
        <div className='h-12 w-12 rounded-full bg-slate-200' />
        <div className='flex-1 space-y-2'>
          <div className='h-4 w-24 rounded bg-slate-200' />
          <div className='h-3 w-16 rounded bg-slate-200' />
        </div>
      </div>
      <div className='mt-4 space-y-2'>
        <div className='h-3 w-full rounded bg-slate-200' />
        <div className='h-3 w-3/4 rounded bg-slate-200' />
      </div>
      <div className='mt-4 h-8 w-full rounded bg-slate-200' />
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className='space-y-6'>
      <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4'>
        {[...Array(4)].map((_, i) => (
          <div
            key={i}
            className='animate-pulse rounded-xl border border-slate-200 bg-white p-6'
          >
            <div className='h-4 w-24 rounded bg-slate-200' />
            <div className='mt-2 h-8 w-12 rounded bg-slate-200' />
          </div>
        ))}
      </div>
      <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3'>
        {[...Array(6)].map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    </div>
  );
}

interface EmptyStateProps {
  hasFilters: boolean;
  onReset: () => void;
}

function EmptyState({ hasFilters, onReset }: EmptyStateProps) {
  return (
    <div className='flex flex-col items-center justify-center py-16 text-center'>
      <Users className='h-16 w-16 text-slate-300' />
      <h3 className='mt-4 text-lg font-medium text-slate-600'>
        {hasFilters
          ? 'Tidak ada teknisi ditemukan'
          : 'Belum ada teknisi di area ini'}
      </h3>
      <p className='mt-1 text-sm text-slate-400'>
        {hasFilters
          ? 'Coba ubah filter atau kata kunci pencarian'
          : 'Tidak ada teknisi yang ditugaskan di area kerja Anda'}
      </p>
      {hasFilters && (
        <Button onClick={onReset} className='mt-4'>
          Reset Filter
        </Button>
      )}
    </div>
  );
}

function TechnicianCard({ technician }: { technician: Technician }) {
  const status = getTechnicianStatusValue(technician.total_assigned);
  const statusConfig = STATUS_CONFIG[status];
  const displayTickets = technician.assigned_tickets.slice(0, 3);
  const hasMore = technician.assigned_tickets.length > 3;
  const worstAge = getWorstTicketAge(technician.assigned_tickets);

  const borderColor =
    status === 'IDLE'
      ? 'border-l-slate-300'
      : worstAge >= 24
        ? 'border-l-red-500'
        : worstAge >= 8
          ? 'border-l-amber-500'
          : 'border-l-green-500';

  const initials =
    technician.nama
      ?.split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2) || '?';

  const avatarColor = stringToColor(technician.nama || '');

  return (
    <Link href={`/admin/technicians/${technician.id_user}`}>
      <div
        className={`group cursor-pointer rounded-xl border border-l-4 border-slate-200 bg-white p-5 transition-all hover:shadow-md ${borderColor}`}
      >
        <div className='flex items-start gap-3'>
          <div
            className={`flex h-12 w-12 flex-col items-center justify-center rounded-full text-sm font-semibold text-white ${avatarColor}`}
          >
            {initials}
          </div>
          <div className='min-w-0 flex-1'>
            <h3 className='truncate font-semibold text-slate-800'>
              {technician.nama}
            </h3>
            <p className='flex items-center gap-1 text-sm text-slate-500'>
              <MapPin size={12} />
              {technician.workzone}
            </p>
            <span
              className={`mt-1.5 inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${statusConfig.bg} ${statusConfig.border} ${statusConfig.color}`}
            >
              {status === 'OVERLOAD' && (
                <span className='mr-1.5 flex h-2 w-2'>
                  <span className='absolute inline-flex h-2 w-2 animate-ping rounded-full bg-red-400 opacity-75' />
                  <span className='relative inline-flex h-2 w-2 rounded-full bg-red-500' />
                </span>
              )}
              {statusConfig.label}
            </span>
          </div>
        </div>

        <div className='mt-4 border-t border-slate-100 pt-3'>
          <div className='mb-2 flex flex-wrap gap-1.5'>
            <span className='inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700'>
              {technician.order_counts?.assigned || 0} Assigned
            </span>
            <span className='inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700'>
              {technician.order_counts?.on_progress || 0} On Progress
            </span>
            <span className='inline-flex items-center rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700'>
              {technician.order_counts?.pending || 0} Pending
            </span>
            <span className='inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700'>
              {technician.order_counts?.closed || 0} Closed
            </span>
          </div>

          {displayTickets.length === 0 ? (
            <div className='flex flex-col items-center py-4 text-center'>
              <AlertCircle className='h-8 w-8 text-slate-300' />
              <p className='mt-2 text-sm text-slate-400'>
                Tidak ada tiket aktif
              </p>
            </div>
          ) : (
            <div className='space-y-2'>
              {displayTickets.map((ticket, idx) => (
                <div
                  key={ticket.idTicket}
                  className={`flex items-center justify-between rounded-lg border-l-2 bg-slate-50 p-2 ${getAgeBorderColor(ticket.ageHours)}`}
                >
                  <div className='min-w-0 flex-1'>
                    <div className='flex items-center gap-1'>
                      <span className='font-mono text-xs font-medium text-slate-500'>
                        #{idx + 1}
                      </span>
                      <span
                        className={`text-xs font-medium ${getAgeBgColor(ticket.ageHours)} ${getAgeColor(ticket.ageHours)}`}
                      >
                        {ticket.ageHours >= 24
                          ? '🔴'
                          : ticket.ageHours >= 8
                            ? '🟡'
                            : '🟢'}
                      </span>
                    </div>
                    <p className='truncate text-xs font-medium text-slate-700'>
                      {ticket.ticket}
                    </p>
                    <p className='truncate text-xs text-slate-400'>
                      {ticket.contactName}
                    </p>
                  </div>
                  <span
                    className={`ml-2 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${getAgeBgColor(ticket.ageHours)} ${getAgeColor(ticket.ageHours)}`}
                  >
                    {ticket.age}
                  </span>
                </div>
              ))}
            </div>
          )}

          {hasMore && (
            <button className='mt-3 w-full rounded-lg border border-slate-200 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50'>
              + {technician.total_assigned - 3} tiket lainnya →
            </button>
          )}
        </div>
      </div>
    </Link>
  );
}

function StatsCard({
  title,
  value,
  color,
  isActive,
  onClick,
}: {
  title: string;
  value: number;
  color: string;
  isActive?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-xl border bg-white p-5 text-left transition-all hover:shadow-md ${
        isActive ? `border-blue-500 ring-2 ring-blue-500` : 'border-slate-200'
      }`}
    >
      <p className='text-sm font-medium tracking-wider text-slate-500 uppercase'>
        {title}
      </p>
      <p className={`mt-1 text-3xl font-bold ${color}`}>{value}</p>
    </button>
  );
}

export default function TechnicianMonitoringPage() {
  const [search, setSearch] = useState('');
  const [workzoneFilter, setWorkzoneFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<TechnicianStatus | 'all'>(
    'all',
  );

  const filters = useMemo(
    () => ({
      search: search || undefined,
      workzone: workzoneFilter || undefined,
      status: statusFilter,
    }),
    [search, workzoneFilter, statusFilter],
  );

  const {
    technicians,
    summary,
    userWorkzones,
    loading,
    error,
    lastUpdated,
    refresh,
  } = useTechnicianTickets(filters, 60);

  const orderStats = useMemo(() => {
    let totalAssigned = 0;
    let totalOnProgress = 0;
    let totalPending = 0;
    let totalClosed = 0;

    technicians.forEach((tech) => {
      const counts = tech.order_counts;
      if (counts) {
        totalAssigned += counts.assigned;
        totalOnProgress += counts.on_progress;
        totalPending += counts.pending;
        totalClosed += counts.closed;
      }
    });

    return { totalAssigned, totalOnProgress, totalPending, totalClosed };
  }, [technicians]);

  const hasFilters = Boolean(
    search || workzoneFilter || statusFilter !== 'all',
  );

  const handleResetFilters = useCallback(() => {
    setSearch('');
    setWorkzoneFilter('');
    setStatusFilter('all');
  }, []);

  const workzoneOptions = useMemo(() => {
    const uniqueWorkzones = [
      ...new Set(userWorkzones.filter((wz) => wz && wz.trim() !== '')),
    ];
    return uniqueWorkzones.map((wz) => ({ value: wz, label: wz }));
  }, [userWorkzones]);

  const statusOptions = [
    { value: 'all', label: 'All Status' },
    { value: 'AKTIF', label: 'Aktif' },
    { value: 'IDLE', label: 'Idle' },
    { value: 'OVERLOAD', label: 'Overload' },
  ];

  const getTimeAgo = () => {
    if (!lastUpdated) return '';
    return formatDistanceToNow(lastUpdated, { addSuffix: true, locale: id });
  };

  return (
    <AdminLayout>
      <div className='space-y-6'>
        <div className='flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between'>
          <div>
            <h1 className='text-xl font-semibold text-gray-800 sm:text-2xl'>
              Monitoring Teknisi
            </h1>
            {userWorkzones.length > 0 && (
              <p className='flex items-center gap-1 text-sm text-gray-500'>
                <MapPin size={14} />
                Area: {userWorkzones.join(', ')}
              </p>
            )}
            <Link
              href='/admin/technicians/attendance'
              className='mt-2 inline-flex items-center gap-1 text-sm text-blue-600 hover:underline'
            >
              <Calendar size={14} />
              Lihat Rekap Absensi
            </Link>
          </div>
          {lastUpdated && (
            <div className='flex items-center gap-2 text-sm text-slate-500'>
              <Clock size={14} />
              <span>Diperbarui {getTimeAgo()}</span>
              <Button
                variant='outline'
                size='sm'
                onClick={() => refresh()}
                className='ml-1'
              >
                <RefreshCw size={14} />
              </Button>
            </div>
          )}
        </div>

        {error && (
          <div className='rounded-lg border border-red-200 bg-red-50 p-4'>
            <p className='text-sm text-red-600'>{error}</p>
            <Button
              variant='outline'
              size='sm'
              onClick={() => refresh()}
              className='mt-2'
            >
              Coba Lagi
            </Button>
          </div>
        )}

        <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-6'>
          <StatsCard
            title='Total Teknisi'
            value={summary.total_active + summary.idle_count}
            color='text-blue-600'
            isActive={statusFilter === 'all' && !search && !workzoneFilter}
            onClick={handleResetFilters}
          />
          <StatsCard
            title='Assigned'
            value={orderStats.totalAssigned}
            color='text-blue-500'
          />
          <StatsCard
            title='On Progress'
            value={orderStats.totalOnProgress}
            color='text-amber-600'
          />
          <StatsCard
            title='Pending'
            value={orderStats.totalPending}
            color='text-orange-600'
          />
          <StatsCard
            title='Closed'
            value={orderStats.totalClosed}
            color='text-green-600'
          />
          <StatsCard
            title='Overload'
            value={summary.overload_count}
            color='text-red-600'
            isActive={statusFilter === 'OVERLOAD'}
            onClick={() => setStatusFilter('OVERLOAD')}
          />
        </div>

        <div className='flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between'>
          <div className='relative max-w-md flex-1'>
            <Search className='absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400' />
            <input
              type='text'
              placeholder='Cari teknisi...'
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className='w-full rounded-lg border border-slate-200 py-2 pr-4 pl-10 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500'
            />
          </div>
          <div className='flex items-center gap-2'>
            <Select
              options={workzoneOptions}
              placeholder='All Workzone'
              value={workzoneFilter}
              onChange={setWorkzoneFilter}
              className='w-40'
            />
            <Select
              options={statusOptions}
              placeholder='All Status'
              value={statusFilter}
              onChange={(v) => setStatusFilter(v as TechnicianStatus | 'all')}
              className='w-36'
            />
            {hasFilters && (
              <Button variant='outline' size='sm' onClick={handleResetFilters}>
                Reset
              </Button>
            )}
          </div>
        </div>

        {hasFilters && (
          <p className='text-sm text-slate-500'>
            Menampilkan {technicians.length} teknisi
          </p>
        )}

        {loading ? (
          <LoadingSkeleton />
        ) : technicians.length === 0 ? (
          <EmptyState hasFilters={hasFilters} onReset={handleResetFilters} />
        ) : (
          <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3'>
            {technicians.map((technician) => (
              <TechnicianCard
                key={technician.id_user}
                technician={technician}
              />
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
