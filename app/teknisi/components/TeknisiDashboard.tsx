// app/teknisi/components/TeknisiDashboard.tsx

'use client';

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { Ticket } from '@/app/types/ticket';
import { fetchWithAuth } from '@/app/libs/fetcher';
import { useToast } from './hooks/useToast';
import {
  CheckCircle2,
  ClipboardList,
  Eye,
  Home,
  LayoutGrid,
  MapPin,
  Search,
  Ticket as TicketIcon,
  Wrench,
  X,
} from 'lucide-react';

import { useTickets, usePullToRefresh } from './TeknisiDashboard/hooks';
import { PullToRefresh } from './TeknisiDashboard/components';
import { TicketFilter } from './TeknisiDashboard/constants/ticket';
import DashboardHeader from './DashboardHeader';
import StatusGrid from './StatusGrid';
import FilterChips from './FilterChips';
import TicketCard from './TeknisiDashboard/components/TicketCard';
import { useClaimTicket } from '@/app/hooks/useMutations';

const TicketDetailModal = dynamic(() => import('./TicketDetailModal'), {
  ssr: false,
  loading: () => null,
});

const TicketUpdateModal = dynamic(() => import('./TicketUpdateModal'), {
  ssr: false,
  loading: () => null,
});

const ToastNotification = dynamic(() => import('./ToastNotification'), {
  ssr: false,
  loading: () => null,
});

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
}

interface GlobalSearchResult {
  id_ticket: number;
  incident: string;
  service_no: string | null;
  contact_phone: string | null;
  contact_name: string | null;
  ticket_id_gamas: string | null;
  customer_name: string | null;
  workzone: string | null;
  status: string | null;
  status_update: string | null;
  reported_date: string | Date | null;
  matched_on: string | null;
  users?: { nama: string | null } | null;
}

const MATCHED_LABELS: Record<string, string> = {
  service: 'No. SLA/Service',
  phone: 'No. Telepon',
  incident: 'Nomor Tiket',
  gamas: 'Nomor Gamas (SLA)',
  name: 'Nama Pelanggan',
};

function SearchBar({ value, onChange }: SearchBarProps) {
  const [inputValue, setInputValue] = useState(value);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync if value is reset from outside
  useEffect(() => {
    if (value === '' && inputValue !== '') {
      setInputValue('');
    }
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setInputValue(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => onChange(v), 300);
  };

  const handleClear = () => {
    setInputValue('');
    if (debounceRef.current) clearTimeout(debounceRef.current);
    onChange('');
  };

  return (
    <div className='relative'>
      <Search className='pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-(--text-tertiary)' />
      <input
        type='text'
        placeholder='Cari nomor tiket... (contoh: INC45671234)'
        value={inputValue}
        onChange={handleChange}
        className='w-full rounded-[28px] border border-(--border) bg-(--surface) py-3 pr-10 pl-10 text-sm text-(--text-primary) shadow-sm transition placeholder:text-(--text-tertiary) focus:border-black focus:ring-2 focus:ring-black/10 focus:outline-none dark:focus:border-white dark:focus:ring-white/10'
      />
      {inputValue && (
        <button
          type='button'
          onClick={handleClear}
          className='absolute top-1/2 right-3 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full bg-(--surface-2) text-(--text-secondary) transition-colors hover:bg-(--surface-3)'
        >
          <X size={12} />
        </button>
      )}
    </div>
  );
}

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}

function getPageRange(current: number, total: number): (number | '...')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | '...')[] = [1];
  if (current > 3) pages.push('...');
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  for (let i = start; i <= end; i++) pages.push(i);
  if (current < total - 2) pages.push('...');
  pages.push(total);
  return pages;
}

