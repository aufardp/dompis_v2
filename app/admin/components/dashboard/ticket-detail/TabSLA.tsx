'use client';

import { Clock, Gauge, Layers, Calendar, CheckCircle2 } from 'lucide-react';
import type { TicketDetail } from './types';
import { formatShortDistance, formatDateTime, formatDate } from './helpers';
import { Field, Section } from './FieldSection';
import { TTRCard } from './TTRCard';
import { StatusBadge } from './Badges';

interface TabSLAProps {
  ticket: TicketDetail;
  ttrLabel: string;
  ttrDeadline: string | null;
}

export function TabSLA({ ticket, ttrLabel, ttrDeadline }: TabSLAProps) {
  return (
    <>
      <div className='mb-5 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800'>
        <div className='flex items-start justify-between gap-3'>
          <div>
            <p className='text-[10.5px] font-semibold tracking-wider text-slate-400 uppercase dark:text-slate-500'>
              SLA / TTR
            </p>
            <p className='mt-1 text-sm font-semibold text-slate-700 dark:text-slate-200'>{ttrLabel}</p>
            <p className='mt-0.5 text-xs text-slate-500 dark:text-slate-400'>
              Deadline: {ttrDeadline ? formatDateTime(ttrDeadline) : '—'}
            </p>
          </div>
          <div className='text-right'>
            <p className='text-[10.5px] font-semibold tracking-wider text-slate-400 uppercase dark:text-slate-500'>Closed</p>
            <p className='mt-1 text-sm font-semibold text-slate-700 dark:text-slate-200'>
              {ticket.closedAt ? formatShortDistance(ticket.closedAt) : '—'}
            </p>
            <p className='mt-0.5 text-xs text-slate-500 dark:text-slate-400'>{formatDateTime(ticket.closedAt)}</p>
          </div>
        </div>
      </div>

      <div className='mb-5'>
        <div className='mb-3 flex items-center gap-2 border-b border-slate-200 pb-2 dark:border-slate-700'>
          <CheckCircle2 size={14} className='text-slate-400' />
          <h3 className='text-xs font-semibold tracking-wider text-slate-600 uppercase dark:text-slate-400'>
            Status Comply (Retrospektif)
          </h3>
        </div>
        <div className='flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800'>
          <div>
            {ticket.ttrComplyStatus === 'comply' ? (
              <StatusBadge
                label='Comply'
                color='text-emerald-700 dark:text-emerald-400'
                bg='bg-emerald-50 border-emerald-200 dark:bg-emerald-500/10 dark:border-emerald-500/30'
                dot='bg-emerald-500'
              />
            ) : ticket.ttrComplyStatus === 'not_comply' ? (
              <StatusBadge
                label='Not Comply'
                color='text-red-700 dark:text-red-400'
                bg='bg-red-50 border-red-200 dark:bg-red-500/10 dark:border-red-500/30'
                dot='bg-red-500'
              />
            ) : (
              <span className='text-xs text-slate-400 dark:text-slate-500'>
                Belum dievaluasi
              </span>
            )}
            <p className='mt-1.5 text-[11px] text-slate-500 dark:text-slate-400'>
              Deadline dievaluasi: {ticket.ttrDeadlineAt ? formatDateTime(ticket.ttrDeadlineAt) : '—'}
            </p>
          </div>
        </div>

        {/* Acuan comply = resolve_date (Nossa). closed_at = pencatatan Dompis. */}
        <div className='mt-3 grid grid-cols-2 gap-3'>
          <div className='rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800'>
            <p className='text-[10.5px] font-semibold tracking-wider text-emerald-600 uppercase dark:text-emerald-400'>
              Resolve Date · Nossa
            </p>
            <p className='mt-1 text-sm font-semibold text-slate-700 dark:text-slate-200'>
              {ticket.resolveDate ? formatDateTime(ticket.resolveDate) : '—'}
            </p>
            <p className='mt-0.5 text-[11px] text-slate-400'>acuan comply / not-comply</p>
          </div>
          <div className='rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800'>
            <p className='text-[10.5px] font-semibold tracking-wider text-slate-400 uppercase dark:text-slate-500'>
              Closed · Dompis
            </p>
            <p className='mt-1 text-sm font-semibold text-slate-700 dark:text-slate-200'>
              {ticket.closedAt ? formatDateTime(ticket.closedAt) : '—'}
            </p>
            <p className='mt-0.5 text-[11px] text-slate-400'>
              {ticket.resolveDate && ticket.closedAt
                ? `selisih ${(
                    (new Date(ticket.closedAt).getTime() -
                      new Date(ticket.resolveDate).getTime()) /
                    3600000
                  ).toFixed(1)} jam`
                : 'saat status → close'}
            </p>
          </div>
        </div>
      </div>

      <div className='mb-5'>
        <div className='mb-3 flex items-center gap-2 border-b border-slate-200 pb-2 dark:border-slate-700'>
          <Clock size={14} className='text-slate-400' />
          <h3 className='text-xs font-semibold tracking-wider text-slate-600 uppercase dark:text-slate-400'>
            Max TTR per Segmen
          </h3>
        </div>
        <div className='grid grid-cols-2 gap-3'>
          {ticket.maxTtrReguler && <TTRCard label='Reguler' value={ticket.maxTtrReguler} />}
          {ticket.maxTtrGold && <TTRCard label='Gold' value={ticket.maxTtrGold} />}
          {ticket.maxTtrPlatinum && <TTRCard label='Platinum' value={ticket.maxTtrPlatinum} />}
          {ticket.maxTtrDiamond && <TTRCard label='Diamond' value={ticket.maxTtrDiamond} />}
        </div>
      </div>

      {(ticket.hours || ticket.durasiTicket || ticket.jamExpired || ticket.manjaExpired) && (
        <div className='mb-5'>
          <div className='mb-3 flex items-center gap-2 border-b border-slate-200 pb-2 dark:border-slate-700'>
            <Gauge size={14} className='text-slate-400' />
            <h3 className='text-xs font-semibold tracking-wider text-slate-600 uppercase dark:text-slate-400'>
              Durasi & Expired
            </h3>
          </div>
          <div className='rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800'>
            <div className='grid grid-cols-2 gap-x-4 gap-y-3'>
              <Field label='Hours' value={ticket.hours} />
              <Field label='Durasi Ticket' value={ticket.durasiTicket} />
              <Field label='Jam Expired' value={ticket.jamExpired} />
              <Field label='Manja Expired' value={ticket.manjaExpired} />
            </div>
          </div>
        </div>
      )}

      {(ticket.statusManja ||
        ticket.statusTtr12Gold ||
        ticket.statusTtr3Diamond ||
        ticket.statusTtr24Reguler ||
        ticket.statusTtr6Platinum ||
        ticket.statusTtrDatinK1 ||
        ticket.statusTtrDatinK2 ||
        ticket.statusTtrDatinK3 ||
        ticket.statusTtrIndibiz4Jam ||
        ticket.statusTtrReseller6Jam ||
        ticket.statusTtrWifiId) && (
        <div className='mb-5'>
          <div className='mb-3 flex items-center gap-2 border-b border-slate-200 pb-2 dark:border-slate-700'>
            <Layers size={14} className='text-slate-400' />
            <h3 className='text-xs font-semibold tracking-wider text-slate-600 uppercase dark:text-slate-400'>
              Status TTR
            </h3>
          </div>
          <div className='rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800'>
            <div className='grid grid-cols-2 gap-x-4 gap-y-3'>
              <Field label='Status Manja' value={ticket.statusManja} />
              <Field label='TTR 12h Gold' value={ticket.statusTtr12Gold} />
              <Field label='TTR 3h Diamond' value={ticket.statusTtr3Diamond} />
              <Field label='TTR 24h Reguler' value={ticket.statusTtr24Reguler} />
              <Field label='TTR 6h Platinum' value={ticket.statusTtr6Platinum} />
              <Field label='TTR Datin K1' value={ticket.statusTtrDatinK1} />
              <Field label='TTR Datin K2' value={ticket.statusTtrDatinK2} />
              <Field label='TTR Datin K3' value={ticket.statusTtrDatinK3} />
              <Field label='TTR Indibiz 4h' value={ticket.statusTtrIndibiz4Jam} />
              <Field label='TTR Reseller 6h' value={ticket.statusTtrReseller6Jam} />
              <Field label='TTR WiFi-ID' value={ticket.statusTtrWifiId} />
            </div>
          </div>
        </div>
      )}

      <Section icon={<Calendar size={14} />} title='Waktu Penting'>
        <Field label='Reported Date' value={formatDateTime(ticket.reportedDate)} />
        <Field label='Booking Date' value={formatDateTime(ticket.bookingDate)} />
        <Field label='Closed At' value={formatDateTime(ticket.closedAt)} />
        <Field label='Sync Date' value={ticket.syncDate ? formatDate(ticket.syncDate) : null} />
      </Section>
    </>
  );
}
