'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Check,
  ChevronRight,
  Copy,
  Loader2,
  RefreshCw,
  Search,
  Ticket,
  X,
} from 'lucide-react';
import clsx from 'clsx';
import { fetchWithAuth } from '@/app/libs/fetcher';
import TicketDetailDrawer from '@/app/admin/components/dashboard/TicketDetailDrawer';
import type { TicketDetail } from '@/app/admin/components/dashboard/ticket-detail/types';
import type {
  DurasiDetailMeta,
  DurasiDetailResponse,
  DurasiDetailTarget,
  DurasiDetailTicket,
} from './durasi-types';

const PAGE_SIZE = 20;

const WIB_COMPACT_DATE = new Intl.DateTimeFormat('id-ID', {
  day: '2-digit',
  month: 'short',
  timeZone: 'Asia/Jakarta',
});
const WIB_COMPACT_TIME = new Intl.DateTimeFormat('id-ID', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Asia/Jakarta',
});

function formatCompactDateTime(value: string | null): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return `${WIB_COMPACT_DATE.format(date)}, ${WIB_COMPACT_TIME.format(date)}`;
}

function formatTicketAge(value: number | null): string {
  if (value === null || Number.isNaN(value)) return '-';
  const totalMinutes = Math.max(0, Math.round(value * 60));
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}h`);
  if (hours > 0) parts.push(`${hours}j`);
  if (minutes > 0 || parts.length === 0) parts.push(`${minutes}m`);

  return parts.join(' ');
}

function statusTone(status: string | null): string {
  const raw = String(status ?? '').toLowerCase();
  if (raw.includes('close'))
    return 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/20';
  if (raw.includes('progress') || raw.includes('assign'))
    return 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-500/10 dark:text-sky-300 dark:border-sky-500/20';
  if (raw.includes('pending') || raw.includes('validasi'))
    return 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/20';
  return 'bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-500/10 dark:text-slate-300 dark:border-slate-500/20';
}

function renderValue(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '-';
  return String(value);
}

function mergeUnique(
  existing: DurasiDetailTicket[],
  next: DurasiDetailTicket[],
): DurasiDetailTicket[] {
  const seen = new Set(existing.map((item) => item.id_ticket));
  const merged = [...existing];
  for (const item of next) {
    if (seen.has(item.id_ticket)) continue;
    seen.add(item.id_ticket);
    merged.push(item);
  }
  return merged;
}

function matchesSearch(ticket: DurasiDetailTicket, term: string): boolean {
  if (!term) return true;
  const haystack = `${ticket.incident} ${ticket.summary ?? ''}`.toLowerCase();
  return haystack.includes(term);
}

function DurasiTicketRow({
  ticket,
  onOpen,
}: {
  ticket: DurasiDetailTicket;
  onOpen: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(ticket.incident);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  };

  const copyButton = (
    <button
      type='button'
      onClick={(event) => {
        event.stopPropagation();
        handleCopy();
      }}
      className='inline-flex shrink-0 items-center gap-1 rounded-full border border-(--border) bg-(--surface-2) px-1.5 py-0.5 text-[10px] font-semibold text-(--text-secondary) transition-colors hover:bg-(--surface-3)'
      aria-label={`Copy incident ${ticket.incident}`}
      title='Copy incident'
    >
      {copied ? <Check size={11} /> : <Copy size={11} />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  );

  return (
    <div
      role='button'
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen();
        }
      }}
      className='group cursor-pointer transition-colors hover:bg-(--surface-2) focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40'
      aria-label={`Buka detail ${ticket.incident}`}
    >
      <div className='hidden items-center gap-4 px-4 py-2.5 md:grid md:grid-cols-[minmax(0,160px)_minmax(0,1fr)_100px_130px_minmax(0,150px)_56px]'>
        <div className='flex min-w-0 flex-col gap-0.5'>
          <div className='flex items-center gap-2'>
            <span className='truncate font-mono text-[13px] font-semibold tracking-[0.08em] text-(--text-primary)'>
              {ticket.incident}
            </span>
            <span
              className={clsx(
                'shrink-0 rounded-full border px-1.5 py-px text-[9px] font-semibold tracking-[0.14em] uppercase',
                statusTone(ticket.status),
              )}
            >
              {renderValue(ticket.status)}
            </span>
          </div>
          <span className='truncate text-[10px] text-(--text-muted)'>
            {renderValue(ticket.customer_type)}
          </span>
        </div>
        <p
          className={clsx(
            'min-w-0 truncate text-xs',
            ticket.summary ? 'text-(--text-secondary)' : 'text-(--text-muted)',
          )}
        >
          {ticket.summary ?? 'Tidak ada ringkasan ticket'}
        </p>
        <div className='flex min-w-0 flex-col gap-0.5'>
          <span className='w-fit truncate rounded-full border border-(--border) bg-(--surface-2) px-1.5 py-px text-[9px] font-semibold tracking-[0.1em] text-(--text-muted) uppercase'>
            {renderValue(ticket.duration_bucket)}
          </span>
          <span className='truncate font-mono text-[11px] font-semibold text-(--text-primary)'>
            {formatTicketAge(ticket.duration_hours)}
          </span>
        </div>
        <div className='flex min-w-0 flex-col gap-0.5'>
          <span className='truncate text-xs font-semibold text-(--text-primary)'>
            {renderValue(ticket.area)}
          </span>
          <span className='truncate text-[10px] text-(--text-muted)'>
            {renderValue(ticket.workzone)}
          </span>
        </div>
        <p className='truncate text-[11px] text-(--text-secondary)'>
          {formatCompactDateTime(ticket.reported_date)}
          {' → '}
          {formatCompactDateTime(ticket.closed_at)}
        </p>
        <div className='flex items-center justify-end gap-1'>
          {copyButton}
          <ChevronRight
            size={15}
            className='shrink-0 text-(--text-muted) transition-transform group-hover:translate-x-0.5'
          />
        </div>
      </div>

      <div className='px-3 py-2.5 md:hidden'>
        <div className='flex items-center gap-2'>
          <span className='truncate font-mono text-[13px] font-semibold tracking-[0.08em] text-(--text-primary)'>
            {ticket.incident}
          </span>
          <span
            className={clsx(
              'shrink-0 rounded-full border px-1.5 py-px text-[9px] font-semibold tracking-[0.14em] uppercase',
              statusTone(ticket.status),
            )}
          >
            {renderValue(ticket.status)}
          </span>
          <div className='ml-auto flex shrink-0 items-center gap-1'>
            {copyButton}
            <ChevronRight
              size={15}
              className='text-(--text-muted) transition-transform group-hover:translate-x-0.5'
            />
          </div>
        </div>
        <p
          className={clsx(
            'mt-1 truncate text-xs',
            ticket.summary ? 'text-(--text-secondary)' : 'text-(--text-muted)',
          )}
        >
          {ticket.summary ?? 'Tidak ada ringkasan ticket'}
        </p>
        <div className='mt-1.5 flex items-center gap-1.5 text-[11px]'>
          <span className='rounded-full border border-(--border) bg-(--surface-2) px-1.5 py-px text-[9px] font-semibold tracking-[0.1em] text-(--text-muted) uppercase'>
            {renderValue(ticket.duration_bucket)}
          </span>
          <span className='font-mono font-semibold text-(--text-primary)'>
            {formatTicketAge(ticket.duration_hours)}
          </span>
        </div>
        <div className='mt-1 flex items-center justify-between gap-2 text-[11px]'>
          <span className='truncate font-medium text-(--text-secondary)'>
            {renderValue(ticket.area)}
            {ticket.workzone ? ` · ${renderValue(ticket.workzone)}` : ''}
          </span>
          <span className='shrink-0 text-(--text-muted)'>
            {formatCompactDateTime(ticket.reported_date)}
            {' → '}
            {formatCompactDateTime(ticket.closed_at)}
          </span>
        </div>
      </div>
    </div>
  );
}

export default function DurasiTicketDetailDrawer({
  open,
  target,
  onClose,
  branch,
}: {
  open: boolean;
  target: DurasiDetailTarget | null;
  onClose: () => void;
  branch?: string;
}) {
  const [isVisible, setIsVisible] = useState(false);
  const [page, setPage] = useState(1);
  const [tickets, setTickets] = useState<DurasiDetailTicket[]>([]);
  const [meta, setMeta] = useState<DurasiDetailMeta | null>(null);
  const [q, setQ] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [selectedTicket, setSelectedTicket] = useState<{
    id: number;
    ticket: TicketDetail | null;
    loading: boolean;
    error: string | null;
  } | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const targetKey = useMemo(
    () =>
      target
        ? [
            target.bucket,
            target.panelType,
            target.area,
            target.sa || 'all',
            target.bucketIndex,
          ].join('|')
        : null,
    [target],
  );

  useEffect(() => {
    if (open && target) {
      const timeout = window.setTimeout(() => setIsVisible(true), 10);
      return () => window.clearTimeout(timeout);
    }
    setIsVisible(false);
    return undefined;
  }, [open, targetKey]);

  useEffect(() => {
    setPage(1);
    setTickets([]);
    setMeta(null);
    setQ('');
    setLocalError(null);
    setSelectedTicket(null);
  }, [targetKey]);

  useEffect(() => {
    if (open && target && isVisible) {
      window.setTimeout(() => searchInputRef.current?.focus(), 60);
    }
  }, [open, targetKey, isVisible]);

  const query = useQuery<DurasiDetailResponse>({
    queryKey: ['dashboard', 'durasi', 'detail', targetKey, page],
    enabled: Boolean(open && target && isVisible),
    queryFn: async () => {
      if (!target) throw new Error('Target ticket detail belum dipilih');
      const params = new URLSearchParams({
        bucket: target.bucket,
        panelType: target.panelType,
        area: target.area,
        bucketIndex: String(target.bucketIndex),
        page: String(page),
        limit: String(PAGE_SIZE),
      });
      if (target.sa) params.set('sa', target.sa);
      if (branch) params.set('branch', branch);
      const res = await fetchWithAuth(
        `/api/dashboard/durasi/detail?${params.toString()}`,
      );
      if (!res) throw new Error('No response');
      const json = await res.json();
      if (!json?.success)
        throw new Error(json?.message || 'Gagal memuat detail ticket');
      return json.data as DurasiDetailResponse;
    },
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (!query.data) return;
    setMeta(query.data.meta);
    setTickets((prev) =>
      page === 1 ? query.data.tickets : mergeUnique(prev, query.data.tickets),
    );
    setLocalError(null);
  }, [page, query.data]);

  useEffect(() => {
    if (!query.error) return;
    setLocalError(
      query.error instanceof Error
        ? query.error.message
        : 'Gagal memuat detail ticket',
    );
  }, [query.error]);

  const handleOpenTicket = useCallback((ticketId: number) => {
    setSelectedTicket({ id: ticketId, ticket: null, loading: true, error: null });
    fetchWithAuth(`/api/tickets/${ticketId}/detail`)
      .then((res) => (res ? res.json().catch(() => null) : null))
      .then((data) => {
        if (!data) return;
        setSelectedTicket((prev) => {
          if (!prev || prev.id !== ticketId) return prev;
          return {
            id: ticketId,
            ticket: data.success ? (data.data as TicketDetail) : null,
            loading: false,
            error: data.success ? null : data.message || 'Gagal memuat detail tiket',
          };
        });
      })
      .catch(() => {
        setSelectedTicket((prev) =>
          prev && prev.id === ticketId
            ? { ...prev, loading: false, error: 'Terjadi kesalahan jaringan' }
            : prev,
        );
      });
  }, []);

  const handleClose = useCallback(() => {
    setIsVisible(false);
    window.setTimeout(onClose, 220);
  }, [onClose]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === 'Escape') handleClose();
    },
    [handleClose],
  );

  useEffect(() => {
    if (!open) return;
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, handleKeyDown]);

  if (!open && !isVisible) return null;

  const term = q.trim().toLowerCase();
  const filteredTickets = term
    ? tickets.filter((ticket) => matchesSearch(ticket, term))
    : tickets;
  const total = meta?.total ?? tickets.length;
  const hasMore = meta?.hasMore ?? false;
  const scopeLabel = [
    target?.panelLabel,
    target?.bucketLabel,
    target?.sa ? `${target.area} · SA ${target.sa}` : target?.area,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <>
      <div
        className='fixed inset-0 z-70 bg-black/45 backdrop-blur-sm transition-opacity duration-300'
        onClick={handleClose}
        role='presentation'
      />
      <div
        role='dialog'
        aria-modal='true'
        aria-label={scopeLabel || 'Detail durasi ticket'}
        className={clsx(
          'fixed z-80 flex flex-col bg-(--surface) shadow-2xl transition-all duration-300 ease-out',
          'right-0 bottom-0 left-0 max-h-[88vh] rounded-t-[28px] border-t border-(--border)',
          'md:top-1/2 md:bottom-auto md:left-1/2 md:h-auto md:max-h-[86vh] md:min-h-120 md:w-[min(94vw,920px)] md:-translate-x-1/2 md:rounded-[28px] md:border',
          isVisible
            ? 'translate-y-0 opacity-100 md:-translate-y-1/2'
            : 'translate-y-full opacity-0 md:translate-y-[calc(-50%-24px)]',
        )}
      >
        <header className='sticky top-0 z-10 border-b border-(--border) bg-[linear-gradient(180deg,var(--surface),var(--surface-2))] px-4 py-3 sm:px-5'>
          <div className='flex items-start justify-between gap-3'>
            <div className='min-w-0'>
              <p className='text-[10px] font-semibold tracking-[0.22em] text-(--text-muted) uppercase'>
                List Detail Durasi Ticket
              </p>
              <h3 className='mt-1 truncate text-[15px] font-semibold tracking-tight text-(--text-primary) sm:text-lg'>
                {scopeLabel || 'Durasi Ticket'}
              </h3>
            </div>
            <button
              type='button'
              onClick={handleClose}
              className='rounded-2xl border border-(--border) bg-(--surface) p-2 text-(--text-muted) transition-colors hover:bg-(--surface-3)'
              aria-label='Tutup detail durasi'
            >
              <X size={18} />
            </button>
          </div>

          <div className='mt-3 flex flex-wrap items-center gap-2 sm:mt-4'>
            <div className='relative min-w-0 flex-1'>
              <Search className='pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-(--text-muted)' />
              <input
                ref={searchInputRef}
                type='text'
                value={q}
                onChange={(event) => setQ(event.target.value)}
                placeholder='Cari incident / summary…'
                className='w-full rounded-2xl border border-(--border) bg-(--surface-2) py-2 pr-8 pl-8 text-sm text-(--text-primary) placeholder:text-(--text-muted) focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 focus:outline-none'
              />
              {q && (
                <button
                  type='button'
                  onClick={() => setQ('')}
                  className='absolute top-1/2 right-2 -translate-y-1/2 rounded-full p-1 text-(--text-muted) hover:text-(--text-primary)'
                  aria-label='Bersihkan pencarian'
                >
                  <X size={13} />
                </button>
              )}
            </div>
            <span className='shrink-0 rounded-full border border-(--border) bg-(--surface) px-2.5 py-1 text-[11px] font-semibold text-(--text-secondary)'>
              {new Intl.NumberFormat('id-ID').format(total)} ticket
            </span>
          </div>
        </header>

        <div className='flex-1 overflow-y-auto px-3 py-3 sm:px-5 sm:py-4'>
          {query.isLoading && page === 1 ? (
            <div className='space-y-2'>
              {Array.from({ length: 6 }).map((_, idx) => (
                <div
                  key={idx}
                  className='flex items-center gap-3 rounded-xl border border-(--border) bg-(--surface-2) px-3 py-2.5'
                >
                  <div className='h-4 w-36 animate-pulse rounded-full bg-(--surface-3)' />
                  <div className='h-3 flex-1 animate-pulse rounded-full bg-(--surface-3)' />
                  <div className='h-3 w-12 animate-pulse rounded-full bg-(--surface-3)' />
                  <div className='h-3 w-16 animate-pulse rounded-full bg-(--surface-3)' />
                  <div className='h-3 w-28 animate-pulse rounded-full bg-(--surface-3)' />
                </div>
              ))}
            </div>
          ) : localError ? (
            <div className='rounded-3xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300'>
              <p className='font-semibold'>Gagal memuat detail ticket</p>
              <p className='mt-1'>{localError}</p>
              <button
                type='button'
                onClick={() => query.refetch()}
                className='mt-3 inline-flex items-center gap-2 rounded-xl bg-red-600 px-3 py-2 text-xs font-semibold text-white hover:bg-red-700'
              >
                <RefreshCw size={14} />
                Coba lagi
              </button>
            </div>
          ) : filteredTickets.length === 0 ? (
            <div className='flex min-h-[30vh] flex-col items-center justify-center rounded-3xl border border-dashed border-(--border) bg-(--surface-2) px-6 py-10 text-center'>
              <Ticket className='h-8 w-8 text-(--text-muted)' />
              <p className='mt-3 text-sm font-semibold text-(--text-primary)'>
                Tidak ada ticket pada sel ini
              </p>
              <p className='mt-1 text-xs leading-5 text-(--text-secondary)'>
                {term
                  ? 'Coba ubah kata kunci pencarian.'
                  : 'Detail ticket akan muncul jika sel yang dipilih memang memiliki data.'}
              </p>
            </div>
          ) : (
            <>
              <div className='overflow-hidden rounded-2xl border border-(--border) bg-(--surface)'>
                <div className='hidden items-center gap-4 border-b border-(--border) bg-(--surface-2) px-4 py-2.5 md:grid md:grid-cols-[minmax(0,160px)_minmax(0,1fr)_100px_130px_minmax(0,150px)_56px]'>
                  <span className='text-[9px] font-semibold tracking-[0.18em] whitespace-nowrap text-(--text-muted) uppercase'>
                    Incident
                  </span>
                  <span className='text-[9px] font-semibold tracking-[0.18em] whitespace-nowrap text-(--text-muted) uppercase'>
                    Summary
                  </span>
                  <span className='text-[9px] font-semibold tracking-[0.18em] whitespace-nowrap text-(--text-muted) uppercase'>
                    Durasi
                  </span>
                  <span className='text-[9px] font-semibold tracking-[0.18em] whitespace-nowrap text-(--text-muted) uppercase'>
                    Area
                  </span>
                  <span className='text-[9px] font-semibold tracking-[0.18em] whitespace-nowrap text-(--text-muted) uppercase'>
                    Reported → Closed
                  </span>
                  <span />
                </div>
                <div className='divide-y divide-(--border)'>
                  {filteredTickets.map((ticket) => (
                    <DurasiTicketRow
                      key={ticket.id_ticket}
                      ticket={ticket}
                      onOpen={() => handleOpenTicket(ticket.id_ticket)}
                    />
                  ))}
                </div>
              </div>

              {hasMore && !term && (
                <button
                  type='button'
                  onClick={() => setPage((prev) => prev + 1)}
                  disabled={query.isFetching}
                  className='mt-3 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-(--border) bg-(--surface-2) px-4 py-2.5 text-sm font-semibold text-(--text-primary) transition-colors hover:bg-(--surface-3) disabled:cursor-not-allowed disabled:opacity-60'
                >
                  {query.isFetching && page > 1 ? (
                    <>
                      <Loader2 size={16} className='animate-spin' />
                      Memuat data tambahan
                    </>
                  ) : (
                    <>
                      Muat tiket berikutnya
                      <ChevronRight size={16} />
                    </>
                  )}
                </button>
              )}
            </>
          )}
        </div>
      </div>

      <TicketDetailDrawer
        open={Boolean(selectedTicket)}
        onClose={() => setSelectedTicket(null)}
        ticket={selectedTicket?.ticket ?? null}
        loading={selectedTicket?.loading}
        error={selectedTicket?.error ?? null}
        zIndexClass='z-[100]'
        onRetry={() =>
          selectedTicket ? handleOpenTicket(selectedTicket.id) : undefined
        }
      />
    </>
  );
}
