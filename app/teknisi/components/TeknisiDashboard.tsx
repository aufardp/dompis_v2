'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { Ticket } from '@/app/types/ticket';
import TicketDetailModal from './TicketDetailModal';
import TicketUpdateModal from './TicketUpdateModal';
import { fetchWithAuth } from '@/app/libs/fetcher';
import { formatDateTimeWIB } from '@/app/utils/datetime';
import { calculateTicketAge, getTicketAgeColor } from '@/app/utils/datetime';

interface Stats {
  assigned: number;
  onProgress: number;
  pending: number;
  closed: number;
}

export default function TeknisiDashboard() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [filter, setFilter] = useState<
    'all' | 'assigned' | 'on_progress' | 'pending' | 'closed'
  >('all');
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showUpdateModal, setShowUpdateModal] = useState(false);

  const fetchTickets = useCallback(async () => {
    try {
      setLoading(true);
      // Add timestamp to bypass cache and ensure fresh data
      const res = await fetchWithAuth(`/api/tickets?limit=100&_t=${Date.now()}`);
      if (!res) return;
      const data = await res.json();

      if (data.success && data.data?.data) {
        setTickets(data.data.data);
      }
    } catch (err) {
      console.error('Failed to fetch tickets:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  const stats = useMemo<Stats>(() => {
    return {
      assigned: tickets.filter((t) => t.hasilVisit === 'ASSIGNED').length,
      onProgress: tickets.filter((t) => t.hasilVisit === 'ON_PROGRESS').length,
      pending: tickets.filter((t) => t.hasilVisit === 'PENDING').length,
      closed: tickets.filter((t) => t.hasilVisit === 'CLOSE').length,
    };
  }, [tickets]);

  const filteredTickets = useMemo(() => {
    return tickets.filter((t) => {
      if (filter === 'all') return t.hasilVisit !== 'CLOSE';
      if (filter === 'assigned') return t.hasilVisit === 'ASSIGNED';
      if (filter === 'on_progress') return t.hasilVisit === 'ON_PROGRESS';
      if (filter === 'pending') return t.hasilVisit === 'PENDING';
      if (filter === 'closed') return t.hasilVisit === 'CLOSE';
      return true;
    });
  }, [tickets, filter]);

  const getMaxTtrHours = useCallback((ticket: Ticket): string => {
    switch (ticket.customerType) {
      case 'REGULER':
        return ticket.maxTtrReguler ?? '-';
      case 'HVC_GOLD':
        return ticket.maxTtrGold ?? '-';
      case 'HVC_PLATINUM':
        return ticket.maxTtrPlatinum ?? '-';
      case 'HVC_DIAMOND':
        return ticket.maxTtrDiamond ?? '-';
      default:
        return '-';
    }
  }, []);

  const handleTicketUpdated = useCallback(() => {
    fetchTickets();
    setSelectedTicket(null);
  }, [fetchTickets]);

  const handleSetFilter = useCallback((newFilter: typeof filter) => {
    setFilter(newFilter);
  }, []);

  const handleSelectTicket = useCallback((ticket: Ticket) => {
    setSelectedTicket(ticket);
    setShowDetailModal(true);
  }, []);

  const formatDate = useCallback((dateStr: string) => {
    return formatDateTimeWIB(dateStr);
  }, []);

  const getStatusBadge = useCallback((status: string) => {
    switch (status) {
      case 'ASSIGNED':
        return (
          <span className='rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-700'>
            Menunggu
          </span>
        );
      case 'ON_PROGRESS':
        return (
          <span className='rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-700'>
            Dikerjakan
          </span>
        );
      case 'PENDING':
        return (
          <span className='rounded-full bg-purple-100 px-3 py-1 text-xs font-medium text-purple-700'>
            Pending
          </span>
        );
      case 'CLOSE':
        return (
          <span className='rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700'>
            Selesai
          </span>
        );
      default:
        return (
          <span className='rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700'>
            {status}
          </span>
        );
    }
  }, []);

  return (
    <div className='min-h-screen bg-linear-to-br from-slate-50 to-slate-100 p-4 md:p-6 lg:p-8'>
      <div className='mx-auto max-w-5xl space-y-6'>
        {/* Header */}
        <div className='flex items-center justify-between'>
          <div>
            <h1 className='text-2xl font-bold text-slate-800'>My Tickets</h1>
            <p className='text-slate-500'>Manage your assigned tickets</p>
          </div>
        </div>

        {/* Stats Cards */}
        <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5'>
          <div className='rounded-xl border border-slate-200 bg-white p-5 shadow-sm'>
            <div className='text-3xl font-bold text-blue-600'>
              {loading ? '...' : stats.assigned + stats.onProgress}
            </div>
            <div className='text-sm text-slate-500'>Total Aktif</div>
          </div>
          <div className='rounded-xl border border-amber-200 bg-white p-5 shadow-sm'>
            <div className='text-3xl font-bold text-amber-600'>
              {loading ? '...' : stats.assigned}
            </div>
            <div className='text-sm text-slate-500'>Menunggu</div>
          </div>
          <div className='rounded-xl border border-blue-200 bg-white p-5 shadow-sm'>
            <div className='text-3xl font-bold text-blue-600'>
              {loading ? '...' : stats.onProgress}
            </div>
            <div className='text-sm text-slate-500'>Dikerjakan</div>
          </div>
          <div className='rounded-xl border border-purple-200 bg-white p-5 shadow-sm'>
            <div className='text-3xl font-bold text-purple-600'>
              {loading ? '...' : stats.pending}
            </div>
            <div className='text-sm text-slate-500'>Pending</div>
          </div>
          <div className='rounded-xl border border-green-200 bg-white p-5 shadow-sm'>
            <div className='text-3xl font-bold text-green-600'>
              {loading ? '...' : stats.closed}
            </div>
            <div className='text-sm text-slate-500'>Selesai</div>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className='flex flex-wrap gap-2 rounded-xl bg-white p-2 shadow-sm'>
          <button
            onClick={() => handleSetFilter('all')}
            className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-medium transition ${
              filter === 'all'
                ? 'bg-blue-600 text-white'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            Aktif
          </button>
          <button
            onClick={() => handleSetFilter('assigned')}
            className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-medium transition ${
              filter === 'assigned'
                ? 'bg-amber-500 text-white'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            Menunggu ({stats.assigned})
          </button>
          <button
            onClick={() => handleSetFilter('on_progress')}
            className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-medium transition ${
              filter === 'on_progress'
                ? 'bg-blue-600 text-white'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            Dikerjakan ({stats.onProgress})
          </button>
          <button
            onClick={() => handleSetFilter('pending')}
            className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-medium transition ${
              filter === 'pending'
                ? 'bg-purple-600 text-white'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            Pending ({stats.pending})
          </button>
          <button
            onClick={() => handleSetFilter('closed')}
            className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-medium transition ${
              filter === 'closed'
                ? 'bg-green-600 text-white'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            Selesai ({stats.closed})
          </button>
        </div>

        {/* Ticket List */}
        {loading ? (
          <div className='flex items-center justify-center py-16'>
            <div className='h-10 w-10 animate-spin rounded-full border-4 border-blue-600 border-t-transparent'></div>
          </div>
        ) : filteredTickets.length === 0 ? (
          <div className='rounded-xl border border-dashed border-slate-300 bg-white py-16 text-center'>
            <div className='mb-3 text-5xl'>
              {filter === 'closed' ? '✅' : '📋'}
            </div>
            <p className='text-lg font-medium text-slate-600'>
              {filter === 'closed'
                ? 'Belum ada ticket selesai'
                : 'Tidak ada ticket'}
            </p>
            <p className='text-sm text-slate-400'>
              {filter === 'closed'
                ? 'Ticket yang selesai akan muncul di sini'
                : 'Ticket akan muncul ketika ditugaskan kepada Anda'}
            </p>
          </div>
        ) : (
          <div className='grid gap-4'>
            {filteredTickets.map((ticket) => (
              <div
                key={ticket.idTicket}
                onClick={() => handleSelectTicket(ticket)}
                className='group cursor-pointer rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-all hover:-translate-y-1 hover:border-blue-400 hover:shadow-lg'
              >
                <div className='flex flex-col gap-4'>
                  {/* HEADER */}
                  <div className='flex items-start justify-between'>
                    <div>
                      <div className='flex flex-wrap items-center gap-2'>
                        <span className='font-mono text-sm font-semibold text-slate-500'>
                          {ticket.ticket}
                        </span>
                        {getStatusBadge(ticket.hasilVisit || '')}
                        {getStatusBadge(ticket.jenisTiket || '')}
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                            getTicketAgeColor(
                              ticket.reportedDate,
                              ticket.hasilVisit,
                              ticket.closedAt,
                            ) === 'green'
                              ? 'bg-green-100 text-green-700'
                              : getTicketAgeColor(
                                    ticket.reportedDate,
                                    ticket.hasilVisit,
                                    ticket.closedAt,
                                  ) === 'yellow'
                                ? 'bg-yellow-100 text-yellow-700'
                                : getTicketAgeColor(
                                      ticket.reportedDate,
                                      ticket.hasilVisit,
                                      ticket.closedAt,
                                    ) === 'orange'
                                  ? 'bg-orange-100 text-orange-700'
                                  : getTicketAgeColor(
                                        ticket.reportedDate,
                                        ticket.hasilVisit,
                                        ticket.closedAt,
                                      ) === 'red'
                                    ? 'bg-red-100 text-red-700'
                                    : 'bg-gray-100 text-gray-700'
                          }`}
                        >
                          {calculateTicketAge(
                            ticket.reportedDate,
                            ticket.hasilVisit,
                            ticket.closedAt,
                          )}
                        </span>
                      </div>

                      <h3 className='mt-2 line-clamp-2 text-lg font-semibold text-slate-800'>
                        {ticket.summary || ticket.symptom || 'Tanpa deskripsi'}
                      </h3>
                    </div>

                    <svg
                      className='h-5 w-5 text-slate-400 transition group-hover:text-blue-500'
                      fill='none'
                      stroke='currentColor'
                      viewBox='0 0 24 24'
                    >
                      <path
                        strokeLinecap='round'
                        strokeLinejoin='round'
                        strokeWidth={2}
                        d='M9 5l7 7-7 7'
                      />
                    </svg>
                  </div>

                  {/* CONTENT */}
                  <div className='grid grid-cols-1 gap-y-3 text-sm sm:grid-cols-2 sm:gap-x-6'>
                    <div>
                      <p className='text-xs tracking-wide text-slate-400 uppercase'>
                        Pelanggan
                      </p>
                      <p className='font-medium text-slate-700'>
                        {ticket.contactName || '-'}
                      </p>
                    </div>

                    <div>
                      <p className='text-xs tracking-wide text-slate-400 uppercase'>
                        Alamat
                      </p>
                      <p className='font-medium text-slate-700'>
                        {ticket.alamat || '-'}
                      </p>
                    </div>

                    <div>
                      <p className='text-xs tracking-wide text-slate-400 uppercase'>
                        Telepon
                      </p>
                      {ticket.contactPhone ? (
                        <a
                          href={`https://wa.me/${ticket.contactPhone.replace(/\D/g, '').replace(/^0/, '62')}`}
                          target='_blank'
                          rel='noopener noreferrer'
                          onClick={(e: React.MouseEvent) => e.stopPropagation()}
                          className='font-medium text-green-600 hover:text-green-700 hover:underline'
                        >
                          {ticket.contactPhone}
                        </a>
                      ) : (
                        <p className='font-medium text-slate-700'>-</p>
                      )}
                    </div>

                    <div>
                      <p className='text-xs tracking-wide text-slate-400 uppercase'>
                        Customer Type
                      </p>
                      <p className='font-medium text-slate-700'>
                        {ticket.customerType || '-'}
                      </p>
                    </div>

                    <div>
                      <p className='text-xs tracking-wide text-slate-400 uppercase'>
                        No. Service
                      </p>
                      <p className='font-medium text-slate-700'>
                        {ticket.serviceNo || '-'}
                      </p>
                    </div>

                    <div>
                      <p className='text-xs tracking-wide text-slate-400 uppercase'>
                        Jenis Layanan
                      </p>
                      <p className='font-medium text-slate-700'>
                        {ticket.serviceType || '-'}
                      </p>
                    </div>

                    <div>
                      <p className='text-xs tracking-wide text-slate-400 uppercase'>
                        Max TTR
                      </p>
                      <p className='font-medium text-slate-700'>
                        {getMaxTtrHours(ticket)}
                      </p>
                    </div>
                  </div>

                  {/* ACTION FOOTER */}
                  <div className='flex items-center justify-between border-t pt-4'>
                    <div className='text-xs text-slate-400'>
                      Klik untuk melihat detail
                    </div>

                    {ticket.hasilVisit === 'ASSIGNED' && (
                      <span className='rounded-lg bg-amber-100 px-3 py-1 text-xs font-medium text-amber-700'>
                        ⏳ Siap Dikerjakan
                      </span>
                    )}

                    {ticket.hasilVisit === 'ON_PROGRESS' && (
                      <span className='rounded-lg bg-blue-100 px-3 py-1 text-xs font-medium text-blue-700'>
                        🔧 Sedang Dikerjakan
                      </span>
                    )}

                    {ticket.hasilVisit === 'CLOSE' && (
                      <span className='rounded-lg bg-green-100 px-3 py-1 text-xs font-medium text-green-700'>
                        ✓ Selesai
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showDetailModal && selectedTicket && (
        <TicketDetailModal
          ticket={selectedTicket}
          onClose={() => {
            setShowDetailModal(false);
            setSelectedTicket(null);
          }}
          onUpdateClick={() => {
            setShowDetailModal(false);
            setShowUpdateModal(true);
          }}
          onUpdated={handleTicketUpdated}
        />
      )}

      {showUpdateModal && selectedTicket && (
        <TicketUpdateModal
          ticket={selectedTicket}
          onClose={() => {
            setShowUpdateModal(false);
            setSelectedTicket(null);
          }}
          onUpdated={() => {
            setShowUpdateModal(false);
            setSelectedTicket(null);
            handleTicketUpdated();
          }}
        />
      )}
    </div>
  );
}
