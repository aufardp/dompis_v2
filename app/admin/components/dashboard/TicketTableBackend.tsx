'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import Pagination from '../../../components/tables/Pagination';
import MobilePagination from '../../../components/tables/MobilePagination';
import TicketDetailDrawer from './TicketDetailDrawer';
import { ChevronDown, ChevronUp, UserPlus, Eye } from 'lucide-react';
import { fetchWithAuth } from '@/app/libs/fetcher';
import {
  computeTicketRanks,
  calculateAgeInHours,
  sortByPriority,
} from '@/app/libs/tickets/sort';
import { getJenisStyle } from '@/app/config/jenis-tiket';
import { getStatusColor } from '../../../components/tickets/helpers';
import { formatDateTimeFullWIB } from '@/app/utils/datetime';
import { isTicketClosed } from '@/app/libs/ticket-utils';
import { computeTtrCountdown } from '@/app/hooks/useTtrCountdown';
import TableLoadingSkeleton from './TableLoadingSkeleton';
import MaxTtrCell from './MaxTtrCell';
import TtrCountdownBadge from './TtrCountdownBadge';

interface TicketRow {
  idTicket?: number;
  ticket?: string;
  serviceNo?: string;
  ticketIdGamas?: string | null;
  contactName?: string | null;
  contactPhone?: string | null;
  alamat?: string | null;
  bookingDate?: string | null;
  ctype?: string;
  customerType?: string;
  summary?: string;
  jenisTiket?: string;
  workzone?: string;
  technicianName?: string | null;
  teknisiUserId?: number | null;
  hasilVisit?: string | null;
  statusUpdate?: string | null;
  status_update?: string | null;
  closedAt?: string | null;
  reportedDate?: string | null;
  status?: string;
  maxTtrReguler?: string | null;
  maxTtrGold?: string | null;
  maxTtrPlatinum?: string | null;
  maxTtrDiamond?: string | null;
  flaggingManja?: string | null;
  guaranteeStatus?: string | null;
}

interface TicketTableBackendProps {
  tickets: TicketRow[];
  loading?: boolean;
  isRefreshing?: boolean;
  onAssign?: (ticketId: number | string) => void;
}

const MOBILE_PAGE_SIZE = 5;

