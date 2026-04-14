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
import clsx from 'clsx';
import AdminLayout from '@/app/components/layout/AdminLayout';
import Button from '@/app/components/ui/Button';
import AdminAccordion from '@/app/components/ui/AdminAccordion';
import TicketDetailDrawer from '@/app/admin/components/dashboard/TicketDetailDrawer';
import AllTicketsModal from '@/app/admin/components/technician/AllTicketsModal';
import AssignTechnicianModal from '@/app/admin/components/dashboard/assign/AssignTechnicianModal';
import TicketActionButtons from '@/app/components/ui/TicketActionButtons';
import { useTechnicianTickets } from '@/app/hooks/useTechnicianTickets';
import { useAutoRefresh } from '@/app/hooks/useAutoRefresh';
import { useUserManagedSAs } from '@/app/hooks/useUserManagedSAs';
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
  externalFilter,
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
  externalFilter?: 'all' | 'assigned' | 'on_progress' | 'pending' | 'closed';
}) {
  const [localFilter, setLocalFilter] = useState<
    'all' | 'assigned' | 'on_progress' | 'pending' | 'closed'
  >('all');

  // Sync localFilter dengan externalFilter saat berubah dari luar
  useEffect(() => {
    if (externalFilter !== undefined) {
      setLocalFilter(externalFilter);
    }
  }, [externalFilter]);

  const status = getTechnicianStatusValue(technician.total_assigned);
  const statusConfig = STATUS_CONFIG[status];
  const closedToday = technician.closed_tickets_today || [];

  const worstAge = getWorstTicketAge(technician.assigned_tickets);

  const { displayTickets, displaySource, hasMore } = useMemo(() => {
    const allTickets = technician.assigned_tickets;

    let source: typeof allTickets | typeof closedToday;
    if (localFilter === 'closed') {
      source = closedToday;
    } else if (localFilter === 'all') {
      source = allTickets;
    } else {
      source = allTickets.filter((t) => {
        const s = (t.statusUpdate ?? '').toLowerCase();
        return s === localFilter;
      });
    }

    return {
      displaySource: source,
      displayTickets: source.slice(0, 5),
      hasMore: source.length > 5,
    };
  }, [technician.assigned_tickets, closedToday, localFilter]);

  const counts = {
    assigned: technician.order_counts?.assigned || 0,
    on_progress: technician.order_counts?.on_progress || 0,
    pending: technician.order_counts?.pending || 0,
    closed: technician.total_closed_today || 0,
  };

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
                <span className='relative inline-flex h-2 w-2 animate-ping rounded-full bg-red-400 opacity-75' />
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
        {/* Clickable Tab Filters */}
        <div className='mb-3 flex flex-wrap gap-1.5'>
          <button
            type='button'
            onClick={() =>
              setLocalFilter(localFilter === 'assigned' ? 'all' : 'assigned')
            }
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium transition-all ${
              localFilter === 'assigned'
                ? 'bg-blue-500 text-white shadow-sm'
                : 'bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-500/20 dark:text-blue-300 dark:hover:bg-blue-500/30'
            }`}
          >
            {counts.assigned} Menunggu
            {localFilter === 'assigned' && (
              <span className='ml-0.5 text-[10px]'>✕</span>
            )}
          </button>

          <button
            type='button'
            onClick={() =>
              setLocalFilter(
                localFilter === 'on_progress' ? 'all' : 'on_progress',
              )
            }
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium transition-all ${
              localFilter === 'on_progress'
                ? 'bg-amber-500 text-white shadow-sm'
                : 'bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-500/20 dark:text-amber-300 dark:hover:bg-amber-500/30'
            }`}
          >
            {counts.on_progress} Dikerjakan
            {localFilter === 'on_progress' && (
              <span className='ml-0.5 text-[10px]'>✕</span>
            )}
          </button>

          <button
            type='button'
            onClick={() =>
              setLocalFilter(localFilter === 'pending' ? 'all' : 'pending')
            }
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium transition-all ${
              localFilter === 'pending'
                ? 'bg-orange-500 text-white shadow-sm'
                : 'bg-orange-100 text-orange-700 hover:bg-orange-200 dark:bg-orange-500/20 dark:text-orange-300 dark:hover:bg-orange-500/30'
            }`}
          >
            {counts.pending} Pending
            {localFilter === 'pending' && (
              <span className='ml-0.5 text-[10px]'>✕</span>
            )}
          </button>

          {counts.closed > 0 && (
            <button
              type='button'
              onClick={() =>
                setLocalFilter(localFilter === 'closed' ? 'all' : 'closed')
              }
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium transition-all ${
                localFilter === 'closed'
                  ? 'bg-emerald-500 text-white shadow-sm'
                  : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-300 dark:hover:bg-emerald-500/30'
              }`}
            >
              ✓ {counts.closed} Selesai
              {localFilter === 'closed' && (
                <span className='ml-0.5 text-[10px]'>✕</span>
              )}
            </button>
          )}
        </div>

        {/* Active filter label */}
        {localFilter !== 'all' && (
          <p className='mb-2 text-[10px] text-slate-400 dark:text-slate-500'>
            Menampilkan {displaySource.length} tiket
            <button
              onClick={() => setLocalFilter('all')}
              className='ml-1 text-blue-500 hover:underline'
            >
              (tampilkan semua)
            </button>
          </p>
        )}

        {displayTickets.length === 0 ? (
          <div className='flex flex-col items-center py-4 text-center'>
            <AlertCircle className='h-8 w-8 text-slate-300 dark:text-slate-600' />
            <p className='mt-2 text-sm text-slate-400 dark:text-slate-500'>
              Tidak ada tiket{' '}
              {localFilter !== 'all' ? `dengan status ini` : 'aktif'}
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
                  <TicketActionButtons
                    hasAssignee={true}
                    isClosed={localFilter === 'closed'}
                    onDetail={() => onDetail(ticket.idTicket)}
                    onAssign={() =>
                      onReassign({
                        ticketId: ticket.idTicket,
                        ticketCode: ticket.ticket,
                        workzone: ticket.workzone ?? technician.workzone,
                        currentTechnicianId: technician.id_user,
                        currentTechnicianName: technician.nama,
                      })
                    }
                    size='xs'
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        {hasMore && (
          <button
            type='button'
            onClick={() => onShowAll(technician)}
            className='mt-3 w-full rounded-lg border border-slate-200 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700/50'
          >
            + {displaySource.length - 5} tiket lainnya →
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
  const [selectedSaId, setSelectedSaId] = useState<number | null>(null);
  const [globalTicketFilter, setGlobalTicketFilter] = useState<
    'all' | 'assigned' | 'on_progress' | 'pending' | 'closed'
  >('all');

  const { serviceAreas, loading: saLoading } = useUserManagedSAs();

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

  // Auto refresh technicians list every 180s, pause while ticket detail or reassign modal is open.
  useAutoRefresh({
    intervalMs: 180_000,  // 3 menit — SSE menangani real-time, polling hanya safety net
    refreshers: [refresh],
    pauseWhen: [detailOpen, reassignModal.open],
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
      // Tidak perlu validasi SA — service layer auto-resolve dari ticket.WORKZONE
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
    setGlobalTicketFilter('all');
  }, []);

  const workzoneOptions = useMemo(() => {
    const uniqueWorkzones = [
      ...new Set(userWorkzones.filter((wz) => wz && wz.trim() !== '')),
    ];
    return uniqueWorkzones.map((wz) => ({ value: wz, label: wz }));
  }, [userWorkzones]);

  const saOptions = useMemo(() => {
    if (!serviceAreas.length) return [];
    return serviceAreas
      .filter((sa) => sa.id_sa)
      .map((sa) => ({
        value: String(sa.id_sa),
        label: sa.nama_sa || `SA ${sa.id_sa}`,
      }));
  }, [serviceAreas]);

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
                  {/* Total Teknisi — reset semua filter */}
                  <StatsCard
                    title='Total Teknisi'
                    value={summary.total_active + summary.idle_count}
                    color='text-blue-600'
                    isActive={
                      statusFilter === 'all' &&
                      !search &&
                      !workzoneFilter &&
                      globalTicketFilter === 'all'
                    }
                    onClick={handleResetFilters}
                  />

                  {/* Menunggu — filter tiket assigned di semua card */}
                  <StatsCard
                    title='Menunggu'
                    value={orderStats.totalAssigned}
                    color='text-blue-500'
                    isActive={globalTicketFilter === 'assigned'}
                    onClick={() =>
                      setGlobalTicketFilter(
                        globalTicketFilter === 'assigned' ? 'all' : 'assigned',
                      )
                    }
                  />

                  {/* Dikerjakan — filter tiket on_progress */}
                  <StatsCard
                    title='Dikerjakan'
                    value={orderStats.totalOnProgress}
                    color='text-amber-600'
                    isActive={globalTicketFilter === 'on_progress'}
                    onClick={() =>
                      setGlobalTicketFilter(
                        globalTicketFilter === 'on_progress'
                          ? 'all'
                          : 'on_progress',
                      )
                    }
                  />

                  {/* Pending */}
                  <StatsCard
                    title='Pending'
                    value={orderStats.totalPending}
                    color='text-orange-600'
                    isActive={globalTicketFilter === 'pending'}
                    onClick={() =>
                      setGlobalTicketFilter(
                        globalTicketFilter === 'pending' ? 'all' : 'pending',
                      )
                    }
                  />

                  {/* Selesai Hari Ini */}
                  <StatsCard
                    title='Selesai Hari Ini'
                    value={orderStats.totalClosedToday}
                    color='text-green-600'
                    isActive={globalTicketFilter === 'closed'}
                    onClick={() =>
                      setGlobalTicketFilter(
                        globalTicketFilter === 'closed' ? 'all' : 'closed',
                      )
                    }
                  />

                  {/* Overload — filter status teknisi (tidak berubah) */}
                  <StatsCard
                    title='Overload'
                    value={summary.overload_count}
                    color='text-red-600'
                    isActive={statusFilter === 'OVERLOAD'}
                    onClick={() =>
                      setStatusFilter(
                        statusFilter === 'OVERLOAD' ? 'all' : 'OVERLOAD',
                      )
                    }
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
                  {/* Badge indikator filter aktif */}
                  {globalTicketFilter !== 'all' && (
                    <div className='flex items-center gap-2 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-700 dark:bg-blue-500/15 dark:text-blue-300'>
                      <span>
                        Menampilkan:{' '}
                        <strong>
                          {globalTicketFilter === 'assigned' && 'Menunggu'}
                          {globalTicketFilter === 'on_progress' && 'Dikerjakan'}
                          {globalTicketFilter === 'pending' && 'Pending'}
                          {globalTicketFilter === 'closed' && 'Selesai Hari Ini'}
                        </strong>
                      </span>
                      <button
                        type='button'
                        onClick={() => setGlobalTicketFilter('all')}
                        className='ml-auto rounded px-1.5 py-0.5 text-xs font-medium hover:bg-blue-100 dark:hover:bg-blue-500/20'
                      >
                        ✕ Reset
                      </button>
                    </div>
                  )}

                  {/* Filter bar compact */}
                  <div className='flex flex-wrap items-center gap-2'>
                    {/* Search */}
                    <div className='relative min-w-[160px] flex-1 max-w-xs'>
                      <Search className='absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-slate-400' />
                      <input
                        type='text'
                        placeholder='Cari teknisi...'
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className='h-8 w-full rounded-lg border border-slate-200 bg-white py-1.5 pr-3 pl-8 text-sm outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:placeholder:text-slate-500'
                      />
                    </div>

                    {/* Workzone — compact native select */}
                    {workzoneOptions.length > 0 && (
                      <select
                        value={workzoneFilter}
                        onChange={(e) => setWorkzoneFilter(e.target.value)}
                        className={clsx(
                          'h-8 rounded-lg border px-2.5 text-xs font-medium cursor-pointer outline-none transition',
                          workzoneFilter
                            ? 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-400/40 dark:bg-blue-500/15 dark:text-blue-300'
                            : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300',
                        )}
                      >
                        <option value=''>Semua Area</option>
                        {workzoneOptions.map((opt) => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    )}

                    {/* Status chips */}
                    <div className='flex items-center gap-1'>
                      {(
                        [
                          { value: 'all', label: 'Semua', activeClass: 'bg-slate-700 text-white border-slate-700 dark:bg-slate-600 dark:border-slate-600' },
                          { value: 'AKTIF', label: 'Aktif', activeClass: 'bg-blue-500 text-white border-blue-500' },
                          { value: 'IDLE', label: 'Idle', activeClass: 'bg-slate-400 text-white border-slate-400' },
                          { value: 'OVERLOAD', label: 'Overload', activeClass: 'bg-red-500 text-white border-red-500' },
                        ] as const
                      ).map(({ value, label, activeClass }) => (
                        <button
                          key={value}
                          type='button'
                          onClick={() => setStatusFilter(value as TechnicianStatus | 'all')}
                          className={clsx(
                            'h-8 rounded-lg border px-2.5 text-xs font-medium transition',
                            statusFilter === value
                              ? activeClass
                              : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-400',
                          )}
                        >
                          {label}
                        </button>
                      ))}
                    </div>

                    {/* Reset */}
                    {hasFilters && (
                      <button
                        type='button'
                        onClick={handleResetFilters}
                        className='flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-500 transition hover:border-red-200 hover:text-red-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-400'
                      >
                        ✕ Reset
                      </button>
                    )}
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
                          externalFilter={globalTicketFilter}
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
          selectedSaId={selectedSaId ?? undefined}
        />
      </div>
    </AdminLayout>
  );
}
