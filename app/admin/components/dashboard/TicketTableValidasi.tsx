'use client';

import { useState, useMemo } from 'react';
import Pagination from '../../../components/tables/Pagination';
import MobilePagination from '../../../components/tables/MobilePagination';
import { getJenisStyle } from '@/app/config/jenis-tiket';
import { getStatusColor } from '../../../components/tickets/helpers';
import { formatDateTimeFullWIB } from '@/app/utils/datetime';
import { AlertTriangle, Loader2 } from 'lucide-react';
import TableLoadingSkeleton from './TableLoadingSkeleton';
import { computeTtrCountdown } from '@/app/hooks/useTtrCountdown';
import { calculateAgeInHours } from '@/app/libs/tickets/sort';

interface TicketRow {
  idTicket?: number;
  ticket?: string;
  serviceNo?: string;
  contactName?: string | null;
  contactPhone?: string | null;
  bookingDate?: string | null;
  jenisTiket?: string;
  technicianName?: string | null;
  status_update?: string | null;
  statusUpdate?: string | null;
  status?: string;
  worklogSummary?: string | null;
  reportedDate?: string | null;
  closedAt?: string | null;
  maxTtrReguler?: string | null;
  maxTtrGold?: string | null;
  maxTtrPlatinum?: string | null;
  maxTtrDiamond?: string | null;
  guaranteeStatus?: string | null;
}

interface TicketTableValidasiProps {
  tickets: TicketRow[];
  loading?: boolean;
  isRefreshing?: boolean;
}

const MOBILE_PAGE_SIZE = 5;

