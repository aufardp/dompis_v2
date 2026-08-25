'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Loader2, RefreshCw, Repeat, Search, Ticket, X } from 'lucide-react';
import clsx from 'clsx';
import { fetchWithAuth } from '@/app/libs/fetcher';
import TicketDetailDrawer from '@/app/admin/components/dashboard/TicketDetailDrawer';
import type { TicketDetail } from '@/app/admin/components/dashboard/ticket-detail/types';

const PAGE_SIZE = 20;

export interface AssuranceGuaranteeSpec {
  key: string;
  tier: 'all' | 'diamond' | 'platinum' | 'gold' | 'reguler';
  gamas: 'all' | 'gamas' | 'non-gamas';
  label: string;
}

interface AssuranceGuaranteeGroupTicket {
  idTicket: number;
  ticket: string;
  customerType: string | null;
  sourceTicket: string | null;
  status: string | null;
  reportedDate: string | null;
  closedAt: string | null;
  rca: string | null;
  subRca: string | null;
  technicianName: string | null;
}

interface AssuranceGuaranteeGroup {
  serviceNo: string;
  occurrenceCount: number;
  tickets: AssuranceGuaranteeGroupTicket[];
}

interface AssuranceGuaranteeMembersMeta {
  tier: string;
  gamas: string;
  q: string | null;
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
}

