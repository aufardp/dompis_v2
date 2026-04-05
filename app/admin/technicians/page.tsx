'use client';

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import Link from 'next/link';
import { formatDistanceToNow, format } from 'date-fns';
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
  TrendingUp,
} from 'lucide-react';
import AdminLayout from '@/app/components/layout/AdminLayout';
import Button from '@/app/components/ui/Button';
import Select from '@/app/components/form/Select';
import AdminAccordion from '@/app/components/ui/AdminAccordion';
import TicketDetailDrawer from '@/app/admin/components/dashboard/TicketDetailDrawer';
import AllTicketsModal from '@/app/admin/components/technician/AllTicketsModal';
import AssignTechnicianModal from '@/app/admin/components/dashboard/assign/AssignTechnicianModal';
import { useTechnicianTickets } from '@/app/hooks/useTechnicianTickets';
import { useAutoRefresh } from '@/app/hooks/useAutoRefresh';
import { TechnicianStatus, Technician } from '@/app/types/technician';
import { fetchWithAuth } from '@/app/libs/fetcher';

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
    color: 'text-gray-600 dark:text-slate-300',
    bg: 'bg-gray-50 dark:bg-slate-700/50',
    border: 'border-gray-200 dark:border-slate-600',
  },
  AKTIF: {
    label: 'Aktif',
    color: 'text-blue-600 dark:text-blue-400',
    bg: 'bg-blue-50 dark:bg-blue-500/15',
    border: 'border-blue-200 dark:border-blue-400/30',
  },
  OVERLOAD: {
    label: 'Overload',
    color: 'text-red-600 dark:text-red-400',
    bg: 'bg-red-50 dark:bg-red-500/15',
    border: 'border-red-200 dark:border-red-400/30',
  },
};

function getTechnicianStatusValue(ticketCount: number): TechnicianStatus {
  if (ticketCount === 0) return 'IDLE';
  if (ticketCount > 5) return 'OVERLOAD';
  return 'AKTIF';
}

function getAgeColor(hours: number): string {
  if (hours >= 24) return 'text-red-600 dark:text-red-400';
  if (hours >= 8) return 'text-amber-600 dark:text-amber-400';
  return 'text-green-600 dark:text-green-400';
}