export default function TicketTableBackend({
  tickets,
  loading,
  isRefreshing,
  onAssign,
}: TicketTableBackendProps) {
  const [mobilePage, setMobilePage] = useState(1);
  const [page, setPage] = useState(1);
  const [expandedTicketId, setExpandedTicketId] = useState<number | null>(null);
  const [drawerDetail, setDrawerDetail] = useState<any | null>(null);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [drawerError, setDrawerError] = useState<string | null>(null);
  const PAGE_SIZE = 10;

  const sortedTickets = useMemo(() => {
    return sortByPriority(tickets);
  }, [tickets]);

  const totalPages = Math.max(1, Math.ceil(sortedTickets.length / PAGE_SIZE));
  const pageTickets = sortedTickets.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE,
  );

  const mobileTotalPages = Math.max(1, Math.ceil(sortedTickets.length / MOBILE_PAGE_SIZE));
  const mobilePageTickets = sortedTickets.slice(
    (mobilePage - 1) * MOBILE_PAGE_SIZE,
    mobilePage * MOBILE_PAGE_SIZE,
  );

  const ticketRanks = useMemo(() => computeTicketRanks(tickets), [tickets]);

  // Fetch ticket detail when drawer opens
  useEffect(() => {
    if (!expandedTicketId) {
      setDrawerDetail(null);
      setDrawerError(null);
      return;
    }

    setDrawerLoading(true);
    setDrawerError(null);

    fetchWithAuth(`/api/tickets/${expandedTicketId}/detail`)
      .then((res) => (res ? res.json().catch(() => null) : null))
      .then((data) => {
        if (!data) return;
        if (data.success) {
          setDrawerDetail(data.data);
        } else {
          setDrawerError(data.message || 'Gagal memuat detail tiket');
        }
      })
      .catch(() => setDrawerError('Terjadi kesalahan jaringan'))
      .finally(() => setDrawerLoading(false));
  }, [expandedTicketId]);

  const handleAssignClick = useCallback(
    (ticketId: number | string) => {
      onAssign?.(ticketId);
    },
    [onAssign],
  );

  const handleDetailClick = useCallback((ticketId: number) => {
    setExpandedTicketId(ticketId);
  }, []);

  return (
    <div className='space-y-3'>
      {/* Mobile */}
      <div className='block lg:hidden'>
        {loading && !isRefreshing ? (
          <p className='py-8 text-center text-(--text-secondary)'>Loading...</p>
        ) : sortedTickets.length === 0 ? (
          <div className='flex flex-col items-center justify-center gap-3 rounded-xl border border-(--border) bg-(--surface) p-8 text-(--text-secondary)'>
            <span>Tidak ada tiket backend</span>
          </div>
        ) : (
          <>
            <div className='mb-2 flex items-center justify-between px-1'>
              <p className='text-xs text-(--text-secondary)'>
                {(mobilePage - 1) * MOBILE_PAGE_SIZE + 1}–
                {Math.min(mobilePage * MOBILE_PAGE_SIZE, sortedTickets.length)} dari{' '}
                {sortedTickets.length} tiket
              </p>
              {mobileTotalPages > 1 && (
                <span className='text-xs font-semibold text-(--text-primary)'>
                  Halaman {mobilePage}/{mobileTotalPages}
                </span>
              )}
            </div>
            <div className='space-y-3'>
              {mobilePageTickets.map((ticket, idx) => {
                const ticketId = ticket.idTicket ?? idx;
                return (
                  <div
                    key={ticketId}
                    className='bg-surface rounded-xl border border-(--border) p-4'
                  >
                    <div className='flex items-center justify-between'>
                      <div>
                        <p className='font-mono text-sm font-bold text-(--text-primary)'>
                          {ticket.ticket}
                        </p>
                        <p className='text-xs text-(--text-secondary)'>
                          {ticket.contactName || '-'}
                        </p>
                      </div>
                      <button
                        onClick={() => handleDetailClick(ticketId as number)}
                        className='flex items-center gap-1 rounded-lg border border-(--border) bg-(--surface-2) px-2.5 py-1.5 text-xs font-semibold text-(--text-secondary) hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-500/15 dark:hover:text-blue-400'
                      >
                        <Eye size={12} />
                      </button>
                    </div>
                    <div className='mt-2 flex flex-wrap gap-2 text-xs'>
                      <span className='font-mono text-(--text-secondary)'>
                        {ticket.serviceNo || '-'}
                      </span>
                      {ticket.jenisTiket && (
                        <span
                          className={
                            getJenisStyle(ticket.jenisTiket) +
                            ' rounded-full px-2 py-0.5 text-[10px] font-semibold'
                          }
                        >
                          {ticket.jenisTiket}
                        </span>
                      )}
                      {ticket.workzone && (
                        <span className='text-(--text-secondary)'>📍 {ticket.workzone}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            {mobileTotalPages > 1 && (
              <div className='mt-3'>
                <MobilePagination
                  currentPage={mobilePage}
                  totalPages={mobileTotalPages}
                  total={sortedTickets.length}
                  pageSize={MOBILE_PAGE_SIZE}
                  onPageChange={setMobilePage}
                />
              </div>
            )}
          </>
        )}
      </div>

      {/* Desktop */}
      <div className='hidden lg:block'>
        <div className='bg-surface overflow-hidden rounded-2xl border border-(--border) shadow-sm'>
          {/* Toolbar */}
          <div className='bg-surface-2 flex items-center justify-between border-b border-(--border) px-4 py-2'>
            <p className='text-xs text-(--text-secondary)'>
              {sortedTickets.length} tiket backend
            </p>
            <span className='text-[10px] text-(--text-muted)'>
              status_update = close, status = BACKEND, worklog contains "Tech Closed"
            </span>
          </div>

          {loading && !isRefreshing ? (
            <TableLoadingSkeleton rows={6} cols={10} />
          ) : sortedTickets.length === 0 ? (
            <div className='flex flex-col items-center justify-center gap-3 rounded-2xl border border-(--border) bg-(--surface) p-12 text-(--text-secondary)'>
              <span className='text-sm font-medium'>Tidak ada tiket backend</span>
            </div>
          ) : (
            <>
              <div className='overflow-x-auto'>
                <table className='w-full text-sm'>
                  <thead className='bg-surface-2 text-xs font-semibold tracking-wide text-(--text-secondary) uppercase'>
                    <tr>
                      <th className='w-12 px-3 py-2.5 text-center'>#</th>
                      <th className='px-3 py-2.5 text-center'>Ticket</th>
                      <th className='px-3 py-2.5 text-center'>Service</th>
                      <th className='px-3 py-2.5 text-center'>Customer</th>
                      <th className='px-3 py-2.5 text-center'>Jenis</th>
                      <th className='px-3 py-2.5 text-center'>Workzone</th>
                      <th className='px-3 py-2.5 text-center'>Booking Date</th>
                      <th className='px-3 py-2.5 text-center'>Max TTR</th>
                      <th className='px-3 py-2.5 text-center'>Age / SLA</th>
                      <th className='px-3 py-2.5 text-center'>Status</th>
                      <th className='px-3 py-2.5 text-center'>Aksi</th>
                    </tr>
                  </thead>
                  <tbody className='divide-y divide-(--border)'>
                    {pageTickets.map((ticket) => {
                      const ticketId = ticket.idTicket ?? ticket.ticket;
                      const ticketInfo = ticketRanks.get(ticket.idTicket ?? -1);
                      const ttrCountdown = computeTtrCountdown(ticket);
                      const isClosed = isTicketClosed(ticket.status_update ?? ticket.statusUpdate);
                      const techInitial = ticket.technicianName?.charAt(0).toUpperCase();

                      return (
                        <tr
                          key={ticketId}
                          className='transition-colors hover:bg-(--surface-2)'
                        >
                          <td className='px-3 py-3 text-center'>
                            <span className='font-mono text-sm font-bold text-(--text-secondary)'>
                              #{ticketInfo?.rank ?? '-'}
                            </span>
                          </td>
                          <td className='px-3 py-3'>
                            <span className='font-mono text-xs font-bold text-(--text-primary)'>
                              {ticket.ticket}
                            </span>
                          </td>
                          <td className='px-3 py-3 text-center'>
                            <span className='font-mono text-xs text-(--text-primary)'>
                              {ticket.serviceNo || '-'}
                            </span>
                          </td>
                          <td className='px-3 py-3'>
                            <p className='text-sm font-semibold text-(--text-primary) uppercase'>
                              {ticket.contactName || '-'}
                            </p>
                            <p className='text-[10px] text-(--text-secondary)'>
                              {ticket.contactPhone || '-'}
                            </p>
                          </td>
                          <td className='px-3 py-3 text-center'>
                            {ticket.jenisTiket ? (
                              <span
                                className={
                                  getJenisStyle(ticket.jenisTiket) +
                                  ' rounded-full px-2.5 py-0.5 text-[11px] font-semibold'
                                }
                              >
                                {ticket.jenisTiket}
                              </span>
                            ) : (
                              <span className='text-xs text-(--text-secondary) italic'>—</span>
                            )}
                          </td>
                          <td className='px-3 py-3 text-center'>
                            <span className='text-xs font-semibold text-(--text-primary)'>
                              {ticket.workzone ?? '-'}
                            </span>
                          </td>
                          <td className='px-3 py-3 text-center'>
                            <span className='text-xs text-(--text-secondary)'>
                              {ticket.bookingDate
                                ? formatDateTimeFullWIB(ticket.bookingDate).split(', ')[0]
                                : '-'}
                            </span>
                          </td>
                          <td className='px-3 py-3 text-center'>
                            <MaxTtrCell ticket={ticket} />
                          </td>
                          <td className='px-3 py-3 text-center'>
                            <div className='inline-flex flex-col items-center gap-0.5'>
                              <span className='rounded-full bg-(--surface-2) px-2.5 py-0.5 text-[11px] font-bold text-(--text-secondary)'>
                                {ticketInfo?.ageFormatted ?? '-'}
                              </span>
                              <TtrCountdownBadge ticket={ticket} />
                            </div>
                          </td>
                          <td className='px-3 py-3 text-center uppercase'>
                            <span
                              className={
                                'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ' +
                                getStatusColor(ticket.status_update ?? ticket.statusUpdate ?? '')
                              }
                            >
                              {ticket.status_update ?? ticket.statusUpdate ?? '-'}
                            </span>
                          </td>
                          <td className='px-3 py-3 text-center'>
                            <div className='inline-flex overflow-hidden rounded-xl border border-(--border) shadow-sm'>
                              <button
                                onClick={() => handleDetailClick(ticketId as number)}
                                title='Lihat Detail'
                                className='flex items-center gap-1.5 border-r border-(--border) px-3 py-1.5 text-xs font-semibold text-(--text-secondary) transition hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-500/15 dark:hover:text-blue-400'
                              >
                                <Eye size={13} />
                              </button>
                              {!isClosed && (
                                <button
                                  onClick={() => handleAssignClick(ticketId ?? '')}
                                  title={ticket.teknisiUserId ? 'Reassign Teknisi' : 'Assign Teknisi'}
                                  className={
                                    'flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white transition ' +
                                    (ticket.teknisiUserId
                                      ? 'bg-amber-500 hover:bg-amber-600'
                                      : 'bg-blue-600 hover:bg-blue-700')
                                  }
                                >
                                  <UserPlus size={12} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {totalPages > 1 && (
                <div className='bg-surface flex flex-col items-center gap-3 border-t border-(--border) px-5 py-3 sm:flex-row sm:justify-between'>
                  <p className='text-xs text-(--text-secondary)'>
                    Showing{' '}
                    <span className='font-semibold text-(--text-primary)'>
                      {(page - 1) * PAGE_SIZE + 1}–
                      {Math.min(page * PAGE_SIZE, sortedTickets.length)}
                    </span>{' '}
                    of{' '}
                    <span className='font-semibold text-(--text-primary)'>
                      {sortedTickets.length}
                    </span>{' '}
                    tiket
                  </p>
                  <Pagination
                    currentPage={page}
                    totalPages={totalPages}
                    onPageChange={setPage}
                  />
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Detail Drawer */}
      <TicketDetailDrawer
        open={expandedTicketId !== null}
        onClose={() => {
          setExpandedTicketId(null);
          setDrawerDetail(null);
        }}
        ticket={drawerDetail}
        loading={drawerLoading}
        error={drawerError}
        onRetry={() => {
          if (expandedTicketId) {
            setDrawerDetail(null);
            setDrawerError(null);
            setDrawerLoading(true);
            fetchWithAuth(`/api/tickets/${expandedTicketId}/detail`)
              .then((r) => (r ? r.json().catch(() => null) : null))
              .then((d) => {
                if (d?.success) setDrawerDetail(d.data);
              })
              .catch(() => setDrawerError('Gagal retry'))
              .finally(() => setDrawerLoading(false));
          }
        }}
      />
    </div>
  );
}
