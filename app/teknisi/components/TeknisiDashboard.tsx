// app/teknisi/components/TeknisiDashboard.tsx

'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Ticket } from '@/app/types/ticket';
import TicketDetailModal from './TicketDetailModal';
import TicketUpdateModal from './TicketUpdateModal';
import ToastNotification from './ToastNotification';
import { useToast } from './hooks/useToast';

import {
  useTickets,
  usePullToRefresh,
  useTabScroll,
} from './TeknisiDashboard/hooks';
import {
  TicketCard,
  FilterTabs,
  StatsCards,
  PullToRefresh,
} from './TeknisiDashboard/components';
import { TicketFilter } from './TeknisiDashboard/constants/ticket';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
}

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
      <span className='pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-slate-400 dark:text-slate-500'>
        🔍
      </span>
      <input
        type='text'
        placeholder='Cari nomor tiket... (contoh: INC45671234)'
        value={inputValue}
        onChange={handleChange}
        className='w-full rounded-xl border border-slate-200 bg-white py-2.5 pr-9 pl-9 text-sm text-slate-700 shadow-sm transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500'
      />
      {inputValue && (
        <button
          type='button'
          onClick={handleClear}
          className='absolute top-1/2 right-3 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full bg-slate-200 text-slate-500 transition-colors hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-400 dark:hover:bg-slate-600'
        >
          ×
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
          className='flex min-h-11 items-center rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
        >
          ←
        </button>
        {pages.map((p, i) =>
          p === '...' ? (
            <span
              key={`ellipsis-${i}`}
              className='flex h-8 w-8 items-center justify-center text-sm text-slate-400 dark:text-slate-500'
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
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700'
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
          className='flex min-h-11 items-center rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
        >
          →
        </button>
      </div>
      <p className='text-xs text-slate-400 dark:text-slate-500'>
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

  const {
    loading,
    filter,
    setFilter,
    paginatedTickets,
    filteredTickets,
    currentPage,
    totalPages,
    setPage,
    searchQuery,
    setSearchQuery,
    stats,
    refresh,
  } = useTickets('all');

  const { pullDistance, ptrReady, ptrRefreshing } = usePullToRefresh({
    onRefresh: refresh,
    disabled: showDetailModal || showUpdateModal,
  });

  const { tabsRef, tabButtonRefs, showLeftFade, showRightFade } = useTabScroll({
    currentFilter: filter,
  });

  const handleSelectTicket = useCallback((ticket: Ticket) => {
    setSelectedTicket(ticket);
    setShowDetailModal(true);
  }, []);

  const handleTicketUpdated = useCallback(
    (type?: 'close' | 'pickup' | 'resume') => {
      void refresh();
      setSelectedTicket(null);
      setShowDetailModal(false);
      if (type === 'close') {
        showSuccess(
          'Tiket Berhasil Ditutup! 🎉',
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
    showSuccess(
      'Update Tiket Tersimpan ✓',
      'Status tiket berhasil di-pending.',
    );
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
    if (searchQuery.trim()) {
      return {
        icon: '🔍',
        title: `Tiket "${searchQuery}" tidak ditemukan`,
        subtitle: 'Coba cek nomor tiket kembali atau hapus pencarian',
        showClearButton: true,
      };
    }
    if (filter === 'closed') {
      return {
        icon: '✅',
        title: 'Belum ada ticket selesai',
        subtitle: 'Ticket yang selesai akan muncul di sini',
        showClearButton: false,
      };
    }
    return {
      icon: '📋',
      title: 'Tidak ada ticket',
      subtitle: 'Ticket akan muncul ketika ditugaskan kepada Anda',
      showClearButton: false,
    };
  })();

  return (
    <div className='min-h-dvh bg-linear-to-br from-slate-50 to-slate-100 px-4 pt-4 pb-6 dark:from-slate-900 dark:to-slate-950'>
      {/* Toast Notifications */}
      <ToastNotification toasts={toasts} onDismiss={dismissToast} />

      {/* Pull-to-refresh indicator */}
      <PullToRefresh
        pullDistance={pullDistance}
        ptrReady={ptrReady}
        ptrRefreshing={ptrRefreshing}
      />

      {/* Konten atas — dalam max-w-2xl */}
      <div className='mx-auto max-w-2xl space-y-4'>
        {/* Header */}
        <div className='flex items-center justify-between'>
          <div>
            <h1 className='text-xl font-bold text-slate-800 sm:text-2xl dark:text-slate-100'>
              My Tickets
            </h1>
            <p className='text-xs text-slate-500 sm:text-sm dark:text-slate-400'>
              Manage your assigned tickets
            </p>
          </div>

          <div className='flex items-center gap-2'>
            <button
              type='button'
              onClick={() => router.push('/teknisi/join')}
              className='flex h-11 w-11 items-center justify-center rounded-xl border border-blue-200 bg-blue-50 text-blue-600 shadow-sm hover:bg-blue-100 sm:h-auto sm:w-auto sm:gap-2 sm:px-3 sm:py-2 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-400 dark:hover:bg-blue-500/20'
              title='Scan Invite'
            >
              <span>📷</span>
              <span className='hidden text-sm font-semibold sm:inline'>Scan Invite</span>
            </button>

            <button
              type='button'
              onClick={() => void refresh()}
              disabled={loading || ptrRefreshing}
              className='flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white shadow-sm hover:bg-slate-50 disabled:opacity-50 sm:h-auto sm:w-auto sm:gap-2 sm:px-3 sm:py-2 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
              title='Refresh'
            >
              <span
                className={
                  loading || ptrRefreshing
                    ? 'inline-block animate-spin'
                    : 'inline-block'
                }
              >
                ↻
              </span>
              <span className='hidden text-sm font-semibold text-slate-700 sm:inline dark:text-slate-200'>
                Refresh
              </span>
            </button>
          </div>
        </div>

        {/* Stats Cards */}
        <StatsCards stats={stats} loading={loading} />

        {/* Search Bar */}
        <SearchBar value={searchQuery} onChange={setSearchQuery} />
      </div>

      {/* FilterTabs — di LUAR max-w-2xl, -mx-4 sekarang benar-benar full-width */}
      <FilterTabs
        currentFilter={filter}
        onFilterChange={setFilter as (f: TicketFilter) => void}
        stats={stats}
        tabsRef={tabsRef}
        tabButtonRefs={tabButtonRefs}
        showLeftFade={showLeftFade}
        showRightFade={showRightFade}
        onScroll={() => {}}
      />

      {/* Konten bawah — kembali dalam max-w-2xl */}
      <div className='mx-auto max-w-2xl space-y-4'>
        {/* Ticket List */}
{loading ? (
          <div className='flex items-center justify-center py-16'>
            <div className='h-10 w-10 animate-spin rounded-full border-4 border-blue-600 border-t-transparent' />
          </div>
        ) : filteredTickets.length === 0 ? (
          <div className='rounded-xl border border-dashed border-slate-300 bg-white py-16 text-center dark:border-slate-700 dark:bg-slate-800/50'>
            <div className='mb-3 text-5xl'>{emptyMessage.icon}</div>
            <p className='text-lg font-medium text-slate-600 dark:text-slate-300'>
              {emptyMessage.title}
            </p>
            <p className='text-sm text-slate-400 dark:text-slate-500'>
              {emptyMessage.subtitle}
            </p>
            {emptyMessage.showClearButton && (
              <button
                type='button'
                onClick={() => setSearchQuery('')}
                className='mt-3 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
              >
                Hapus pencarian
              </button>
            )}
          </div>
        ) : (
          <div className='grid gap-3'>
            {paginatedTickets.map((ticket) => (
              <TicketCard
                key={ticket.idTicket}
                ticket={ticket}
                onClick={handleSelectTicket}
              />
            ))}
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={filteredTickets.length}
              pageSize={5}
              onPageChange={handlePageChange}
            />
          </div>
        )}
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
    </div>
  );
}