function getAgeBgColor(hours: number): string {
  if (hours >= 24) return 'bg-red-100 dark:bg-red-500/15';
  if (hours >= 8) return 'bg-amber-100 dark:bg-amber-500/15';
  return 'bg-green-100 dark:bg-green-500/15';
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
    <div className='animate-pulse rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800'>
      <div className='flex items-center gap-3'>
        <div className='h-12 w-12 rounded-full bg-slate-200 dark:bg-slate-700' />
        <div className='flex-1 space-y-2'>
          <div className='h-4 w-24 rounded bg-slate-200 dark:bg-slate-700' />
          <div className='h-3 w-16 rounded bg-slate-200 dark:bg-slate-700' />
        </div>
      </div>
      <div className='mt-4 space-y-2'>
        <div className='h-3 w-full rounded bg-slate-200 dark:bg-slate-700' />
        <div className='h-3 w-3/4 rounded bg-slate-200 dark:bg-slate-700' />
      </div>
      <div className='mt-4 h-8 w-full rounded bg-slate-200 dark:bg-slate-700' />
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
            className='animate-pulse rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-800'
          >
            <div className='h-4 w-24 rounded bg-slate-200 dark:bg-slate-700' />
            <div className='mt-2 h-8 w-12 rounded bg-slate-200 dark:bg-slate-700' />
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
      <Users className='h-16 w-16 text-slate-300 dark:text-slate-600' />
      <h3 className='mt-4 text-lg font-medium text-slate-600 dark:text-slate-300'>
        {hasFilters
          ? 'Tidak ada teknisi ditemukan'
          : 'Belum ada teknisi di area ini'}
      </h3>
      <p className='mt-1 text-sm text-slate-400 dark:text-slate-500'>
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

function TechnicianCard({
  technician,
  onDetail,
  onShowAll,
  onReassign,
}: {
  technician: Technician;
  onDetail: (ticketId: number) => void;
  onShowAll: (technician: Technician) => void;
  onReassign: (ticket: {
    ticketId: number;
    ticketCode: string;
    workzone: string;
    currentTechnicianId: number;
    currentTechnicianName: string;
  }) => void;
}) {
  const status = getTechnicianStatusValue(technician.total_assigned);
  const statusConfig = STATUS_CONFIG[status];
  const displayTickets = technician.assigned_tickets.slice(0, 5);
  const hasMore = technician.assigned_tickets.length > 5;
  const closedToday = technician.closed_tickets_today || [];
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
    <div
      className={`group rounded-xl border border-l-4 border-slate-200 bg-white p-5 transition-all hover:shadow-md dark:border-slate-700 dark:bg-slate-800 ${borderColor}`}
    >
      <div className='flex items-start gap-3'>
        <div
          className={`flex h-12 w-12 flex-col items-center justify-center rounded-full text-sm font-semibold text-white ${avatarColor}`}
        >
          {initials}
        </div>
        <div className='min-w-0 flex-1'>
          <div className='flex items-start justify-between gap-3'>
            <div className='min-w-0'>
              <h3 className='truncate font-semibold text-slate-800 dark:text-slate-100'>
                {technician.nama}
              </h3>
              <p className='flex items-center gap-1 text-sm text-slate-500 dark:text-slate-400'>
                <MapPin size={12} />
                {technician.workzone}
              </p>
            </div>

            <Link
              href={`/admin/technicians/${technician.id_user}`}
              className='shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600'
            >
              Lihat Profil
            </Link>
          </div>
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
          {technician.cluster_today && technician.cluster_today.length > 0 && (
            <div className='mt-1 flex flex-wrap gap-1'>
              {technician.cluster_today.map((c) => (
                <span
                  key={c}
                  className='inline-flex items-center rounded-full bg-violet-500/10 px-2 py-0.5 text-[10px] font-medium text-violet-600 dark:text-violet-400'
                >
                  {c}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className='mt-4 border-t border-slate-100 pt-3 dark:border-slate-700'>
        <div className='mb-2 flex flex-wrap gap-1.5'>
          <span className='inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-500/20 dark:text-blue-300'>
            {technician.order_counts?.assigned || 0} Menunggu
          </span>
          <span className='inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-500/20 dark:text-amber-300'>
            {technician.order_counts?.on_progress || 0} Dikerjakan
          </span>
          <span className='inline-flex items-center rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700 dark:bg-orange-500/20 dark:text-orange-300'>
            {technician.order_counts?.pending || 0} Pending
          </span>
          {technician.total_closed_today > 0 && (
            <span className='inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300'>
              ✓ {technician.total_closed_today} selesai hari ini
            </span>
          )}
        </div>

        {displayTickets.length === 0 ? (
          <div className='flex flex-col items-center py-4 text-center'>
            <AlertCircle className='h-8 w-8 text-slate-300 dark:text-slate-600' />
            <p className='mt-2 text-sm text-slate-400 dark:text-slate-500'>
              Tidak ada tiket aktif
            </p>
          </div>
        ) : (
          <div className='space-y-2'>
            {displayTickets.map((ticket, idx) => (
              <div
                key={ticket.idTicket}
                className={`flex items-center justify-between rounded-lg border-l-2 bg-slate-50 p-2 dark:bg-slate-700/50 ${getAgeBorderColor(ticket.ageHours)}`}
              >
                <div className='min-w-0 flex-1'>
                  <div className='flex items-center gap-1'>
                    <span className='font-mono text-xs font-medium text-slate-500 dark:text-slate-400'>
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
                  <p className='truncate text-xs font-medium text-slate-700 dark:text-slate-200'>
                    {ticket.ticket}
                  </p>
                  <p className='truncate text-xs text-slate-400 dark:text-slate-500'>
                    {ticket.contactName}
                  </p>
                </div>
                <div className='ml-2 flex shrink-0 items-center gap-2'>
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${getAgeBgColor(ticket.ageHours)} ${getAgeColor(ticket.ageHours)}`}
                  >
                    {ticket.age}
                  </span>
                  <button
                    type='button'
                    onClick={() => onDetail(ticket.idTicket)}
                    className='rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600'
                  >
                    Detail
                  </button>
                  <button
                    type='button'
                    onClick={() =>
                      onReassign({
                        ticketId: ticket.idTicket,
                        ticketCode: ticket.ticket,
                        workzone: ticket.workzone ?? technician.workzone,
                        currentTechnicianId: technician.id_user,
                        currentTechnicianName: technician.nama,
                      })
                    }
                    className='rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-[10px] font-semibold text-blue-700 hover:bg-blue-100 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-400 dark:hover:bg-blue-500/20'
                  >
                    Reassign
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {closedToday.length > 0 && (
          <div className='mt-4'>
            <p className='mb-2 text-xs font-semibold tracking-wider text-slate-500 uppercase dark:text-slate-400'>
              Closed Today
            </p>
            <div className='space-y-2'>
              {closedToday.map((t, idx) => (
                <div
                  key={`${t.idTicket}-${idx}`}
                  className='flex items-center justify-between rounded-lg border-l-2 border-l-emerald-500 bg-emerald-50/60 p-2 dark:bg-emerald-500/10'
                >
                  <div className='min-w-0 flex-1'>
                    <p className='truncate text-xs font-medium text-slate-700 dark:text-slate-200'>
                      {t.ticket}
                    </p>
                    <p className='truncate text-xs text-slate-500 dark:text-slate-400'>
                      {t.contactName}
                    </p>
                  </div>
                  <button
                    type='button'
                    onClick={() => onDetail(t.idTicket)}
                    className='ml-2 shrink-0 rounded-md border border-emerald-200 bg-white px-2 py-1 text-[10px] font-semibold text-emerald-700 hover:bg-emerald-50 dark:border-emerald-500/30 dark:bg-slate-700 dark:text-emerald-400 dark:hover:bg-emerald-500/15'
                  >
                    Detail
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {hasMore && (
          <button
            type='button'
            onClick={() => onShowAll(technician)}
            className='mt-3 w-full rounded-lg border border-slate-200 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700/50'
          >
            + {technician.total_assigned - 5} tiket lainnya →
          </button>
        )}
      </div>
    </div>
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
      disabled={!onClick}
      className={`group flex flex-col justify-center rounded-xl border bg-white p-4 transition-all md:p-5 ${
        onClick ? 'cursor-pointer hover:shadow-md' : 'cursor-default'
      } ${
        isActive
          ? `border-blue-500 ring-2 ring-blue-500/20` // Menggunakan /20 agar ring lebih soft
          : 'border-slate-200 dark:border-slate-700'
      } dark:bg-slate-800/50`} // Memberikan sedikit transparansi agar lebih modern
    >
      <p className='text-[10px] font-bold tracking-[1.2px] text-slate-500 uppercase transition-colors group-hover:text-slate-700 dark:text-slate-400 dark:group-hover:text-slate-300'>
        {title}
      </p>
      <p
        className={`mt-2 text-2xl leading-none font-extrabold md:text-3xl ${color}`}
      >
        {value}
      </p>
    </button>
  );
}

export default function TechnicianMonitoringPage() {
  const [search, setSearch] = useState('');
  const [workzoneFilter, setWorkzoneFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<TechnicianStatus | 'all'>(
    'all',
  );

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailTicket, setDetailTicket] = useState<any | null>(null);
  const [detailTicketId, setDetailTicketId] = useState<number | null>(null);

  const [allTicketsModal, setAllTicketsModal] = useState<{
    open: boolean;
    technician: Technician | null;
  }>({ open: false, technician: null });

  const [reassignModal, setReassignModal] = useState<{
    open: boolean;
    ticketId: number | null;
    ticketCode: string | null;
    workzone: string | null;
    currentTechnicianId: number | null;
    currentTechnicianName: string | null;
  }>({
    open: false,
    ticketId: null,
    ticketCode: null,
    workzone: null,
    currentTechnicianId: null,
    currentTechnicianName: null,
  });

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
  } = useTechnicianTickets(filters, 0, false, {
    includeClosedToday: true,
    closedTodayLimit: 3,
  });

  // Auto refresh technicians list every 60s, pause while ticket detail is open.
  useAutoRefresh({
    intervalMs: 60_000,
    refreshers: [refresh],
    pauseWhen: [detailOpen],
  });

  const handleTicketDetail = useCallback(async (ticketId: number) => {
    setDetailTicketId(ticketId);
    setDetailOpen(true);
    setDetailLoading(true);
    setDetailError(null);
    setDetailTicket(null);

    try {
      const res = await fetchWithAuth(`/api/tickets/${ticketId}/detail`);
      if (!res || !res.ok) {
        const body = res ? await res.json().catch(() => null) : null;
        throw new Error(body?.message || 'Failed to load ticket detail');
      }
      const json = await res.json();
      if (!json?.success) {
        throw new Error(json?.message || 'Failed to load ticket detail');
      }
      setDetailTicket(json.data);
    } catch (e: any) {
      setDetailError(e?.message || 'Failed to load ticket detail');
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const handleShowAllTickets = useCallback((technician: Technician) => {
    setAllTicketsModal({ open: true, technician });
  }, []);

  const handleReassign = useCallback(
    (ticket: {
      ticketId: number;
      ticketCode: string;
      workzone: string;
      currentTechnicianId: number;
      currentTechnicianName: string;
    }) => {
      setReassignModal({
        open: true,
        ticketId: ticket.ticketId,
        ticketCode: ticket.ticketCode,
        workzone: ticket.workzone,
        currentTechnicianId: ticket.currentTechnicianId,
        currentTechnicianName: ticket.currentTechnicianName,
      });
    },
    [],
  );

  const handleReassignSuccess = useCallback(async () => {
    setReassignModal({
      open: false,
      ticketId: null,
      ticketCode: null,
      workzone: null,
      currentTechnicianId: null,
      currentTechnicianName: null,
    });
    refresh();
  }, [refresh]);

  const orderStats = useMemo(() => {
    let totalAssigned = 0;
    let totalOnProgress = 0;
    let totalPending = 0;
    let totalClosedToday = 0;

    technicians.forEach((tech) => {
      const counts = tech.order_counts;
      if (counts) {
        totalAssigned += counts.assigned;
        totalOnProgress += counts.on_progress;
        totalPending += counts.pending;
      }
      totalClosedToday += tech.total_closed_today || 0;
    });

    return { totalAssigned, totalOnProgress, totalPending, totalClosedToday };
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
            <h1 className='text-xl font-semibold text-gray-800 sm:text-2xl dark:text-gray-100'>
              Monitoring Teknisi
            </h1>
            <p className='mt-1 text-sm text-slate-500 dark:text-slate-400'>
              Data aktif hari ini —{' '}
              {format(new Date(), 'EEEE, d MMMM yyyy', { locale: id })}
            </p>
            {userWorkzones.length > 0 && (
              <p className='flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400'>
                <MapPin size={14} />
                Area: {userWorkzones.join(', ')}
              </p>
            )}
            <div className='mt-2 flex items-center gap-3'>
              <Link
                href='/admin/technicians/attendance'
                className='inline-flex items-center gap-1 text-sm text-blue-600 hover:underline dark:text-blue-400'
              >
                <Calendar size={14} />
                Rekap Absensi
              </Link>
              <span className='text-gray-300 dark:text-gray-600'>|</span>
              <Link
                href='/admin/technicians/performance'
                className='inline-flex items-center gap-1 text-sm text-blue-600 hover:underline dark:text-blue-400'
              >
                <CheckCircle size={14} />
                Rekap Pekerjaan Bulanan
              </Link>
              <span className='text-gray-300 dark:text-gray-600'>|</span>
              <Link
                href='/admin/technicians/manhours'
                className='inline-flex items-center gap-1 text-sm text-blue-600 hover:underline dark:text-blue-400'
              >
                <TrendingUp size={14} />
                Produktivitas ManHours
              </Link>
            </div>
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
          <div className='rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-500/30 dark:bg-red-500/10'>
            <p className='text-sm text-red-600 dark:text-red-400'>{error}</p>
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

        <AdminAccordion
          multiple
          storageKey='admin:technicians:sections'
          items={[
            {
              id: 'summary',
              title: 'Summary',
              defaultOpen: true,
              children: (
                <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-6'>
                  <StatsCard
                    title='Total Teknisi'
                    value={summary.total_active + summary.idle_count}
                    color='text-blue-600'
                    isActive={
                      statusFilter === 'all' && !search && !workzoneFilter
                    }
                    onClick={handleResetFilters}
                  />
                  <StatsCard
                    title='Menunggu'
                    value={orderStats.totalAssigned}
                    color='text-blue-500'
                  />
                  <StatsCard
                    title='Dikerjakan'
                    value={orderStats.totalOnProgress}
                    color='text-amber-600'
                  />
                  <StatsCard
                    title='Pending'
                    value={orderStats.totalPending}
                    color='text-orange-600'
                  />
                  <StatsCard
                    title='Selesai Hari Ini'
                    value={orderStats.totalClosedToday}
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
              ),
            },
            {
              id: 'technicians',
              title: 'Technicians',
              defaultOpen: true,
              right: hasFilters ? `${technicians.length} shown` : undefined,
              children: (
                <div className='space-y-4'>
                  <div className='flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between'>
                    <div className='relative max-w-md flex-1'>
                      <Search className='absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400' />
                      <input
                        type='text'
                        placeholder='Cari teknisi...'
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className='w-full rounded-lg border border-slate-200 bg-white py-2 pr-4 pl-10 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:placeholder:text-slate-500 dark:focus:border-blue-400 dark:focus:ring-blue-400'
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
                        onChange={(v) =>
                          setStatusFilter(v as TechnicianStatus | 'all')
                        }
                        className='w-36'
                      />
                      {hasFilters && (
                        <Button
                          variant='outline'
                          size='sm'
                          onClick={handleResetFilters}
                        >
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
                    <EmptyState
                      hasFilters={hasFilters}
                      onReset={handleResetFilters}
                    />
                  ) : (
                    <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3'>
                      {technicians.map((technician) => (
                        <TechnicianCard
                          key={technician.id_user}
                          technician={technician}
                          onDetail={handleTicketDetail}
                          onShowAll={handleShowAllTickets}
                          onReassign={handleReassign}
                        />
                      ))}
                    </div>
                  )}
                </div>
              ),
            },
          ]}
        />

        <TicketDetailDrawer
          open={detailOpen}
          onClose={() => {
            setDetailOpen(false);
            setDetailError(null);
            setDetailTicket(null);
            setDetailTicketId(null);
          }}
          ticket={detailTicket}
          loading={detailLoading}
          error={detailError}
          onRetry={
            detailTicketId != null
              ? () => handleTicketDetail(detailTicketId)
              : undefined
          }
        />

        <AllTicketsModal
          isOpen={allTicketsModal.open}
          onClose={() => setAllTicketsModal({ open: false, technician: null })}
          technician={allTicketsModal.technician}
          onDetail={handleTicketDetail}
          onReassign={handleReassign}
        />

        <AssignTechnicianModal
          isOpen={reassignModal.open}
          onClose={() =>
            setReassignModal({
              open: false,
              ticketId: null,
              ticketCode: null,
              workzone: null,
              currentTechnicianId: null,
              currentTechnicianName: null,
            })
          }
          ticketId={reassignModal.ticketId ?? ''}
          ticketCode={reassignModal.ticketCode ?? ''}
          ticketWorkzone={reassignModal.workzone}
          currentTechnicianId={reassignModal.currentTechnicianId ?? undefined}
          currentTechnicianName={reassignModal.currentTechnicianName}
          onAssign={handleReassignSuccess}
          forceReassign={true}
        />
      </div>
    </AdminLayout>
  );
}