export default function TicketTableValidasi({
  tickets,
  loading,
  isRefreshing,
}: TicketTableValidasiProps) {
  const [mobilePage, setMobilePage] = useState(1);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;

  const sortedTickets = useMemo(() => {
    return [...tickets].sort((a, b) => {
      const aId = a.idTicket ?? 0;
      const bId = b.idTicket ?? 0;
      return bId - aId;
    });
  }, [tickets]);

  const totalPages = Math.max(1, Math.ceil(sortedTickets.length / PAGE_SIZE));
  const pageTickets = sortedTickets.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE,
  );

  const mobileTotalPages = Math.max(
    1,
    Math.ceil(sortedTickets.length / MOBILE_PAGE_SIZE),
  );
  const mobilePageTickets = sortedTickets.slice(
    (mobilePage - 1) * MOBILE_PAGE_SIZE,
    mobilePage * MOBILE_PAGE_SIZE,
  );

  const renderTtrCountdown = (ticket: TicketRow) => {
    const ttr = computeTtrCountdown(ticket);
    if (!ttr) return <span className='text-xs text-(--text-secondary)'>-</span>;
    const colorClass =
      ttr.status === 'overdue'
        ? 'text-red-600 dark:text-red-400'
        : ttr.status === 'critical'
          ? 'text-red-500 dark:text-red-400'
          : ttr.status === 'warning'
            ? 'text-amber-600 dark:text-amber-400'
            : 'text-green-600 dark:text-green-400';
    return (
      <span className={`text-xs font-mono font-semibold ${colorClass}`}>
        {ttr.label}
      </span>
    );
  };

  const renderAgeSLA = (ticket: TicketRow) => {
    const hours = calculateAgeInHours(
      ticket.reportedDate,
      ticket.statusUpdate,
      ticket.closedAt,
      ticket.status,
    );
    const days = Math.floor(hours / 24);
    const hrs = Math.floor(hours % 24);
    const label = days > 0 ? `${days}d ${hrs}h` : `${hrs}h`;
    const severity =
      hours >= 48
        ? 'text-red-600 dark:text-red-400'
        : hours >= 24
          ? 'text-amber-600 dark:text-amber-400'
          : 'text-green-600 dark:text-green-400';
    return (
      <span className={`text-xs font-mono font-semibold ${severity}`}>
        {label}
      </span>
    );
  };

  return (
    <div className='space-y-3'>
      {/* Mobile */}
      <div className='block lg:hidden'>
        {loading && !isRefreshing ? (
          <p className='py-8 text-center text-(--text-secondary)'>Loading...</p>
        ) : sortedTickets.length === 0 ? (
          <div className='flex flex-col items-center justify-center gap-3 rounded-xl border border-(--border) bg-(--surface) p-8 text-(--text-secondary)'>
            <span>Tidak ada tiket untuk divalidasi</span>
          </div>
        ) : (
          <>
            <div className='mb-2 flex items-center justify-between px-1'>
              <p className='text-xs text-(--text-secondary)'>
                {(mobilePage - 1) * MOBILE_PAGE_SIZE + 1}–
                {Math.min(mobilePage * MOBILE_PAGE_SIZE, sortedTickets.length)}{' '}
                dari {sortedTickets.length} tiket
              </p>
              {mobileTotalPages > 1 && (
                <span className='text-xs font-semibold text-(--text-primary)'>
                  Halaman {mobilePage}/{mobileTotalPages}
                </span>
              )}
            </div>
            <div className='space-y-3'>
              {mobilePageTickets.map((ticket, idx) => (
                <div
                  key={ticket.idTicket ?? idx}
                  className='bg-surface rounded-xl border border-(--border) p-4'
                >
                  <div>
                    <p className='font-mono text-sm font-bold text-(--text-primary)'>
                      {ticket.ticket}
                    </p>
                    <p className='text-xs text-(--text-secondary)'>
                      {ticket.contactName || '-'}
                    </p>
                  </div>
                  <div className='mt-2 flex flex-wrap items-center gap-2 text-xs'>
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
                    <span
                      className={
                        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ' +
                        getStatusColor(ticket.status ?? '')
                      }
                    >
                      {ticket.status === 'closed' ? (
                        ticket.status
                      ) : (
                        <>
                          <Loader2 size={10} className='animate-spin' />
                          {ticket.status ?? '-'}
                        </>
                      )}
                    </span>
                  </div>
                  <div className='mt-2 grid grid-cols-2 gap-2 text-xs'>
                    <div>
                      <p className='text-[10px] text-(--text-secondary)'>
                        Max TTR
                      </p>
                      <p>{renderTtrCountdown(ticket)}</p>
                    </div>
                    <div>
                      <p className='text-[10px] text-(--text-secondary)'>
                        Age / SLA
                      </p>
                      <p>{renderAgeSLA(ticket)}</p>
                    </div>
                  </div>
                  <div className='mt-3 flex items-center justify-end'>
                    <div className='inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 dark:border-amber-400/20 dark:bg-amber-500/15'>
                      <AlertTriangle
                        size={12}
                        className='text-amber-600 dark:text-amber-400'
                      />
                      <span className='text-[10px] font-semibold text-amber-700 dark:text-amber-400'>
                        Menunggu Dorong Lensa
                      </span>
                    </div>
                  </div>
                </div>
              ))}
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
              {sortedTickets.length} tiket perlu validasi
            </p>
            <span className='text-[10px] text-(--text-muted)'>
              status_update = close, status ≠ closed (termasuk BACKEND)
            </span>
          </div>

          {loading && !isRefreshing ? (
            <TableLoadingSkeleton rows={6} cols={12} />
          ) : sortedTickets.length === 0 ? (
            <div className='flex flex-col items-center justify-center gap-3 rounded-2xl border border-(--border) bg-(--surface) p-12 text-(--text-secondary)'>
              <span className='text-sm font-medium'>
                Tidak ada tiket untuk divalidasi
              </span>
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
                      <th className='px-3 py-2.5 text-center'>Booking Date</th>
                      <th className='px-3 py-2.5 text-center'>Type</th>
                      <th className='px-3 py-2.5 text-center'>Max TTR</th>
                      <th className='px-3 py-2.5 text-center'>Age / SLA</th>
                      <th className='px-3 py-2.5 text-center'>
                        Status Dompis
                      </th>
                      <th className='px-3 py-2.5 text-center'>
                        Status Insera
                      </th>
                      <th className='px-3 py-2.5 text-center'>Teknisi</th>
                      <th className='px-3 py-2.5 text-center'>Status</th>
                    </tr>
                  </thead>
                  <tbody className='divide-y divide-(--border)'>
                    {pageTickets.map((ticket, idx) => {
                      const rowNum = (page - 1) * PAGE_SIZE + idx + 1;
                      return (
                        <tr
                          key={ticket.idTicket ?? idx}
                          className='transition-colors hover:bg-(--surface-2)'
                        >
                          <td className='px-3 py-3 text-center'>
                            <span className='font-mono text-sm font-bold text-(--text-secondary)'>
                              {rowNum}
                            </span>
                          </td>
                          <td className='px-3 py-3 text-center'>
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
                            <span className='text-xs text-(--text-secondary)'>
                              {ticket.bookingDate
                                ? formatDateTimeFullWIB(
                                    ticket.bookingDate,
                                  ).split(', ')[0]
                                : '-'}
                            </span>
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
                              <span className='text-xs text-(--text-secondary) italic'>
                                —
                              </span>
                            )}
                          </td>
                          <td className='px-3 py-3 text-center'>
                            {renderTtrCountdown(ticket)}
                          </td>
                          <td className='px-3 py-3 text-center'>
                            {renderAgeSLA(ticket)}
                          </td>
                          <td className='px-3 py-3 text-center uppercase'>
                            <span
                              className={
                                'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ' +
                                getStatusColor(
                                  ticket.status_update ??
                                    ticket.statusUpdate ??
                                    '',
                                )
                              }
                            >
                              {ticket.status_update ??
                                ticket.statusUpdate ??
                                '-'}
                            </span>
                          </td>
                          <td className='px-3 py-3 text-center uppercase'>
                            <span
                              className={
                                'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ' +
                                getStatusColor(ticket.status ?? '')
                              }
                            >
                              {ticket.status === 'closed' ? (
                                ticket.status
                              ) : (
                                <>
                                  <Loader2 size={12} className='animate-spin' />
                                  {ticket.status ?? '-'}
                                </>
                              )}
                            </span>
                          </td>
                          <td className='px-3 py-3 text-center'>
                            <span className='text-xs text-(--text-primary)'>
                              {ticket.technicianName || '-'}
                            </span>
                          </td>
                          <td className='px-3 py-3 text-center'>
                            <div className='inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 dark:border-amber-400/20 dark:bg-amber-500/15'>
                              <AlertTriangle
                                size={12}
                                className='text-amber-600 dark:text-amber-400'
                              />
                              <span className='text-xs font-semibold text-amber-700 dark:text-amber-400'>
                                Menunggu Dorong Lensa
                              </span>
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
    </div>
  );
}
