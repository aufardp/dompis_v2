'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { createPortal } from 'react-dom';
import { X, AlertTriangle, Shield, RotateCcw } from 'lucide-react';
import clsx from 'clsx';
import { fetchWithAuth } from '@/app/libs/fetcher';
import type {
  TicketDetail,
  TicketDetailDrawerProps,
  TabKey,
  EvidenceItem,
} from './ticket-detail/types';
import { STATUS_CONFIG, TAB_LIST, CTYPE_BORDER } from './ticket-detail/constants';
import { normalizeKey, formatShortDistance, pickTtrDeadline, formatTtrDelta, formatDateTime, getTicketStatusRaw } from './ticket-detail/helpers';
import { StatusBadge, CopyButton, CTypeBadge } from './ticket-detail/Badges';
import { TabUmum } from './ticket-detail/TabUmum';
import { TabCustomer } from './ticket-detail/TabCustomer';
import { TabTeknis } from './ticket-detail/TabTeknis';
import { TabSLA } from './ticket-detail/TabSLA';
import TrackingTimeline from './ticket-detail/TrackingTimeline';
import ReopenTicketModal from './ReopenTicketModal';
import { useAdminToast } from './admin-toast';

function TicketDetailDrawerLoading() {
  return (
    <phantom-ui suppressHydrationWarning fallback-radius={8}
      loading
      animation='shimmer'
      reveal={0.12}
      loading-label='Loading ticket detail'
    >
      <div className='flex h-full flex-col'>
        <div className='sticky top-0 z-10 border-b border-slate-200 bg-white px-5 py-4 shadow-sm dark:border-slate-700 dark:bg-slate-900'>
          <div className='mb-3 flex items-center justify-between'>
            <div className='flex items-center gap-2'>
              <div className='h-6 w-32 rounded-full bg-slate-200 dark:bg-slate-800' />
              <div className='h-7 w-20 rounded-full bg-slate-100 dark:bg-slate-800' />
              <div className='h-7 w-16 rounded-full bg-slate-100 dark:bg-slate-800' />
            </div>
            <div className='h-9 w-9 rounded-lg bg-slate-200 dark:bg-slate-800' />
          </div>

          <div className='flex flex-wrap items-center justify-between gap-3'>
            <div className='space-y-2'>
              <div className='h-4 w-40 rounded-full bg-slate-200 dark:bg-slate-800' />
              <div className='h-3.5 w-64 rounded-full bg-slate-100 dark:bg-slate-800/70' />
            </div>
          </div>

          <div className='mt-3 rounded-xl border-2 border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/60'>
            <div className='h-4 w-36 rounded-full bg-slate-200 dark:bg-slate-800' />
            <div className='mt-2 h-3 w-full rounded-full bg-slate-100 dark:bg-slate-800/70' />
            <div className='mt-2 h-3 w-5/6 rounded-full bg-slate-100 dark:bg-slate-800/70' />
          </div>

          <div className='mt-3 flex border-b border-slate-200 dark:border-slate-700'>
            {Array.from({ length: 5 }).map((_, index) => (
              <div
                key={index}
                className='relative px-4 py-2.5 text-xs font-medium text-slate-400'
              >
                <div className='h-3.5 w-16 rounded-full bg-slate-200 dark:bg-slate-800' />
              </div>
            ))}
          </div>
        </div>

        <div className='flex-1 overflow-y-auto bg-slate-50 px-5 py-4 dark:bg-slate-950'>
          <div className='space-y-4'>
            <div className='rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900'>
              <div className='h-4 w-24 rounded-full bg-slate-200 dark:bg-slate-800' />
              <div className='mt-4 grid gap-3 sm:grid-cols-2'>
                {Array.from({ length: 4 }).map((_, index) => (
                  <div
                    key={index}
                    className='rounded-xl border border-slate-100 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950/60'
                  >
                    <div className='h-3 w-16 rounded-full bg-slate-200 dark:bg-slate-800' />
                    <div className='mt-2 h-3.5 w-5/6 rounded-full bg-slate-100 dark:bg-slate-800/70' />
                  </div>
                ))}
              </div>
            </div>

            <div className='rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900'>
              <div className='h-4 w-28 rounded-full bg-slate-200 dark:bg-slate-800' />
              <div className='mt-4 space-y-3'>
                {Array.from({ length: 3 }).map((_, index) => (
                  <div
                    key={index}
                    className='rounded-xl border border-slate-100 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950/60'
                  >
                    <div className='h-3 w-32 rounded-full bg-slate-200 dark:bg-slate-800' />
                    <div className='mt-2 h-3 w-4/5 rounded-full bg-slate-100 dark:bg-slate-800/70' />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className='sticky bottom-0 flex gap-3 border-t border-slate-200 bg-linear-to-t from-white to-slate-50 px-5 py-4 shadow-lg dark:border-slate-800 dark:from-slate-900 dark:to-slate-950'>
          <div className='h-12 flex-1 rounded-xl border border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-800' />
          <div className='h-12 flex-1 rounded-xl bg-slate-200 dark:bg-slate-700' />
        </div>
      </div>
    </phantom-ui>
  );
}

export default function TicketDetailDrawer({
  open,
  onClose,
  ticket,
  loading = false,
  error = null,
  onRetry,
  onEdit,
  onUpdateStatus,
}: TicketDetailDrawerProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('umum');
  const [isVisible, setIsVisible] = useState(false);
  const [evidence, setEvidence] = useState<EvidenceItem[]>([]);
  const [evidenceLoading, setEvidenceLoading] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [reopenModalOpen, setReopenModalOpen] = useState(false);
  const [reopenLoading, setReopenLoading] = useState(false);
  const { showSuccess, showError } = useAdminToast();
  const router = useRouter();

  useEffect(() => {
    if (open) setActiveTab('umum');
  }, [open, ticket?.idTicket]);

  useEffect(() => {
    if (open) {
      setTimeout(() => setIsVisible(true), 10);
    } else {
      setIsVisible(false);
    }
  }, [open]);

  const handleClose = () => {
    setIsVisible(false);
    setTimeout(onClose, 300);
  };

  const ttrDeadline = useMemo(() => pickTtrDeadline(ticket), [ticket]);
  const ttrLabel = formatTtrDelta(ttrDeadline);
  const canReopen = useMemo(() => {
    if (!ticket) return false;
    const raw = getTicketStatusRaw(ticket);
    return raw.includes('close') || raw.includes('closed');
  }, [ticket]);

  const handleReopenConfirm = async () => {
    if (!ticket?.idTicket || reopenLoading) return;

    setReopenLoading(true);
    try {
      const res = await fetchWithAuth('/api/tickets/reopen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticketId: ticket.idTicket }),
      });
      const payload = await res?.json().catch(() => null);

      if (!res || !res.ok || !payload?.success) {
        showError(
          'Reopen ticket gagal',
          payload?.message ?? 'Ticket tidak berhasil direopen.',
        );
        return;
      }

      showSuccess(
        'Reopen ticket berhasil',
        ticket?.ticket
          ? `Ticket ${ticket.ticket} kembali ke open.`
          : 'Ticket kembali ke open.',
        { persist: true },
      );
      router.refresh();
    } catch (e) {
      console.error('Reopen ticket error:', e);
      showError(
        'Reopen ticket gagal',
        'Terjadi kesalahan saat memproses reopen ticket.',
      );
    } finally {
      setReopenLoading(false);
      setReopenModalOpen(false);
    }
  };

  useEffect(() => {
    if (!open || !ticket?.idTicket) {
      setEvidence([]);
      setEvidenceLoading(false);
      return;
    }

    const shouldFetchEvidence = (() => {
      const raw = getTicketStatusRaw(ticket);
      return raw.includes('close') || raw.includes('pending');
    })();

    if (!shouldFetchEvidence) {
      setEvidence([]);
      setEvidenceLoading(false);
      return;
    }

    let cancelled = false;
    setEvidenceLoading(true);
    fetchWithAuth(`/api/tickets/${ticket.idTicket}/evidence`)
      .then((r) => (r ? r.json().catch(() => null) : null))
      .then((d) => {
        if (cancelled) return;
        if (d?.success) setEvidence(d.data ?? []);
      })
      .catch(() => {})
      .finally(() => {
        if (cancelled) return;
        setEvidenceLoading(false);
      });

    return () => { cancelled = true; };
  }, [open, ticket?.idTicket, ticket?.status_update, ticket?.statusUpdate, ticket?.hasilVisit, ticket?.status]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open && !isVisible) return null;

  const workflowKey = normalizeKey(
    ticket?.status_update ?? ticket?.statusUpdate ?? ticket?.hasilVisit ?? ticket?.status ?? '',
  );
  const workflowConfig = STATUS_CONFIG[workflowKey] || {
    label: workflowKey || '—',
    color: 'text-slate-600',
    bg: 'bg-slate-50',
    dot: 'bg-slate-500',
  };

  const content = (
    <div
      className={clsx(
        'fixed inset-0 z-50 flex justify-end transition-all duration-300 ease-out',
        isVisible ? 'bg-black/40 backdrop-blur-sm' : 'bg-transparent',
      )}
      onClick={handleClose}
    >
      <div
        className={clsx(
          'flex h-full w-full max-w-130 transform flex-col bg-white shadow-2xl transition-transform duration-300 ease-out dark:bg-slate-900',
          isVisible ? 'translate-x-0' : 'translate-x-full',
        )}
        style={{ transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {ticket ? (
          <>
            <div className='sticky top-0 z-10 border-b border-slate-200 bg-white px-5 py-4 shadow-sm dark:border-slate-700 dark:bg-slate-900'>
              <div className='mb-3 flex items-center justify-between'>
                <div className='flex items-center gap-2'>
                  <span className='font-mono text-base font-bold text-slate-900 dark:text-white'>
                    {ticket.ticket}
                  </span>
                  <CopyButton text={ticket.ticket} label='Copy ticket code' />
                  {ticket.flaggingManja && (
                    <span
                      className={clsx(
                        'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold shadow-sm',
                        ticket.flaggingManja === 'P1'
                          ? 'border-red-300 bg-red-50 text-red-700 dark:border-red-500/40 dark:bg-red-500/15 dark:text-red-400'
                          : ticket.flaggingManja === 'P+'
                            ? 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-400'
                            : 'border-slate-300 bg-slate-50 text-slate-700 dark:border-slate-500/40 dark:bg-slate-500/15 dark:text-slate-300',
                      )}
                    >
                      <AlertTriangle size={12} />
                      {ticket.flaggingManja === 'P1'
                        ? 'Manja HI'
                        : ticket.flaggingManja === 'P+'
                          ? 'Manja H+'
                          : ticket.flaggingManja === 'EXPIRED'
                            ? 'Manja Expired'
                            : ticket.flaggingManja}
                    </span>
                  )}
                  {ticket.flaggingDatin && (
                    <span className='inline-flex items-center gap-1 rounded-full border border-purple-300 bg-purple-50 px-2.5 py-1 text-xs font-semibold text-purple-700 shadow-sm dark:border-purple-500/40 dark:bg-purple-500/15 dark:text-purple-400'>
                      <Shield size={12} />
                      {ticket.flaggingDatin}
                    </span>
                  )}
                  {ticket.guaranteeStatus?.toLowerCase() === 'guarantee' && (
                    <span className='inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 shadow-sm dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-400'>
                      <Shield size={12} />
                      FFG
                    </span>
                  )}
                  <StatusBadge {...workflowConfig} />
                  <CTypeBadge ctype={ticket.ctype} />
                </div>
                <button
                  onClick={handleClose}
                  className='rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600'
                >
                  <X size={20} />
                </button>
              </div>

              <div className='flex flex-wrap items-center justify-between gap-3'>
                <div className='min-w-0'>
                  <p className='truncate text-sm font-medium text-slate-500'>
                    {ticket.contactName || '—'}
                  </p>
                  <p className='mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500'>
                    <span className='font-mono'>{ticket.serviceNo || '—'}</span>
                    <span className='hidden sm:inline'>•</span>
                    <span className='truncate'>{ticket.workzone || '—'}</span>
                    {ticket.serviceNo && (
                      <CopyButton text={ticket.serviceNo} label='Copy service number' />
                    )}
                  </p>
                </div>
              </div>

              {ticket.hasilVisit === 'PENDING' && ticket.pendingDompis && (
                <div className='mt-3 rounded-xl border-2 border-purple-200 bg-purple-50 p-4 shadow-sm'>
                  <div className='flex items-start gap-3'>
                    <div className='flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-purple-100'>
                      <AlertTriangle size={18} className='text-purple-600' />
                    </div>
                    <div className='flex-1'>
                      <h4 className='text-sm font-bold text-purple-900'>⏸ Ticket Pending</h4>
                      <p className='mt-1 text-sm text-purple-800'>{ticket.pendingDompis}</p>
                      {ticket.closedAt && (
                        <p className='mt-2 text-xs text-purple-600'>Closed: {formatDateTime(ticket.closedAt)}</p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {ticket.sqmUpdateReason && (
                <div className='mt-3 rounded-xl border-2 border-violet-200 bg-violet-50 p-4 shadow-sm dark:border-violet-500/20 dark:bg-violet-500/10'>
                  <div className='flex items-start gap-3'>
                    <div className='flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-100 dark:bg-violet-500/20'>
                      <AlertTriangle size={18} className='text-violet-600 dark:text-violet-300' />
                    </div>
                    <div className='flex-1'>
                      <h4 className='text-sm font-bold text-violet-900 dark:text-violet-100'>
                        SQM Update Reason
                      </h4>
                      <p className='mt-1 text-sm text-violet-800 dark:text-violet-200'>
                        {ticket.sqmUpdateReason}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div className='mt-3 flex border-b border-slate-200 dark:border-slate-700'>
                {TAB_LIST.map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key as TabKey)}
                    className={clsx(
                      'relative px-4 py-2.5 text-xs font-medium transition-colors',
                      activeTab === tab.key
                        ? 'font-semibold text-slate-900 dark:text-white'
                        : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200',
                    )}
                  >
                    {tab.label}
                    {activeTab === tab.key && (
                      <span className='absolute right-0 bottom-0 left-0 h-0.5 bg-slate-900 dark:bg-white' />
                    )}
                  </button>
                ))}
              </div>
            </div>

            <div className='flex-1 overflow-y-auto bg-slate-50 px-5 py-4 dark:bg-slate-950'>
              {activeTab === 'umum' && (
                <TabUmum
                  ticket={ticket}
                  ttrDeadline={ttrDeadline}
                  ttrLabel={ttrLabel}
                  workflowConfig={workflowConfig}
                  workflowKey={workflowKey}
                />
              )}
              {activeTab === 'customer' && <TabCustomer ticket={ticket} />}
              {activeTab === 'teknis' && (
                <TabTeknis
                  ticket={ticket}
                  evidence={evidence}
                  evidenceLoading={evidenceLoading}
                  onGalleryOpen={(idx) => { setGalleryIndex(idx); setGalleryOpen(true); }}
                  galleryIndex={galleryIndex}
                  galleryOpen={galleryOpen}
                  onGalleryClose={() => setGalleryOpen(false)}
                />
              )}
              {activeTab === 'sla' && (
                <TabSLA ticket={ticket} ttrLabel={ttrLabel} ttrDeadline={ttrDeadline} />
              )}
              {activeTab === 'tracking' && ticket && <TrackingTimeline ticket={ticket} />}
            </div>

            <div className='sticky bottom-0 flex gap-3 border-t border-slate-200 bg-linear-to-t from-white to-slate-50 px-5 py-4 shadow-lg dark:border-slate-800 dark:from-slate-900 dark:to-slate-950'>
              {canReopen && (
                <button
                  onClick={() => setReopenModalOpen(true)}
                  className='flex-1 rounded-xl border-2 border-sky-300 bg-sky-50 px-4 py-3 text-sm font-semibold text-sky-700 transition-all hover:border-sky-400 hover:bg-sky-100 active:scale-[0.98] dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300 dark:hover:bg-sky-500/15'
                >
                  <span className='inline-flex items-center justify-center gap-2'>
                    <RotateCcw size={16} />
                    Reopen Ticket
                  </span>
                </button>
              )}
              {onEdit && (
                <button
                  onClick={() => onEdit(ticket)}
                  className='flex-1 rounded-xl border-2 border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition-all hover:border-slate-400 hover:bg-slate-50 active:scale-[0.98] dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
                >
                  ✏️ Edit Tiket
                </button>
              )}
              {onUpdateStatus && (
                <button
                  onClick={() => onUpdateStatus(ticket)}
                  className='flex-1 rounded-xl bg-linear-to-r from-slate-900 to-slate-800 px-4 py-3 text-sm font-semibold text-white shadow-md transition-all hover:from-slate-800 hover:to-slate-700 active:scale-[0.98] dark:from-slate-700 dark:to-slate-600'
                >
                  🔄 Update Status
                </button>
              )}
            </div>
          </>
        ) : error ? (
          <div className='flex flex-1 items-center justify-center px-6'>
            <div className='w-full max-w-sm rounded-xl border border-red-200 bg-red-50 p-4 text-center dark:border-red-500/30 dark:bg-red-500/10'>
              <p className='text-sm font-semibold text-red-700 dark:text-red-400'>Failed to load ticket</p>
              <p className='mt-1 text-xs text-red-700/80 dark:text-red-400/80'>{error}</p>
              <div className='mt-4 flex items-center justify-center gap-2'>
                {onRetry && (
                  <button
                    type='button'
                    onClick={onRetry}
                    className='rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800 dark:bg-slate-700 dark:hover:bg-slate-600'
                  >
                    Retry
                  </button>
                )}
                <button
                  type='button'
                  onClick={handleClose}
                  className='rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        ) : (
          <TicketDetailDrawerLoading />
        )}
      </div>
      <ReopenTicketModal
        open={reopenModalOpen}
        onClose={() => {
          if (reopenLoading) return;
          setReopenModalOpen(false);
        }}
        onConfirm={handleReopenConfirm}
        ticketCode={ticket?.ticket}
        loading={reopenLoading}
      />
    </div>
  );

  if (typeof window === 'undefined') return null;
  return createPortal(content, document.body);
}
