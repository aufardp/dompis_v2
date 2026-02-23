'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  RefreshCw,
  Clock,
  CheckCircle,
  AlertCircle,
  MapPin,
} from 'lucide-react';
import AdminLayout from '@/app/components/layout/AdminLayout';
import Button from '@/app/components/ui/Button';
import Badge from '@/app/components/ui/badge/Badge';
import CustomerTypeBadge from '@/app/components/tickets/CustomerTypeBadge';
import { useSingleTechnician } from '@/app/hooks/useSingleTechnician';
import { TicketCtype } from '@/app/types/ticket';
import { TechnicianStatus } from '@/app/types/technician';

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

function getAgeColor(hours: number): string {
  if (hours >= 24) return 'bg-red-100 text-red-700 border-red-200';
  if (hours >= 8) return 'bg-amber-100 text-amber-700 border-amber-200';
  return 'bg-green-100 text-green-700 border-green-200';
}

function getAgeBorderColor(hours: number): string {
  if (hours >= 24) return 'border-l-red-500';
  if (hours >= 8) return 'border-l-amber-500';
  return 'border-l-green-500';
}

function LoadingSkeleton() {
  return (
    <div className='space-y-6'>
      <div className='animate-pulse rounded-xl border border-slate-200 bg-white p-6'>
        <div className='flex items-center gap-4'>
          <div className='h-16 w-16 rounded-full bg-slate-200' />
          <div className='space-y-2'>
            <div className='h-5 w-32 rounded bg-slate-200' />
            <div className='h-4 w-24 rounded bg-slate-200' />
          </div>
        </div>
      </div>
      <div className='grid grid-cols-1 gap-4 sm:grid-cols-3'>
        {[...Array(3)].map((_, i) => (
          <div
            key={i}
            className='animate-pulse rounded-xl border border-slate-200 bg-white p-6'
          >
            <div className='h-4 w-24 rounded bg-slate-200' />
            <div className='mt-2 h-8 w-12 rounded bg-slate-200' />
          </div>
        ))}
      </div>
      <div className='animate-pulse rounded-xl border border-slate-200 bg-white p-6'>
        <div className='h-6 w-32 rounded bg-slate-200' />
        <div className='mt-4 space-y-3'>
          {[...Array(5)].map((_, i) => (
            <div key={i} className='h-12 w-full rounded bg-slate-200' />
          ))}
        </div>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className='flex flex-col items-center justify-center py-16 text-center'>
      <CheckCircle className='h-16 w-16 text-green-300' />
      <h3 className='mt-4 text-lg font-medium text-slate-600'>
        Tidak ada tiket aktif
      </h3>
      <p className='mt-1 text-sm text-slate-400'>
        Teknisi ini tidak memiliki tiket yang sedang dikerjakan
      </p>
    </div>
  );
}

function StatBox({
  title,
  value,
  color,
}: {
  title: string;
  value: string | number;
  color?: string;
}) {
  return (
    <div className='rounded-xl border border-slate-200 bg-white p-5 text-center'>
      <p className='text-sm font-medium tracking-wider text-slate-500 uppercase'>
        {title}
      </p>
      <p className={`mt-1 text-3xl font-bold ${color || 'text-slate-800'}`}>
        {value}
      </p>
    </div>
  );
}