interface AssuranceGuaranteeMembersResponse {
  meta: AssuranceGuaranteeMembersMeta;
  groups: AssuranceGuaranteeGroup[];
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

function renderValue(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '-';
  return String(value);
}

function mergeUniqueGroups(
  existing: AssuranceGuaranteeGroup[],
  next: AssuranceGuaranteeGroup[],
): AssuranceGuaranteeGroup[] {
  const seen = new Set(existing.map((item) => item.serviceNo));
  const merged = [...existing];
  for (const item of next) {
    if (seen.has(item.serviceNo)) continue;
    seen.add(item.serviceNo);
    merged.push(item);
  }
  return merged;
}

export default function AssuranceGuaranteeTicketsModal({
  open,
  spec,
  onClose,
  workzone,
  branch,
}: {
  open: boolean;
  spec: AssuranceGuaranteeSpec | null;
  onClose: () => void;
  workzone?: string;
  branch?: string;
}) {
  const [isVisible, setIsVisible] = useState(false);
  const [page, setPage] = useState(1);
  const [groups, setGroups] = useState<AssuranceGuaranteeGroup[]>([]);
  const [meta, setMeta] = useState<AssuranceGuaranteeMembersMeta | null>(null);
  const [q, setQ] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [selectedTicket, setSelectedTicket] = useState<{
    id: number;
    ticket: TicketDetail | null;
    loading: boolean;
    error: string | null;
  } | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const specKey = spec?.key ?? null;

  useEffect(() => {
    if (open && spec) {
      const timeout = window.setTimeout(() => setIsVisible(true), 10);
      return () => window.clearTimeout(timeout);
    }
    setIsVisible(false);
    return undefined;
  }, [open, specKey]);

  useEffect(() => {
    setPage(1);
    setGroups([]);
    setMeta(null);
    setQ('');
    setLocalError(null);
    setSelectedTicket(null);
  }, [specKey]);

  useEffect(() => {
    if (open && spec && isVisible) {
      window.setTimeout(() => searchInputRef.current?.focus(), 60);
    }
  }, [open, specKey, isVisible]);

  const queryKey = useMemo(() => {
    if (!spec) return null;
    return [
      'dashboard',
      'assurance-guarantee',
      'tickets',
      spec.tier,
      spec.gamas,
      workzone ?? 'all',
      branch ?? 'all',
      q.trim(),
      page,
    ] as const;
  }, [spec, workzone, branch, q, page]);

  const query = useQuery<AssuranceGuaranteeMembersResponse>({
    queryKey: queryKey ?? [],
    enabled: Boolean(open && spec && isVisible && queryKey),
    queryFn: async () => {
      if (!spec) throw new Error('Sel belum dipilih');
      const params = new URLSearchParams();
      params.set('tier', spec.tier);
      params.set('gamas', spec.gamas);
      if (workzone) params.set('workzone', workzone);
      if (branch) params.set('branch', branch);
      const term = q.trim();
      if (term) params.set('q', term);
      params.set('page', String(page));
      params.set('limit', String(PAGE_SIZE));
      const res = await fetchWithAuth(
        `/api/dashboard/assurance-guarantee/tickets?${params.toString()}`,
      );
      if (!res) throw new Error('Tidak ada respons dari server');
      const json = await res.json();
      if (!json?.success)
        throw new Error(json?.message || 'Gagal memuat service no berulang');
      return json.data as AssuranceGuaranteeMembersResponse;
    },
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (!query.data) return;
    setMeta(query.data.meta);
    setGroups((prev) =>
      page === 1 ? query.data.groups : mergeUniqueGroups(prev, query.data.groups),
    );
    setLocalError(null);
  }, [page, query.data]);

  useEffect(() => {
    if (!query.error) return;
    setLocalError(
      query.error instanceof Error
        ? query.error.message
        : 'Gagal memuat service no berulang',
    );
  }, [query.error]);

  const handleOpenTicket = useCallback((ticketId: number) => {
    setSelectedTicket({
      id: ticketId,
      ticket: null,
      loading: true,
      error: null,
    });
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
            error: data.success
              ? null
              : data.message || 'Gagal memuat detail tiket',
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

  const total = meta?.total ?? groups.length;
  const hasMore = meta?.hasMore ?? false;
  const specLabel = spec?.label ?? 'Tiket berulang';

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
        aria-label={specLabel}
        className={clsx(
          'fixed z-80 flex flex-col bg-(--surface) shadow-2xl transition-all duration-300 ease-out',
          'right-0 bottom-0 left-0 max-h-[88vh] rounded-t-[28px] border-t border-(--border)',
          'md:top-1/2 md:bottom-auto md:left-1/2 md:h-auto md:max-h-[86vh] md:min-h-120 md:w-[min(96vw,1100px)] md:-translate-x-1/2 md:rounded-[28px] md:border',
          isVisible
            ? 'translate-y-0 opacity-100 md:-translate-y-1/2'
            : 'translate-y-full opacity-0 md:translate-y-[calc(-50%-24px)]',
        )}
      >
        <header className='sticky top-0 z-10 border-b border-(--border) bg-[linear-gradient(180deg,var(--surface),var(--surface-2))] px-4 py-3 sm:px-5'>
          <div className='flex items-start justify-between gap-3'>
            <div className='min-w-0'>
              <p className='text-[10px] font-semibold tracking-[0.22em] text-(--text-muted) uppercase'>
                Gangguan Berulang
              </p>
              <h3 className='mt-1 truncate text-[15px] font-semibold tracking-tight text-(--text-primary) sm:text-lg'>
                {specLabel}
              </h3>
            </div>
            <button
              type='button'
              onClick={handleClose}
              className='rounded-2xl border border-(--border) bg-(--surface) p-2 text-(--text-muted) transition-colors hover:bg-(--surface-3)'
              aria-label='Tutup daftar service no'
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
                onChange={(event) => {
                  setQ(event.target.value);
                  setPage(1);
                }}
                placeholder='Cari incident / service no…'
                className='w-full rounded-2xl border border-(--border) bg-(--surface-2) py-2 pr-8 pl-8 text-sm text-(--text-primary) placeholder:text-(--text-muted) focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 focus:outline-none'
              />
              {q && (
                <button
                  type='button'
                  onClick={() => {
                    setQ('');
                    setPage(1);
                  }}
                  className='absolute top-1/2 right-2 -translate-y-1/2 rounded-full p-1 text-(--text-muted) hover:text-(--text-primary)'
                  aria-label='Bersihkan pencarian'
                >
                  <X size={13} />
                </button>
              )}
            </div>
            <span className='shrink-0 rounded-full border border-(--border) bg-(--surface) px-2.5 py-1 text-[11px] font-semibold text-(--text-secondary)'>
              {new Intl.NumberFormat('id-ID').format(total)} service no
            </span>
          </div>
        </header>

        <div className='flex-1 overflow-y-auto px-3 py-3 sm:px-5 sm:py-4'>
          {query.isLoading && page === 1 ? (
            <div className='space-y-2'>
              {Array.from({ length: 4 }).map((_, idx) => (
                <div
                  key={idx}
                  className='h-24 animate-pulse rounded-2xl border border-(--border) bg-(--surface-2)'
                />
              ))}
            </div>
          ) : localError ? (
            <div className='rounded-3xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300'>
              <p className='font-semibold'>Gagal memuat daftar service no</p>
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
          ) : groups.length === 0 ? (
            <div className='flex min-h-[30vh] flex-col items-center justify-center rounded-3xl border border-dashed border-(--border) bg-(--surface-2) px-6 py-10 text-center'>
              <Ticket className='h-8 w-8 text-(--text-muted)' />
              <p className='mt-3 text-sm font-semibold text-(--text-primary)'>
                Tidak ada service no berulang di kategori ini
              </p>
              <p className='mt-1 text-xs leading-5 text-(--text-secondary)'>
                Coba ubah kata kunci pencarian atau pilih angka lain.
              </p>
            </div>
          ) : (
            <>
              <div className='space-y-3'>
                {groups.map((group) => (
                  <ServiceNoGroupCard
                    key={group.serviceNo}
                    group={group}
                    onOpenTicket={handleOpenTicket}
                  />
                ))}
              </div>

              {hasMore && (
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
                      Muat service no berikutnya
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

function ServiceNoGroupCard({
  group,
  onOpenTicket,
}: {
  group: AssuranceGuaranteeGroup;
  onOpenTicket: (ticketId: number) => void;
}) {
  return (
    <div className='overflow-hidden rounded-2xl border border-(--border) bg-(--surface)'>
      <div className='flex items-center justify-between gap-2 border-b border-(--border) bg-(--surface-2) px-4 py-2'>
        <span
          className='truncate font-mono text-[13px] font-semibold text-(--text-primary)'
          title={group.serviceNo}
        >
          {group.serviceNo}
        </span>
        <span className='inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300'>
          <Repeat size={11} />
          {group.occurrenceCount}x berulang
        </span>
      </div>

      <div className='hidden items-center gap-3 border-b border-(--border) px-4 py-2 md:grid md:grid-cols-[minmax(0,160px)_minmax(110px,1fr)_minmax(110px,1fr)_minmax(110px,1fr)_172px_36px]'>
        <span className='text-[9px] font-semibold tracking-[0.16em] whitespace-nowrap text-(--text-muted) uppercase'>
          Incident
        </span>
        <span className='text-[9px] font-semibold tracking-[0.16em] whitespace-nowrap text-(--text-muted) uppercase'>
          Teknisi
        </span>
        <span className='text-[9px] font-semibold tracking-[0.16em] whitespace-nowrap text-(--text-muted) uppercase'>
          RCA
        </span>
        <span className='text-[9px] font-semibold tracking-[0.16em] whitespace-nowrap text-(--text-muted) uppercase'>
          Sub RCA
        </span>
        <span className='text-[9px] font-semibold tracking-[0.16em] whitespace-nowrap text-(--text-muted) uppercase'>
          Reported → Closed
        </span>
        <span />
      </div>

      <div className='divide-y divide-(--border)'>
        {group.tickets.map((ticket) => (
          <div
            key={ticket.idTicket}
            role='button'
            tabIndex={0}
            onClick={() => onOpenTicket(ticket.idTicket)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onOpenTicket(ticket.idTicket);
              }
            }}
            className='group cursor-pointer transition-colors hover:bg-(--surface-2) focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40'
            aria-label={`Buka detail ${ticket.ticket}`}
          >
            <div className='hidden items-center gap-3 px-4 py-2.5 md:grid md:grid-cols-[minmax(0,160px)_minmax(110px,1fr)_minmax(110px,1fr)_minmax(110px,1fr)_172px_36px]'>
              <div className='flex items-center gap-2'>
                <span className='truncate font-mono text-[13px] font-semibold tracking-[0.06em] text-(--text-primary)'>
                  {ticket.ticket}
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
              <p
                className={clsx(
                  'min-w-0 truncate text-xs font-medium',
                  ticket.technicianName
                    ? 'text-(--text-primary)'
                    : 'text-(--text-muted)',
                )}
                title={ticket.technicianName ?? undefined}
              >
                {renderValue(ticket.technicianName)}
              </p>
              <p
                className='min-w-0 truncate text-xs text-(--text-secondary)'
                title={ticket.rca ?? undefined}
              >
                {renderValue(ticket.rca)}
              </p>
              <p
                className='min-w-0 truncate text-xs text-(--text-secondary)'
                title={ticket.subRca ?? undefined}
              >
                {renderValue(ticket.subRca)}
              </p>
              <p className='truncate text-[11px] text-(--text-secondary)'>
                {formatCompactDateTime(ticket.reportedDate)}
                {' → '}
                {formatCompactDateTime(ticket.closedAt)}
              </p>
              <div className='flex items-center justify-end'>
                <ChevronRight
                  size={15}
                  className='shrink-0 text-(--text-muted) transition-transform group-hover:translate-x-0.5'
                />
              </div>
            </div>

            <div className='px-3 py-2.5 md:hidden'>
              <div className='flex items-center gap-2'>
                <span className='truncate font-mono text-[13px] font-semibold tracking-[0.06em] text-(--text-primary)'>
                  {ticket.ticket}
                </span>
                <span
                  className={clsx(
                    'shrink-0 rounded-full border px-1.5 py-px text-[9px] font-semibold tracking-[0.14em] uppercase',
                    statusTone(ticket.status),
                  )}
                >
                  {renderValue(ticket.status)}
                </span>
                <ChevronRight
                  size={15}
                  className='ml-auto shrink-0 text-(--text-muted) transition-transform group-hover:translate-x-0.5'
                />
              </div>
              <p className='mt-1 truncate text-[11px] text-(--text-secondary)'>
                Teknisi: {renderValue(ticket.technicianName)}
              </p>
              <p className='mt-0.5 truncate text-[11px] text-(--text-secondary)'>
                RCA: {renderValue(ticket.rca)} · Sub RCA: {renderValue(ticket.subRca)}
              </p>
              <div className='mt-1 flex items-center justify-end text-[11px]'>
                <span className='text-(--text-muted)'>
                  {formatCompactDateTime(ticket.reportedDate)}
                  {' → '}
                  {formatCompactDateTime(ticket.closedAt)}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
