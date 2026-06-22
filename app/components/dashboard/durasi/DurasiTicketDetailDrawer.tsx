'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, ChevronRight, Copy, Loader2, RefreshCw, Ticket, X } from 'lucide-react';
import clsx from 'clsx';
import { fetchWithAuth } from '@/app/libs/fetcher';
import type {
  DurasiDetailMeta,
  DurasiDetailResponse,
  DurasiDetailTarget,
  DurasiDetailTicket,
} from './durasi-types';

const PAGE_SIZE = 20;
const WIB_DATE_FORMAT = new Intl.DateTimeFormat('id-ID', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Jakarta',
});

function formatNumber(value: number): string {
  return new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 }).format(value);
}

function formatDateTime(value: string | null): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return WIB_DATE_FORMAT.format(date);
}

function formatTicketAge(value: number | null): string {
  if (value === null || Number.isNaN(value)) return '-';
  const totalMinutes = Math.max(0, Math.round(value * 60));
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;

  const parts: string[] = [];
  if (days > 0) parts.push(`${days} hari`);
  if (hours > 0) parts.push(`${hours} jam`);
  if (minutes > 0 || parts.length === 0) parts.push(`${minutes} menit`);

  return parts.join(' ');
}

function statusTone(status: string | null): string {
  const raw = String(status ?? '').toLowerCase();
  if (raw.includes('close')) return 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/20';
  if (raw.includes('progress') || raw.includes('assign')) return 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-500/10 dark:text-sky-300 dark:border-sky-500/20';
  if (raw.includes('pending') || raw.includes('validasi')) return 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/20';
  return 'bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-500/10 dark:text-slate-300 dark:border-slate-500/20';
}

function chipTone(label: string): string {
  const raw = label.toLowerCase();
  if (raw.includes('manja') || raw.includes('p+')) return 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/20';
  if (raw.includes('gamas')) return 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200 dark:bg-fuchsia-500/10 dark:text-fuchsia-300 dark:border-fuchsia-500/20';
  if (raw.includes('guarantee') || raw.includes('ffg')) return 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/20';
  if (raw.includes('sqm')) return 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-500/10 dark:text-violet-300 dark:border-violet-500/20';
  return 'bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-500/10 dark:text-slate-300 dark:border-slate-500/20';
}

function renderValue(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '-';
  return String(value);
}

function mergeUnique(existing: DurasiDetailTicket[], next: DurasiDetailTicket[]): DurasiDetailTicket[] {
  const seen = new Set(existing.map((item) => item.id_ticket));
  const merged = [...existing];
  for (const item of next) {
    if (seen.has(item.id_ticket)) continue;
    seen.add(item.id_ticket);
    merged.push(item);
  }
  return merged;
}

function DetailMetric({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-(--border) bg-(--surface-2) p-3 shadow-sm">
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-(--text-muted)">{label}</p>
      <p className="mt-2 text-lg font-semibold tracking-tight text-(--text-primary)">{value}</p>
      {hint && <p className="mt-1 text-[11px] leading-5 text-(--text-secondary)">{hint}</p>}
    </div>
  );
}