export default function TechnicianDetailPage() {
  const params = useParams();
  const router = useRouter();
  const technicianId = Number(params.id);

  const { technician, loading, error, refresh } =
    useSingleTechnician(technicianId);

  const sortedTickets = useMemo(() => {
    if (!technician?.assigned_tickets) return [];
    return [...technician.assigned_tickets].sort(
      (a, b) => b.ageHours - a.ageHours,
    );
  }, [technician?.assigned_tickets]);

  const formatAvgTime = (hours: number | null) => {
    if (hours === null) return '-';
    if (hours < 1) return `${Math.round(hours * 60)}m`;
    if (hours < 24) return `${Math.round(hours)}j`;
    return `${Math.round(hours / 24)}d ${Math.round(hours % 24)}j`;
  };

  if (loading) {
    return (
      <AdminLayout>
        <LoadingSkeleton />
      </AdminLayout>
    );
  }

  if (error || !technician) {
    const isForbidden = error?.includes('Access denied');

    return (
      <AdminLayout>
        <div className='flex flex-col items-center justify-center py-16 text-center'>
          <AlertCircle
            className={`h-16 w-16 ${isForbidden ? 'text-amber-400' : 'text-red-500'}`}
          />
          <h3 className='mt-4 text-lg font-medium text-slate-800'>
            {isForbidden ? 'Akses Ditolak' : 'Terjadi Kesalahan'}
          </h3>
          <p className='mt-1 max-w-md text-sm text-slate-500'>
            {error || 'Teknisi tidak ditemukan'}
          </p>
          <div className='mt-6 flex gap-3'>
            <Button onClick={() => router.push('/admin/technicians')}>
              Kembali
            </Button>
            {!isForbidden && (
              <Button variant='outline' onClick={() => refresh()}>
                Coba Lagi
              </Button>
            )}
          </div>
        </div>
      </AdminLayout>
    );
  }

  const statusConfig = STATUS_CONFIG[technician.status] || STATUS_CONFIG.AKTIF;
  const initials =
    technician.nama
      ?.split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2) || '?';
  const avatarColor = stringToColor(technician.nama || '');

  return (
    <AdminLayout>
      <div className='space-y-6'>
        <div className='flex items-center gap-4'>
          <Link href='/admin/technicians'>
            <Button variant='outline' size='sm'>
              <ArrowLeft size={16} />
            </Button>
          </Link>
          <div>
            <h1 className='text-xl font-semibold text-gray-800'>
              Detail Teknisi
            </h1>
            <p className='text-sm text-gray-500'>
              Pantau performa dan tiket teknisi
            </p>
          </div>
        </div>

        <div className='rounded-xl border border-slate-200 bg-white p-6'>
          <div className='flex items-center gap-4'>
            <div
              className={`flex h-16 w-16 flex-col items-center justify-center rounded-full text-xl font-semibold text-white ${avatarColor}`}
            >
              {initials}
            </div>
            <div>
              <h2 className='text-lg font-semibold text-slate-800'>
                {technician.nama}
              </h2>
              <p className='flex items-center gap-1 text-sm text-slate-500'>
                <MapPin size={14} />
                {technician.workzone}
              </p>
              <div className='mt-2'>
                <span
                  className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${statusConfig.bg} ${statusConfig.border} ${statusConfig.color}`}
                >
                  {statusConfig.label}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className='grid grid-cols-2 gap-4 sm:grid-cols-5'>
          <StatBox
            title='Assigned'
            value={technician.order_counts?.assigned || 0}
            color='text-blue-600'
          />
          <StatBox
            title='On Progress'
            value={technician.order_counts?.on_progress || 0}
            color='text-amber-600'
          />
          <StatBox
            title='Pending'
            value={technician.order_counts?.pending || 0}
            color='text-orange-600'
          />
          <StatBox
            title='Closed'
            value={technician.order_counts?.closed || 0}
            color='text-green-600'
          />
          <StatBox
            title='Rata-rata Penyelesaian'
            value={formatAvgTime(technician.average_resolve_time_hours)}
            color='text-purple-600'
          />
        </div>

        <div className='overflow-hidden rounded-xl border border-slate-200 bg-white'>
          <div className='border-b border-slate-200 px-6 py-4'>
            <h3 className='font-semibold text-slate-800'>
              Tiket Aktif ({technician.total_assigned})
            </h3>
          </div>

          {sortedTickets.length === 0 ? (
            <EmptyState />
          ) : (
            <div className='overflow-x-auto'>
              <table className='w-full text-sm'>
                <thead className='bg-slate-50 text-xs font-semibold tracking-wide text-slate-500 uppercase'>
                  <tr>
                    <th className='px-4 py-3 text-center'>Rank</th>
                    <th className='px-4 py-3 text-left'>Ticket ID</th>
                    <th className='px-4 py-3 text-left'>Customer</th>
                    <th className='px-4 py-3 text-center'>Tipe</th>
                    <th className='px-4 py-3 text-left'>Service</th>
                    <th className='px-4 py-3 text-center'>Umur</th>
                    <th className='px-4 py-3 text-center'>Status</th>
                  </tr>
                </thead>
                <tbody className='divide-y divide-slate-100'>
                  {sortedTickets.map((ticket, index) => (
                    <tr
                      key={ticket.idTicket}
                      className={`border-l-4 ${getAgeBorderColor(ticket.ageHours)}`}
                    >
                      <td className='px-4 py-3 text-center'>
                        <span className='font-mono font-semibold text-slate-600'>
                          #{index + 1}
                        </span>
                      </td>
                      <td className='px-4 py-3'>
                        <div>
                          <p className='font-medium text-slate-800'>
                            {ticket.ticket}
                          </p>
                        </div>
                      </td>
                      <td className='px-4 py-3'>
                        <p className='text-slate-700'>{ticket.contactName}</p>
                      </td>
                      <td className='px-4 py-3 text-center'>
                        <CustomerTypeBadge
                          ctype={ticket.ctype as TicketCtype}
                          size='sm'
                        />
                      </td>
                      <td className='px-4 py-3 font-mono text-slate-600'>
                        {ticket.serviceNo}
                      </td>
                      <td className='px-4 py-3 text-center'>
                        <span
                          className={`inline-flex rounded-full border px-2 py-1 text-xs font-medium ${getAgeColor(ticket.ageHours)}`}
                        >
                          {ticket.age}
                        </span>
                      </td>
                      <td className='px-4 py-3 text-center'>
                        <Badge
                          color={
                            ticket.hasilVisit === 'ASSIGNED'
                              ? 'info'
                              : ticket.hasilVisit === 'ON_PROGRESS'
                                ? 'warning'
                                : 'dark'
                          }
                        >
                          {ticket.hasilVisit}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
