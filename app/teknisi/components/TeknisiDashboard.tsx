// app/teknisi/components/TeknisiDashboard.tsx

'use client';

import { useState, useCallback } from 'react';
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

export default function TeknisiDashboard() {
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showUpdateModal, setShowUpdateModal] = useState(false);

  const { toasts, dismissToast, showSuccess, showError } = useToast();

  const { loading, filter, setFilter, filteredTickets, stats, refresh } =
    useTickets('all');

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

  const handleTicketUpdated = useCallback((type?: 'close' | 'pickup' | 'resume') => {
    void refresh();
    setSelectedTicket(null);
    setShowDetailModal(false);
    if (type === 'close') {
      showSuccess('Tiket Berhasil Ditutup! 🎉', 'Tiket telah berhasil di-close.');
    } else if (type === 'pickup') {
      showSuccess('Tiket Diambil', 'Tiket berhasil di-pickup. Segera kerjakan!');
    } else if (type === 'resume') {
      showSuccess('Tiket Dilanjutkan', 'Tiket kembali ke status On Progress.');
    }
  }, [refresh, showSuccess]);

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
    showSuccess('Update Tiket Tersimpan ✓', 'Status tiket berhasil di-pending.');
  }, [refresh, showSuccess]);

  return (
    <div className='min-h-screen bg-linear-to-br from-slate-50 to-slate-100 p-4 md:p-6 lg:p-8'>
      {/* Toast Notifications */}
      <ToastNotification toasts={toasts} onDismiss={dismissToast} />

      {/* Pull-to-refresh indicator */}
      <PullToRefresh
        pullDistance={pullDistance}
        ptrReady={ptrReady}
        ptrRefreshing={ptrRefreshing}
      />

      <div className='mx-auto max-w-5xl space-y-6'>
        {/* Header */}
        <div className='flex items-center justify-between'>
          <div>
            <h1 className='text-2xl font-bold text-slate-800'>My Tickets</h1>
            <p className='text-slate-500'>Manage your assigned tickets</p>
          </div>

          <button
            type='button'
            onClick={() => void refresh()}
            disabled={loading || ptrRefreshing}
            className='inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50'
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
            <span className='hidden sm:inline'>Refresh</span>
          </button>
        </div>

        {/* Stats Cards */}
        <StatsCards stats={stats} loading={loading} />

        {/* Filter Tabs */}
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

        {/* Ticket List */}
        {loading ? (
          <div className='flex items-center justify-center py-16'>
            <div className='h-10 w-10 animate-spin rounded-full border-4 border-blue-600 border-t-transparent' />
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
          <div className='-mx-2 grid gap-3 sm:mx-0 sm:gap-4'>
            {filteredTickets.map((ticket) => (
              <TicketCard
                key={ticket.idTicket}
                ticket={ticket}
                onClick={handleSelectTicket}
              />
            ))}
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
          onUpdated={handleUpdateComplete}
        />
      )}
    </div>
  );
}
