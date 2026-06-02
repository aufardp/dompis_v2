'use client';

import { Activity, Settings } from 'lucide-react';
import clsx from 'clsx';
import type { TicketDetail } from './types';
import { formatDateTime, formatShortDistance, getTTRUrgency } from './helpers';
import { Field, Section } from './FieldSection';

interface TabUmumProps {
  ticket: TicketDetail;
  ttrDeadline: string | null;
  ttrLabel: string;
  workflowConfig: { label: string };
  workflowKey: string;
}

export function TabUmum({
  ticket,
  ttrDeadline,
  ttrLabel,
  workflowConfig,
  workflowKey,
}: TabUmumProps) {
  const ttrUrgency = getTTRUrgency(ttrDeadline);

  return (
    <>
      <div
        className={clsx(
          'mb-5 rounded-xl border-2 bg-linear-to-br p-5 shadow-md',
          ttrUrgency === 'overdue'
            ? 'border-red-300 from-red-50 to-red-100 dark:border-red-500/40 dark:from-red-500/15 dark:to-red-500/10'
            : ttrUrgency === 'warning'
              ? 'border-amber-300 from-amber-50 to-amber-100 dark:border-amber-500/40 dark:from-amber-500/15 dark:to-amber-500/10'
              : 'border-slate-200 from-slate-50 to-slate-100 dark:border-slate-700 dark:from-slate-800 dark:to-slate-700',
        )}
      >
        <div className='flex items-start justify-between gap-4'>
          <div>
            <p className='text-[10px] font-bold tracking-wider text-slate-400 uppercase dark:text-slate-500'>
              SLA / TTR
            </p>
            <p
              className={clsx(
                'mt-1.5 text-base font-bold',
                ttrUrgency === 'overdue'
                  ? 'text-red-500'
                  : ttrUrgency === 'warning'
                    ? 'text-amber-700'
                    : 'text-slate-700',
              )}
            >
              {ttrLabel}
            </p>
            <p className='mt-1 text-xs text-slate-500'>
              Deadline: {ttrDeadline ? formatDateTime(ttrDeadline) : '—'}
            </p>
          </div>
          <div className='text-right'>
            <p className='text-[10px] font-bold tracking-wider text-slate-400 uppercase'>
              Reported
            </p>
            <p className='mt-1.5 text-sm font-bold text-slate-700 dark:text-slate-200'>
              {formatShortDistance(ticket.reportedDate)}
            </p>
            <p className='mt-1 text-xs text-slate-500'>
              {formatDateTime(ticket.reportedDate)}
            </p>
          </div>
        </div>
      </div>

      <div className='mb-5 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800'>
        <p className='mb-2 text-xs font-bold tracking-wider text-slate-400 uppercase dark:text-slate-500'>
          Summary
        </p>
        <p className='text-sm leading-relaxed text-slate-700 dark:text-slate-300'>
          {ticket.summary}
        </p>
      </div>

      <Section
        icon={<Activity size={14} />}
        title='Informasi Tiket'
        variant='highlighted'
      >
        <Field label='Ticket' value={ticket.ticket} mono />
        <Field
          label='Reported Date'
          value={formatDateTime(ticket.reportedDate)}
        />
        <Field label='Source Ticket' value={ticket.sourceTicket} />
        <Field label='Classification' value={ticket.classificationFlag} />
        <Field label='Jenis Tiket' value={ticket.jenisTiket} />
        <Field label='Jenis Tiket (Group)' value={ticket.jenisTiket1} />
        <Field label='Owner Group' value={ticket.ownerGroup} />
        <Field
          label='Booking Date'
          value={formatDateTime(ticket.bookingDate)}
        />
        <Field label='Realm' value={ticket.realm} />
        <Field label='Ticket ID GAMAS' value={ticket.ticketIdGamas} mono />
      </Section>

      <Section icon={<Settings size={14} />} title='Status & Hasil'>
        <Field
          label='status dompis'
          value={workflowConfig?.label?.toUpperCase() || '-'}
        />

        {ticket?.status && (
          <Field label='STATUS INSERA' value={ticket.status} />
        )}

        {/* Menggunakan optional chaining dan memberikan fallback jika data kosong */}
        <Field
          label='Closed At'
          value={ticket?.closedAt ? formatDateTime(ticket.closedAt) : '-'}
        />

        {ticket?.statusDate && (
          <Field label='Status Date' value={ticket.statusDate} />
        )}

        <Field
          label='Worklog Summary'
          value={ticket?.worklogSummary || '-'}
          fullWidth
        />
      </Section>
    </>
  );
}
