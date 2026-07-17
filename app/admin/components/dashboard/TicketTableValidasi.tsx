'use client';

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import Pagination from '../../../components/tables/Pagination';
import MobilePagination from '../../../components/tables/MobilePagination';
import { getJenisStyle } from '@/app/config/jenis-tiket';
import { getStatusColor } from '../../../components/tickets/helpers';
import { formatDateTimeFullWIB } from '@/app/utils/datetime';
import { AlertTriangle, Loader2, RotateCcw } from 'lucide-react';
import { computeTtrCountdown } from '@/app/hooks/useTtrCountdown';
import { calculateAgeInHours } from '@/app/libs/tickets/sort';
import ReopenTicketModal from './ReopenTicketModal';
import { useAdminToast } from './admin-toast';

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
  validationReason?: string | null;
}

interface TicketTableValidasiProps {
  tickets: TicketRow[];
  pagination?: {
    currentPage: number;
    totalPages: number;
    total: number;
    limit: number;
    onPageChange: (page: number) => void;
  };
  loading?: boolean;
  isRefreshing?: boolean;
  highlightQuery?: string;
  searching?: boolean;
}

const MOBILE_PAGE_SIZE = 5;

function TicketTableValidasiLoadingMobile({
  loadingLabel = 'Loading validation tickets',
}: {
  loadingLabel?: string;
}) {
  return (
    <phantom-ui
      suppressHydrationWarning
      fallback-radius={8}
      loading
      animation='shimmer'
      reveal={0.12}
      loading-label={loadingLabel}
    >
      <div className='space-y-4'>
        <div className='mb-3 flex items-center justify-between px-1'>
          <div className='h-3.5 w-28 rounded-full bg-slate-200 dark:bg-slate-800' />
          <div className='h-3.5 w-20 rounded-full bg-slate-200 dark:bg-slate-800' />
        </div>
        {Array.from({ length: 5 }).map((_, index) => (
          <div
            key={index}
            className='rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950'
          >
            <div className='space-y-4'>
              <div className='flex items-start justify-between gap-4'>
                <div className='space-y-3'>
                  <div className='h-3.5 w-24 rounded-full bg-slate-200 dark:bg-slate-800' />
                  <div className='h-3 w-40 rounded-full bg-slate-100 dark:bg-slate-800/70' />
                </div>
                <div className='h-7 w-16 rounded-full bg-slate-100 dark:bg-slate-800' />
              </div>
              <div className='grid grid-cols-2 gap-3'>
                {Array.from({ length: 4 }).map((__, cellIndex) => (
                  <div
                    key={cellIndex}
                    className='rounded-xl border border-slate-100 bg-slate-50 px-3 py-3 dark:border-slate-800 dark:bg-slate-900/60'
                  >
                    <div className='h-2.5 w-12 rounded-full bg-slate-200 dark:bg-slate-800' />
                    <div className='mt-2 h-3 w-20 rounded-full bg-slate-100 dark:bg-slate-800/70' />
                  </div>
                ))}
              </div>
              <div className='h-11 rounded-2xl bg-slate-100 dark:bg-slate-800' />
            </div>
          </div>
        ))}
      </div>
    </phantom-ui>
  );
}