function Pagination({
  currentPage,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
}: PaginationProps) {
  if (totalPages <= 1) return null;

  const from = (currentPage - 1) * pageSize + 1;
  const to = Math.min(currentPage * pageSize, totalItems);
  const pages = getPageRange(currentPage, totalPages);

  const handlePageChange = (page: number) => {
    onPageChange(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className='flex flex-col items-center gap-2 pt-2'>
      <div className='flex items-center gap-1'>
        <button
          type='button'
          onClick={() => handlePageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className='flex min-h-11 items-center rounded-full border border-(--border) bg-(--surface) px-3 text-sm font-medium text-(--text-secondary) transition-colors hover:bg-(--surface-2) disabled:cursor-not-allowed disabled:opacity-50'
        >
          ←
        </button>
        {pages.map((p, i) =>
          p === '...' ? (
            <span
              key={`ellipsis-${i}`}
              className='flex h-8 w-8 items-center justify-center text-sm text-(--text-tertiary)'
            >
              …
            </span>
          ) : (
            <button
              key={`page-${p}`}
              type='button'
              onClick={() => handlePageChange(p as number)}
              className={`flex min-h-11 min-w-11 items-center justify-center rounded-lg text-sm font-medium transition-colors ${
                p === currentPage
                  ? 'bg-black text-white dark:bg-white dark:text-black'
                  : 'text-(--text-secondary) hover:bg-(--surface-2)'
              }`}
            >
              {p}
            </button>
          ),
        )}
        <button
          type='button'
          onClick={() => handlePageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          className='flex min-h-11 items-center rounded-full border border-(--border) bg-(--surface) px-3 text-sm font-medium text-(--text-secondary) transition-colors hover:bg-(--surface-2) disabled:cursor-not-allowed disabled:opacity-50'
        >
          →
        </button>
      </div>
      <p className='text-xs text-(--text-tertiary)'>
        Menampilkan {from}–{to} dari {totalItems} tiket
      </p>
    </div>
  );
}

export default function TeknisiDashboard() {
  const router = useRouter();
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showUpdateModal, setShowUpdateModal] = useState(false);

  const { toasts, dismissToast, showSuccess, showError } = useToast();
  const claimMutation = useClaimTicket();

  const {
    loading,
    filter,
    setFilter,
    paginatedTickets,
    tickets,
    currentPage,
    totalPages,
    totalItems,
    setPage,
    searchQuery,
    setSearchQuery,
    stats,
    refresh,
    highlightedIncidents,
  } = useTickets('all');

  // ── WO Tersedia (claimable) ───────────────────────────────
  const [claimable, setClaimable] = useState<GlobalSearchResult[]>([]);
  const [claimableLoading, setClaimableLoading] = useState(false);
  const [showClaimable, setShowClaimable] = useState(true);

  const fetchClaimable = useCallback(async () => {
    setClaimableLoading(true);
    try {
      const res = await fetchWithAuth('/api/tickets/claimable?take=20');
      const data = await res?.json();
      if (data?.success) setClaimable(data.data || []);
    } catch {
      // ignore
    } finally {
      setClaimableLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchClaimable();
  }, [fetchClaimable]);

  const handleClaim = async (ticket: GlobalSearchResult) => {
    try {
      await claimMutation.mutateAsync(ticket.id_ticket);
      showSuccess('Berhasil', `Tiket ${ticket.incident} berhasil diambil`);
      fetchClaimable();
      refresh();
    } catch (err) {
      showError('Gagal', err instanceof Error ? err.message : 'Gagal ambil tiket');
    }
  };

  const { pullDistance, ptrReady, ptrRefreshing } = usePullToRefresh({
    onRefresh: refresh,
    disabled: showDetailModal || showUpdateModal,
  });

  // ── Global search (ticket teknisi lain, read-only) ──────────
  const [globalResults, setGlobalResults] = useState<GlobalSearchResult[]>([]);
  const [globalSearchLoading, setGlobalSearchLoading] = useState(false);

  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 3) {
      setGlobalResults([]);
      setGlobalSearchLoading(false);
      return;
    }
    setGlobalSearchLoading(true);
    let cancelled = false;
    const debounce = setTimeout(async () => {
      try {
        const res = await fetchWithAuth(
          `/api/tickets/global-search?q=${encodeURIComponent(q)}`,
        );
        const data = await res?.json();
        if (cancelled) return;
        if (data?.success) {
          setGlobalResults(data.data.data || []);
        }
      } catch {
        if (cancelled) return;
        setGlobalResults([]);
      } finally {
        if (!cancelled) setGlobalSearchLoading(false);
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(debounce);
    };
  }, [searchQuery]);

  const globalResultsFiltered = useMemo(() => {
    if (globalResults.length === 0) return [];
    const ownedIncidents = new Set(tickets.map((t) => t.ticket));
    return globalResults.filter((r) => !ownedIncidents.has(r.incident));
  }, [globalResults, tickets]);

  const handleSelectTicket = useCallback(
    (ticket: Ticket) => {
      router.push(`/teknisi/ticket/${ticket.idTicket}`);
    },
    [router],
  );

  const handleTicketUpdated = useCallback(
    (type?: 'close' | 'pickup' | 'resume') => {
      void refresh();
      setShowUpdateModal(false);
      setSelectedTicket(null);
      setShowDetailModal(false);
      if (type === 'close') {
        showSuccess(
          'Tiket Berhasil Ditutup!',
          'Tiket telah berhasil di-close.',
        );
      } else if (type === 'pickup') {
        showSuccess(
          'Tiket Diambil',
          'Tiket berhasil di-pickup. Segera kerjakan!',
        );
      } else if (type === 'resume') {
        showSuccess(
          'Tiket Dilanjutkan',
          'Tiket kembali ke status On Progress.',
        );
      }
    },
    [refresh, showSuccess],
  );

  const handleCloseDetail = useCallback(() => {
    setShowUpdateModal(false);
    setShowDetailModal(false);
    setSelectedTicket(null);
  }, []);

  const handleCloseUpdate = useCallback(() => {
    setShowUpdateModal(false);
    setSelectedTicket(null);
  }, []);

  const handleUpdateClick = useCallback(() => {
    setShowDetailModal(false);
    setShowUpdateModal(true);
  }, []);

  const handleUpdateComplete = useCallback(() => {
    setShowUpdateModal(false);
    setSelectedTicket(null);
    void refresh();
    showSuccess('Update Tiket Tersimpan', 'Status tiket berhasil di-pending.');
  }, [refresh, showSuccess]);

  const handlePageChange = useCallback(
    (page: number) => {
      setPage(page);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [setPage],
  );

  // Dynamic empty state message
  const emptyMessage = (() => {
    const q = searchQuery.trim();
    if (q) {
      // Tiket ditemukan lewat Pencarian Global (milk teknisi lain) → jangan
      // bilang "tidak ditemukan"; arahkan ke section global di atas.
      if (globalResultsFiltered.length > 0) {
        return {
          icon: Search,
          title: `Tiket "${q}" tidak ada di daftar Anda`,
          subtitle:
            'Ditemukan di hasil Pencarian Global di atas (tiket teknisi lain)',
          showClearButton: true,
        };
      }
      return {
        icon: Search,
        title: `Tiket "${q}" tidak ditemukan`,
        subtitle: 'Coba cek nomor tiket kembali atau hapus pencarian',
        showClearButton: true,
      };
    }
    if (filter === 'closed') {
      return {
        icon: CheckCircle2,
        title: 'Belum ada ticket selesai',
        subtitle: 'Ticket yang selesai akan muncul di sini',
        showClearButton: false,
      };
    }
    return {
      icon: ClipboardList,
      title: 'Tidak ada ticket',
      subtitle: 'Ticket akan muncul ketika ditugaskan kepada Anda',
      showClearButton: false,
    };
  })();

  return (
    <div className='min-h-dvh bg-(--bg) px-4 pt-4 pb-28'>
      {/* Toast Notifications */}
      <ToastNotification toasts={toasts} onDismiss={dismissToast} />

      {/* Pull-to-refresh indicator */}
      <PullToRefresh
        pullDistance={pullDistance}
        ptrReady={ptrReady}
        ptrRefreshing={ptrRefreshing}
      />

      {/* Konten atas — dalam max-w-2xl */}
      <div className='mx-auto max-w-2xl space-y-6'>
        <DashboardHeader
          loading={loading}
          refreshing={ptrRefreshing}
          onRefresh={refresh}
        />

        <StatusGrid
          stats={stats}
          loading={loading}
          activeFilter={filter}
          onFilterChange={setFilter as (f: TicketFilter) => void}
        />

        <div className='space-y-3'>
          <SearchBar value={searchQuery} onChange={setSearchQuery} />
          <FilterChips
            stats={stats}
            activeFilter={filter}
            onFilterChange={setFilter as (f: TicketFilter) => void}
          />
        </div>

        {/* ── WO Tersedia ─ Tab baru: tiket open di SA teknisi, bisa Take Owner */}
        <section className='rounded-2xl border border-amber-200 bg-amber-50/60 p-4 dark:border-amber-500/20 dark:bg-amber-500/10'>
          <div className='flex items-center justify-between'>
            <div>
              <h3 className='text-sm font-bold text-amber-800 dark:text-amber-300'>WO Tersedia</h3>
              <p className='text-xs text-amber-700/70 dark:text-amber-400/70'>Tiket open di SA Anda — ambil untuk jadi owner</p>
            </div>
            <div className='flex items-center gap-2'>
              <span className='rounded-full bg-white px-2.5 py-1 text-xs font-bold text-amber-700 dark:bg-slate-800 dark:text-amber-300'>
                {claimableLoading ? '...' : `${claimable.length} tiket`}
              </span>
              <button
                onClick={fetchClaimable}
                disabled={claimableLoading}
                className='rounded-full border border-amber-200 bg-white px-3 py-1 text-xs font-medium text-amber-700 hover:bg-amber-50 dark:border-amber-500/30 dark:bg-slate-800 dark:text-amber-300'
              >
                Refresh
              </button>
              <button onClick={() => setShowClaimable((v) => !v)} className='text-xs font-medium text-amber-700 underline dark:text-amber-300'>
                {showClaimable ? 'Sembunyikan' : 'Tampilkan'}
              </button>
            </div>
          </div>

          {showClaimable && (
            <div className='mt-3'>
              {claimableLoading ? (
                <div className='flex items-center justify-center py-6 text-xs text-amber-700/60'>
                  <span className='h-4 w-4 animate-spin rounded-full border-2 border-amber-300 border-t-amber-600' /> Memuat...
                </div>
              ) : claimable.length === 0 ? (
                <p className='rounded-xl bg-white p-4 text-center text-sm text-slate-500 dark:bg-slate-800 dark:text-slate-400'>Tidak ada WO tersedia di SA Anda</p>
              ) : (
                <div className='space-y-2'>
                  {claimable.map((r) => (
                    <div
                      key={r.id_ticket}
                      className='flex items-center justify-between rounded-xl border border-amber-200 bg-white p-3 shadow-sm dark:border-amber-500/20 dark:bg-slate-800'
                    >
                      <div className='min-w-0 flex-1'>
                        <p className='font-mono text-sm font-bold text-slate-800 dark:text-white'>{r.incident}</p>
                        <p className='truncate text-xs text-slate-500 dark:text-slate-400'>
                          {[r.workzone, r.service_no, r.customer_name].filter(Boolean).join(' · ') || '—'}
                        </p>
                        {r.status_update && <span className='mt-1 inline-block rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600 dark:bg-slate-700 dark:text-slate-300'>{r.status_update}</span>}
                      </div>
                      <button
                        onClick={() => handleClaim(r)}
                        disabled={claimMutation.isPending}
                        className='ml-3 shrink-0 rounded-full bg-amber-500 px-4 py-2 text-xs font-bold text-white hover:bg-amber-600 disabled:opacity-50'
                      >
                        {claimMutation.isPending ? '...' : 'Ambil'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>

        {tickets.length > 0 && (
          <section className='space-y-3'>
            <div className='flex items-end justify-between'>
              <div>
                <p className='text-[10px] font-bold tracking-[0.32em] text-(--text-tertiary) uppercase'>
                  Daftar Ticket
                </p>
                <h2 className='mt-1 text-lg font-semibold text-(--text-primary)'>
                  Semua ticket teknisi
                </h2>
              </div>
              <div className='rounded-full border border-(--border) bg-(--surface-2) px-3 py-1 text-xs font-semibold text-(--text-secondary)'>
                {totalItems} total
              </div>
            </div>
            <div className='space-y-3'>
              {paginatedTickets.map((ticket) => (
                <TicketCard
                  key={ticket.idTicket}
                  ticket={ticket}
                  onClick={handleSelectTicket}
                  isHighlighted={highlightedIncidents.has(ticket.ticket)}
                />
              ))}
            </div>
          </section>
        )}

        {tickets.length > 0 && (
          <div className='pt-1'>
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={totalItems}
              pageSize={5}
              onPageChange={handlePageChange}
            />
          </div>
        )}

        {globalResultsFiltered.length > 0 && (
          <section className='space-y-3'>
            <div>
              <p className='text-[10px] font-bold tracking-[0.32em] text-(--text-tertiary) uppercase'>
                Pencarian Global
              </p>
              <h2 className='mt-1 text-lg font-semibold text-(--text-primary)'>
                Ticket teknisi lain · mode lihat
              </h2>
            </div>
            <div className='space-y-3'>
              {globalResultsFiltered.map((r) => {
                const handlerName = r.users?.nama || 'Teknisi lain';
                const matchedLabel = r.matched_on
                  ? MATCHED_LABELS[r.matched_on]
                  : null;
                return (
                  <button
                    key={r.id_ticket}
                    type='button'
                    onClick={() =>
                      router.push(`/teknisi/ticket/${r.id_ticket}?readonly=1`)
                    }
                    className='w-full rounded-2xl border border-(--border) bg-(--surface) p-4 text-left shadow-sm transition-all active:scale-[0.98]'
                  >
                    <div className='flex items-center justify-between gap-2'>
                      <p className='font-mono text-sm font-bold text-(--text-primary)'>
                        {r.incident}
                      </p>
                      <span className='inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-500/15 dark:text-amber-400'>
                        <Eye size={13} />
                        Mode Lihat
                      </span>
                    </div>
                    <p className='mt-1 text-xs text-(--text-secondary)'>
                      {[r.service_no, r.workzone, r.customer_name]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                    {matchedLabel && (
                      <span className='mt-1.5 inline-block rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-bold text-sky-700 dark:bg-sky-500/15 dark:text-sky-400'>
                        Cocok: {matchedLabel}
                      </span>
                    )}
                    <p className='mt-2 flex items-center gap-1 text-xs font-semibold text-(--text-secondary)'>
                      {/* <Wrench size={13} /> */}
                      Ditangani:{' '}
                      <span className='text-(--text-primary)'>
                        {handlerName}
                      </span>
                    </p>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {globalSearchLoading && globalResultsFiltered.length === 0 && (
          <div className='flex items-center justify-center gap-2 py-4 text-xs text-(--text-tertiary)'>
            <span className='h-3.5 w-3.5 animate-spin rounded-full border-2 border-(--border) border-t-current' />
            Mencari di seluruh ticket...
          </div>
        )}

        <section className='space-y-4'>
          {loading ? (
            <div className='flex items-center justify-center py-16'>
              <div className='h-10 w-10 animate-spin rounded-full border-4 border-black border-t-transparent dark:border-white dark:border-t-transparent' />
            </div>
          ) : tickets.length === 0 ? (
            <div className='rounded-4xl border border-dashed border-(--border) bg-(--surface) px-5 py-16 text-center shadow-sm'>
              <div className='mb-3 flex justify-center'>
                <emptyMessage.icon className='h-12 w-12 text-(--text-tertiary)' />
              </div>
              <p className='text-lg font-bold text-(--text-primary)'>
                {emptyMessage.title}
              </p>
              <p className='text-sm text-(--text-secondary)'>
                {emptyMessage.subtitle}
              </p>
              {emptyMessage.showClearButton && (
                <button
                  type='button'
                  onClick={() => setSearchQuery('')}
                  className='mt-4 rounded-full bg-black px-4 py-2 text-sm font-bold text-white transition-all active:scale-95'
                >
                  Hapus pencarian
                </button>
              )}
            </div>
          ) : null}
        </section>
      </div>

      {/* Modals */}
      {showDetailModal && selectedTicket && (
        <TicketDetailModal
          ticket={selectedTicket}
          onClose={handleCloseDetail}
          onUpdateClick={handleUpdateClick}
          onUpdated={handleTicketUpdated}
        />
      )}

      {showUpdateModal && selectedTicket && (
        <TicketUpdateModal
          ticket={selectedTicket}
          onClose={handleCloseUpdate}
          onUpdated={handleTicketUpdated}
        />
      )}

      <div className='fixed right-4 bottom-4 left-4 z-40 mx-auto max-w-2xl'>
        <div className='flex items-center justify-between rounded-[28px] bg-(--surface)/80 px-3 py-2 shadow-lg ring-1 ring-(--border) backdrop-blur-xl'>
          {[
            {
              key: 'home',
              icon: Home,
              label: 'Home',
              onClick: () => setFilter('all') as void,
            },
            {
              key: 'tickets',
              icon: TicketIcon,
              label: 'Tickets',
              onClick: () => setFilter('assigned') as void,
            },
            {
              key: 'war-map',
              icon: MapPin,
              label: 'War Map',
              onClick: () => router.push('/teknisi/war-map') as void,
            },
            {
              key: 'grid',
              icon: LayoutGrid,
              label: 'Grid',
              onClick: () => setFilter('closed') as void,
            },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.key}
                type='button'
                onClick={item.onClick}
                className='flex flex-1 flex-col items-center gap-1 rounded-[22px] px-3 py-2 text-[10px] font-bold text-(--text-secondary) transition-all active:scale-95'
              >
                <Icon size={18} />
                {item.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