function TicketCard({ ticket }: { ticket: DurasiDetailTicket }) {
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

  return (
    <article className="rounded-2xl border border-(--border) bg-(--surface) p-3 shadow-sm sm:rounded-3xl sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-2 sm:gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[13px] font-semibold tracking-[0.12em] text-(--text-primary) sm:text-sm">
              {ticket.incident}
            </span>
            <span className={clsx('rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em]', statusTone(ticket.status))}>
              {renderValue(ticket.status)}
            </span>
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-1 rounded-full border border-(--border) bg-(--surface-2) px-2 py-0.5 text-[10px] font-semibold text-(--text-secondary) transition-colors hover:bg-(--surface-3)"
              aria-label={`Copy incident ${ticket.incident}`}
              title="Copy incident"
            >
              {copied ? <Check size={11} /> : <Copy size={11} />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <p className="mt-2 line-clamp-2 text-[13px] leading-5 text-(--text-secondary) sm:text-sm sm:leading-6">
            {ticket.summary ?? 'Tidak ada ringkasan ticket'}
          </p>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          <span className="rounded-full border border-(--border) bg-(--surface-2) px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-(--text-muted)">
            {renderValue(ticket.duration_bucket)}
          </span>
          <span className="rounded-full bg-slate-950 px-2 py-0.5 font-mono text-[10px] font-semibold text-white dark:bg-white dark:text-slate-950">
            {formatTicketAge(ticket.duration_hours)}
          </span>
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:mt-4 sm:grid-cols-2 xl:grid-cols-3">
        <div className={clsx('rounded-2xl border px-3 py-2 text-[11px]', chipTone(ticket.customer_type ?? ''))}>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] opacity-70">Customer type</p>
          <p className="mt-1 font-semibold">{renderValue(ticket.customer_type)}</p>
        </div>
        <div className={clsx('rounded-2xl border px-3 py-2 text-[11px]', chipTone(ticket.flagging_manja ?? ticket.guarantee_status ?? ''))}>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] opacity-70">Flag / Guarantee</p>
          <p className="mt-1 font-semibold">
            {renderValue(ticket.flagging_manja ?? ticket.guarantee_status)}
          </p>
        </div>
        <div className={clsx('rounded-2xl border px-3 py-2 text-[11px]', chipTone(ticket.ticket_id_gamas ?? ''))}>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] opacity-70">Gamas</p>
          <p className="mt-1 font-semibold">{renderValue(ticket.ticket_id_gamas)}</p>
        </div>
        <div className="rounded-2xl border border-(--border) bg-(--surface-2) px-3 py-2 text-[11px]">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-(--text-muted)">Workzone</p>
          <p className="mt-1 font-semibold text-(--text-primary)">{renderValue(ticket.workzone)}</p>
        </div>
        <div className="rounded-2xl border border-(--border) bg-(--surface-2) px-3 py-2 text-[11px]">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-(--text-muted)">Area / Region</p>
          <p className="mt-1 font-semibold text-(--text-primary)">
            {renderValue(ticket.area)} <span className="text-(--text-muted)">/</span> {renderValue(ticket.region)}
          </p>
        </div>
        <div className="rounded-2xl border border-(--border) bg-(--surface-2) px-3 py-2 text-[11px]">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-(--text-muted)">Teknisi</p>
          <p className="mt-1 font-semibold text-(--text-primary)">{renderValue(ticket.teknisi_name)}</p>
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:mt-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-(--border) bg-(--surface-2) px-3 py-2 text-[11px]">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-(--text-muted)">Reported</p>
          <p className="mt-1 font-semibold text-(--text-primary)">{formatDateTime(ticket.reported_date)}</p>
        </div>
        <div className="rounded-2xl border border-(--border) bg-(--surface-2) px-3 py-2 text-[11px]">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-(--text-muted)">Closed</p>
          <p className="mt-1 font-semibold text-(--text-primary)">{formatDateTime(ticket.closed_at)}</p>
        </div>
      </div>
    </article>
  );
}