function TicketTableValidasiLoadingDesktop({
  loadingLabel = 'Loading validation table',
}: {
  loadingLabel?: string;
}) {
  return (
    <phantom-ui
      suppressHydrationWarning
      fallback-radius={8}
      loading
      animation='shimmer'
      reveal={0.12}
      loading-label={loadingLabel}
    >
      <div className='rounded-2xl border border-(--border) bg-(--surface) shadow-sm'>
        <div className='flex items-center justify-between border-b border-(--border) bg-(--surface-2) px-4 py-3'>
          <div className='h-3.5 w-40 rounded-full bg-slate-200 dark:bg-slate-800' />
          <div className='h-3.5 w-48 rounded-full bg-slate-100 dark:bg-slate-800/70' />
        </div>
        <div className='overflow-x-auto'>
          <table className='w-full text-sm'>
            <thead className='bg-surface-2 text-xs font-semibold tracking-wide text-(--text-secondary) uppercase'>
              <tr>
                {Array.from({ length: 14 }).map((_, index) => (
                  <th key={index} className='px-3 py-3 text-center'>
                    <div className='mx-auto h-3 w-16 rounded-full bg-slate-200 dark:bg-slate-800' />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className='divide-y divide-(--border)'>
              {Array.from({ length: 6 }).map((_, rowIndex) => (
                <tr
                  key={rowIndex}
                  className='odd:bg-white even:bg-slate-50/60 dark:odd:bg-slate-950 dark:even:bg-slate-900/60'
                >
                  {Array.from({ length: 14 }).map((__, cellIndex) => (
                    <td key={cellIndex} className='px-3 py-5'>
                      <div className='space-y-3'>
                        <div className='h-3 w-5/6 rounded-full bg-slate-200 dark:bg-slate-800' />
                        <div className='h-3 w-2/3 rounded-full bg-slate-100 dark:bg-slate-800/70' />
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </phantom-ui>
  );
}

export default function TicketTableValidasi({
  tickets,
  pagination,
  loading,
  isRefreshing,
  highlightQuery,
  searching = false,
}: TicketTableValidasiProps) {
  const [mobilePage, setMobilePage] = useState(1);
  const [page, setPage] = useState(1);
  const [reopenModalOpen, setReopenModalOpen] = useState(false);
  const [reopenLoading, setReopenLoading] = useState(false);
  const [reopenTarget, setReopenTarget] = useState<TicketRow | null>(null);
  const { showSuccess, showError } = useAdminToast();
  const PAGE_SIZE = 10;
  const normalizedHighlightQuery = (highlightQuery ?? '').trim().toLowerCase();
  const rootRef = useRef<HTMLDivElement>(null);

  const sortedTickets = useMemo(() => {
    return [...tickets].sort((a, b) => {
      const aId = a.idTicket ?? 0;
      const bId = b.idTicket ?? 0;
      return bId - aId;
    });
  }, [tickets]);

  const isServerPaginated = Boolean(pagination);
  const effectivePage = pagination?.currentPage ?? page;
  const effectiveLimit = pagination?.limit ?? PAGE_SIZE;
  const effectiveTotal = pagination?.total ?? sortedTickets.length;
  const totalPages =
    pagination?.totalPages ??
    Math.max(1, Math.ceil(sortedTickets.length / PAGE_SIZE));
  const pageTickets = isServerPaginated
    ? sortedTickets
    : sortedTickets.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const mobileEffectivePage = pagination?.currentPage ?? mobilePage;
  const mobileEffectiveLimit = pagination?.limit ?? MOBILE_PAGE_SIZE;
  const mobileTotalPages =
    pagination?.totalPages ??
    Math.max(1, Math.ceil(sortedTickets.length / MOBILE_PAGE_SIZE));
  const mobilePageTickets = isServerPaginated
    ? sortedTickets
    : sortedTickets.slice(
        (mobilePage - 1) * MOBILE_PAGE_SIZE,
        mobilePage * MOBILE_PAGE_SIZE,
      );

  const isHighlighted = useCallback(
    (ticket: TicketRow) => {
      if (!normalizedHighlightQuery) return false;
      const haystack = [
        ticket.ticket,
        ticket.serviceNo,
        ticket.contactName,
        ticket.contactPhone,
        ticket.jenisTiket,
        ticket.worklogSummary,
        ticket.status,
        ticket.status_update,
      ]
        .map((value) => String(value ?? '').toLowerCase())
        .filter(Boolean);

      return haystack.some((value) => value.includes(normalizedHighlightQuery));
    },
    [normalizedHighlightQuery],
  );

  useEffect(() => {
    if (!normalizedHighlightQuery) return;
    if (loading || isRefreshing) return;

    const root = rootRef.current;
    if (!root) return;

    const hit = root.querySelector<HTMLElement>(
      '[data-search-highlight="true"]',
    );
    if (!hit) return;

    const timer = window.requestAnimationFrame(() => {
      hit.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });

    return () => window.cancelAnimationFrame(timer);
  }, [
    loading,
    isRefreshing,
    normalizedHighlightQuery,
    page,
    mobilePage,
    pageTickets.length,
    mobilePageTickets.length,
  ]);

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
      <span className={`font-mono text-xs font-semibold ${colorClass}`}>
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
      <span className={`font-mono text-xs font-semibold ${severity}`}>
        {label}
      </span>
    );
  };

  const handleReopenClick = (ticket: TicketRow) => {
    setReopenTarget(ticket);
    setReopenModalOpen(true);
  };

  const handleReopenConfirm = async () => {
    if (!reopenTarget?.idTicket || reopenLoading) return;

    setReopenLoading(true);
    try {
      const res = await fetch('/api/tickets/reopen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticketId: reopenTarget.idTicket }),
      });
      const payload = await res.json().catch(() => null);

      if (!res.ok || !payload?.success) {
        showError(
          'Reopen ticket gagal',
          payload?.message ?? 'Ticket tidak berhasil direopen.',
        );
        return;
      }

      showSuccess(
        'Reopen ticket berhasil',
        reopenTarget?.ticket
          ? `Ticket ${reopenTarget.ticket} kembali ke open.`
          : 'Ticket kembali ke open.',
        { persist: true },
      );
      window.location.reload();
    } catch (e) {
      console.error('Reopen ticket error:', e);
      showError(
        'Reopen ticket gagal',
        'Terjadi kesalahan saat memproses reopen ticket.',
      );
    } finally {
      setReopenLoading(false);
      setReopenModalOpen(false);
      setReopenTarget(null);
    }
  };

  return (
    <div ref={rootRef} className='space-y-3'>
      {/* Mobile */}
      <div className='block lg:hidden'>
        {loading && !isRefreshing ? (
          <TicketTableValidasiLoadingMobile
            loadingLabel={searching ? 'Searching tickets' : undefined}
          />
        ) : sortedTickets.length === 0 ? (
          <div className='flex flex-col items-center justify-center gap-3 rounded-xl border border-(--border) bg-(--surface) p-8 text-(--text-secondary)'>
            <span>Tidak ada tiket untuk divalidasi</span>
          </div>
        ) : (
          <>
            <div className='mb-2 flex items-center justify-between px-1'>
              <p className='text-xs text-(--text-secondary)'>
                {(mobileEffectivePage - 1) * mobileEffectiveLimit + 1}–
                {Math.min(
                  mobileEffectivePage * mobileEffectiveLimit,
                  effectiveTotal,
                )}{' '}
                dari {effectiveTotal} tiket
              </p>
              {mobileTotalPages > 1 && (
                <span className='text-xs font-semibold text-(--text-primary)'>
                  Halaman {mobileEffectivePage}/{mobileTotalPages}
                </span>
              )}
            </div>
            <div className='space-y-3'>
              {mobilePageTickets.map((ticket, idx) => (
                <div
                  key={ticket.idTicket ?? idx}
                  data-search-highlight={
                    isHighlighted(ticket) ? 'true' : undefined
                  }
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
                  {ticket.validationReason && (
                    <div className='mt-1'>
                      <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        ticket.validationReason === 'Status update: close'
                          ? 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400'
                          : 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400'
                      }`}>
                        {ticket.validationReason}
                      </span>
                    </div>
                  )}
                  <div className='mt-3 flex items-center justify-between'>
                    <div className='max-w-[50%] truncate'>
                      <p className='text-[10px] text-(--text-secondary)'>
                        Worklog
                      </p>
                      <p className='truncate text-xs text-(--text-primary)'>
                        {ticket.worklogSummary || '-'}
                      </p>
                    </div>
                    <button
                      type='button'
                      onClick={() => handleReopenClick(ticket)}
                      className='inline-flex items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-1.5 text-sky-700 transition hover:bg-sky-100 dark:border-sky-400/20 dark:bg-sky-500/15 dark:text-sky-300 dark:hover:bg-sky-500/25'
                    >
                      <RotateCcw size={12} />
                      <span className='text-[10px] font-semibold'>Reopen</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
            {mobileTotalPages > 1 && (
              <div className='mt-3'>
                <MobilePagination
                  currentPage={mobileEffectivePage}
                  totalPages={mobileTotalPages}
                  total={effectiveTotal}
                  pageSize={mobileEffectiveLimit}
                  onPageChange={pagination?.onPageChange ?? setMobilePage}
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
              {effectiveTotal} tiket perlu validasi
            </p>
            <span className='text-[10px] text-(--text-muted)'>
              status_update = close, status ≠ closed (termasuk BACKEND)
            </span>
          </div>

          {loading && !isRefreshing ? (
            <TicketTableValidasiLoadingDesktop
              loadingLabel={searching ? 'Searching tickets' : undefined}
            />
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
                      <th className='px-3 py-2.5 text-center'>Status Dompis</th>
                      <th className='px-3 py-2.5 text-center'>Status Insera</th>
                      <th className='px-3 py-2.5 text-center'>Teknisi</th>
                      <th className='px-3 py-2.5 text-center'>Worklog</th>
                      <th className='px-3 py-2.5 text-center'>Aksi</th>
                      <th className='px-3 py-2.5 text-center'>Status</th>
                    </tr>
                  </thead>
                  <tbody className='divide-y divide-(--border)'>
                    {pageTickets.map((ticket, idx) => {
                      const rowNum =
                        (effectivePage - 1) * effectiveLimit + idx + 1;
                      return (
                        <tr
                          key={ticket.idTicket ?? idx}
                          data-search-highlight={
                            isHighlighted(ticket) ? 'true' : undefined
                          }
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
                            <span className='inline-block max-w-[120px] truncate align-middle text-xs text-(--text-secondary)'>
                              {ticket.worklogSummary || '-'}
                            </span>
                          </td>
                          <td className='px-3 py-3 text-center'>
                            <button
                              type='button'
                              onClick={() => handleReopenClick(ticket)}
                              className='inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-sky-600 px-3 py-1.5 font-semibold text-white shadow-sm transition hover:bg-sky-700 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400'
                            >
                              <RotateCcw size={12} />
                              <span className='text-xs'>Reopen</span>
                            </button>
                          </td>
                          <td className='px-3 py-3 text-center'>
                            <div className='flex flex-col items-center gap-2'>
                              <div className='inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 dark:border-amber-400/20 dark:bg-amber-500/15'>
                                <AlertTriangle
                                  size={12}
                                  className='text-amber-600 dark:text-amber-400'
                                />
                                <span className='text-xs font-semibold text-amber-700 dark:text-amber-400'>
                                  Menunggu Dorong Insera
                                </span>
                              </div>
                              {ticket.validationReason && (
                                <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${
                                  ticket.validationReason === 'Status update: close'
                                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400'
                                    : 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400'
                                }`}>
                                  {ticket.validationReason}
                                </span>
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
                      {(effectivePage - 1) * effectiveLimit + 1}–
                      {Math.min(effectivePage * effectiveLimit, effectiveTotal)}
                    </span>{' '}
                    of{' '}
                    <span className='font-semibold text-(--text-primary)'>
                      {effectiveTotal}
                    </span>{' '}
                    tiket
                  </p>
                  <Pagination
                    currentPage={effectivePage}
                    totalPages={totalPages}
                    onPageChange={pagination?.onPageChange ?? setPage}
                  />
                </div>
              )}
            </>
          )}
        </div>
      </div>
      <ReopenTicketModal
        open={reopenModalOpen}
        onClose={() => {
          if (reopenLoading) return;
          setReopenModalOpen(false);
          setReopenTarget(null);
        }}
        onConfirm={handleReopenConfirm}
        ticketCode={reopenTarget?.ticket}
        loading={reopenLoading}
      />
    </div>
  );
}
