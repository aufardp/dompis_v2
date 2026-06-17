'use client';

import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, AlertTriangle, Shield } from 'lucide-react';
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
                          : 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-400',
                      )}
                    >
                      <AlertTriangle size={12} />
                      {ticket.flaggingManja === 'P1'
                        ? 'Manja HI'
                        : ticket.flaggingManja === 'P+'
                          ? 'Manja H+'
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
          <div className='flex flex-1 items-center justify-center'>
            <div className='flex flex-col items-center gap-3 text-slate-400'>
              {loading ? (
                <div className='h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-slate-500' />
              ) : (
                <div className='h-8 w-8 rounded-full border-2 border-slate-200' />
              )}
              <p className='text-sm'>Loading...</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  if (typeof window === 'undefined') return null;
  return createPortal(content, document.body);
}