export default function DurasiTicketDetailDrawer({
  open,
  target,
  onClose,
}: {
  open: boolean;
  target: DurasiDetailTarget | null;
  onClose: () => void;
}) {
  const [isVisible, setIsVisible] = useState(false);
  const [page, setPage] = useState(1);
  const [tickets, setTickets] = useState<DurasiDetailTicket[]>([]);
  const [meta, setMeta] = useState<DurasiDetailMeta | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

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
    if (!targetKey) {
      setPage(1);
      setTickets([]);
      setMeta(null);
      setLocalError(null);
      return;
    }
    setPage(1);
    setTickets([]);
    setMeta(null);
    setLocalError(null);
  }, [targetKey]);

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
      const res = await fetchWithAuth(`/api/dashboard/durasi/detail?${params.toString()}`);
      if (!res) throw new Error('No response');
      const json = await res.json();
      if (!json?.success) throw new Error(json?.message || 'Gagal memuat detail ticket');
      return json.data as DurasiDetailResponse;
    },
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (!query.data) return;
    setMeta(query.data.meta);
    setTickets((prev) => (page === 1 ? query.data.tickets : mergeUnique(prev, query.data.tickets)));
    setLocalError(null);
  }, [page, query.data]);

  useEffect(() => {
    if (!query.error) return;
    setLocalError(query.error instanceof Error ? query.error.message : 'Gagal memuat detail ticket');
  }, [query.error]);

  const handleClose = () => {
    setIsVisible(false);
    window.setTimeout(onClose, 220);
  };

  if (!open && !isVisible) return null;

  const total = meta?.total ?? tickets.length;
  const hasMore = meta?.hasMore ?? false;

  return (
      <div
        className={clsx(
          'fixed inset-0 z-[80] flex justify-end transition-all duration-300 ease-out',
          isVisible ? 'bg-black/40 backdrop-blur-sm' : 'bg-transparent',
        )}
        onClick={handleClose}
      >
      <aside
        className={clsx(
          'flex h-full w-full max-w-[42rem] transform flex-col border-l border-(--border) bg-(--surface) shadow-2xl transition-transform duration-300 ease-out',
          isVisible ? 'translate-x-0' : 'translate-x-full',
        )}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="sticky top-0 z-10 border-b border-(--border) bg-[linear-gradient(180deg,var(--surface),var(--surface-2))] px-3 py-3 sm:px-5 sm:py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-(--text-muted)">
                Detail durasi ticket
              </p>
              <h3 className="mt-1 truncate text-[15px] font-semibold tracking-tight text-(--text-primary) sm:text-lg">
                {target?.panelLabel ?? 'Durasi Ticket'}
              </h3>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-(--text-secondary) sm:text-xs">
                <span className="rounded-full border border-(--border) bg-(--surface) px-2 py-0.5 font-medium text-(--text-primary) sm:px-2.5 sm:py-1">
                  {target?.bucketLabel ?? '-'}
                </span>
                <span className="rounded-full border border-(--border) bg-(--surface) px-2 py-0.5 font-medium text-(--text-primary) sm:px-2.5 sm:py-1">
                  {target?.area ?? '-'}
                </span>
                <span className="rounded-full border border-(--border) bg-(--surface) px-2 py-0.5 font-medium text-(--text-primary) sm:px-2.5 sm:py-1">
                  {target?.sa ?? 'Area summary'}
                </span>
                <span className="rounded-full border border-(--border) bg-(--surface) px-2 py-0.5 font-medium text-(--text-primary) sm:px-2.5 sm:py-1">
                  {target?.bucketName ?? '-'}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleClose}
              className="rounded-2xl border border-(--border) bg-(--surface) p-2 text-(--text-muted) transition-colors hover:bg-(--surface-3)"
              aria-label="Tutup detail durasi"
            >
              <X size={18} />
            </button>
          </div>

          <div className="mt-3 grid gap-2 sm:mt-4 sm:grid-cols-4 sm:gap-3">
            <DetailMetric
              label="Total ticket"
              value={new Intl.NumberFormat('id-ID').format(total)}
              hint="Hasil klik pada sel tabel"
            />
            <DetailMetric
              label="Halaman"
              value={`${page}${hasMore ? ' +' : ''}`}
              hint={hasMore ? 'Masih ada data lanjutan' : 'Seluruh data halaman ini'}
            />
            <DetailMetric
              label="Panel"
              value={target?.panelLabel ?? '-'}
              hint={target?.bucketLabel ?? '-'}
            />
            <DetailMetric
              label="Scope"
              value={target?.bucketName ?? '-'}
              hint={target?.sa ? `SA ${target.sa}` : 'Ringkasan area'}
            />
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-3 py-3 sm:px-5 sm:py-4">
          {query.isLoading && page === 1 ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, idx) => (
                <div key={idx} className="rounded-3xl border border-(--border) bg-(--surface-2) p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="h-4 w-40 animate-pulse rounded-full bg-(--surface-3)" />
                    <div className="h-6 w-20 animate-pulse rounded-full bg-(--surface-3)" />
                  </div>
                  <div className="mt-4 h-3 w-full animate-pulse rounded-full bg-(--surface-3)" />
                  <div className="mt-2 h-3 w-5/6 animate-pulse rounded-full bg-(--surface-3)" />
                  <div className="mt-4 grid gap-2 sm:grid-cols-3">
                    {Array.from({ length: 3 }).map((__, jdx) => (
                      <div key={jdx} className="h-16 animate-pulse rounded-2xl bg-(--surface-3)" />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : localError ? (
            <div className="rounded-3xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300">
              <p className="font-semibold">Gagal memuat detail ticket</p>
              <p className="mt-1">{localError}</p>
              <button
                type="button"
                onClick={() => query.refetch()}
                className="mt-3 inline-flex items-center gap-2 rounded-xl bg-red-600 px-3 py-2 text-xs font-semibold text-white hover:bg-red-700"
              >
                <RefreshCw size={14} />
                Coba lagi
              </button>
            </div>
          ) : tickets.length === 0 ? (
            <div className="flex min-h-[32vh] flex-col items-center justify-center rounded-3xl border border-dashed border-(--border) bg-(--surface-2) px-6 py-10 text-center">
              <Ticket className="h-8 w-8 text-(--text-muted)" />
              <p className="mt-3 text-sm font-semibold text-(--text-primary)">Tidak ada ticket pada sel ini</p>
              <p className="mt-1 text-xs leading-5 text-(--text-secondary)">
                Detail ticket akan muncul jika sel yang dipilih memang memiliki data.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {tickets.map((ticket) => (
                <TicketCard key={ticket.id_ticket} ticket={ticket} />
              ))}

              {hasMore && (
                <button
                  type="button"
                  onClick={() => setPage((prev) => prev + 1)}
                  disabled={query.isFetching}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-(--border) bg-(--surface-2) px-4 py-3 text-sm font-semibold text-(--text-primary) transition-colors hover:bg-(--surface-3) disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {query.isFetching && page > 1 ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
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
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
