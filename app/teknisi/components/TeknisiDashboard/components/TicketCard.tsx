'use client';

import { addHours } from 'date-fns';
import { AlertTriangle, Clock, Phone } from 'lucide-react';
import type { Ticket } from '@/app/types/ticket';
import { isTicketClosed } from '@/app/libs/ticket-utils';
import { getSlaHours, parseWIBDateInput, formatDateTimeWIB } from '@/app/utils/datetime';

interface TicketCardProps {
  ticket: Ticket;
  onClick: (ticket: Ticket) => void;
  isHighlighted?: boolean;
}

function formatPhone(phone: string): string {
  if (!phone) return '-';
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.startsWith('0')) return `+62 ${cleaned.slice(1)}`;
  if (cleaned.startsWith('62')) return `+${cleaned}`;
  return cleaned;
}

function formatCustType(raw?: string | null): string {
  if (!raw) return '';
  const u = raw.toUpperCase();
  if (u.includes('DIAMOND')) return 'HVC Diamond';
  if (u.includes('PLATINUM')) return 'HVC Platinum';
  if (u.includes('GOLD')) return 'HVC Gold';
  if (u.includes('REGULER') || u.includes('REGULAR')) return 'Reguler';
  return raw;
}

const STATUS_BADGE: Record<string, { label: string; classes: string }> = {
  ASSIGNED: { label: 'Menunggu', classes: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20' },
  ON_PROGRESS: { label: 'Dikerjakan', classes: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20' },
  PENDING: { label: 'Pending', classes: 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-500/10 dark:text-purple-400 dark:border-purple-500/20' },
  CLOSED: { label: 'Selesai', classes: 'bg-green-50 text-green-700 border-green-200 dark:bg-green-500/10 dark:text-green-400 dark:border-green-500/20' },
  CLOSE: { label: 'Selesai', classes: 'bg-green-50 text-green-700 border-green-200 dark:bg-green-500/10 dark:text-green-400 dark:border-green-500/20' },
};

export default function TicketCard({ ticket, onClick, isHighlighted }: TicketCardProps) {
  const status = ((ticket.status_update ?? ticket.hasilVisit ?? '') as string).toUpperCase().trim();
  const closed = isTicketClosed(ticket.status_update);
  const activeKey = closed ? 'CLOSED' : status;
  const badge = STATUS_BADGE[activeKey];

  // SLA
  const slaInfo = (() => {
    const reported = parseWIBDateInput(ticket.reportedDate);
    if (!reported) return null;
    const hours = getSlaHours(ticket.customerType);
    const deadline = addHours(reported, hours);
    const diff = deadline.getTime() - Date.now();
    const overdue = diff < 0;
    const abs = Math.abs(diff);
    return {
      overdue,
      label: `${overdue ? '-' : ''}${Math.floor(abs / 3600000)}j ${Math.floor((abs % 3600000) / 60000)}m`,
      deadline: formatDateTimeWIB(deadline.toISOString()),
      pct: Math.min(100, Math.max(0, 100 - Math.round((diff / (hours * 3600000)) * 100))),
    };
  })();

  return (
    <button
      type='button'
      onClick={() => onClick(ticket)}
      className={`group w-full rounded-2xl border border-(--border) bg-(--surface) p-4 text-left shadow-sm transition-all active:scale-[0.98] ${
        isHighlighted ? 'animate-highlight-fade' : ''
      }`}
    >
      {/* ── Header: Label + Ticket ID + Status ──────────────── */}
      <div className='flex items-start justify-between gap-2'>
        <div className='min-w-0 flex-1'>
          <div className='flex items-center gap-2'>
            <span className='rounded-md border border-(--border) bg-(--surface-2) px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-(--text-tertiary) uppercase'>
              {ticket.jenisTiket || 'REG'}
            </span>
            <span className='font-mono text-xs font-bold text-(--text-secondary)'>
              {ticket.ticket}
            </span>
          </div>
        </div>
        {badge && (
          <span className={`inline-flex shrink-0 items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-bold ${badge.classes}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${activeKey === 'ASSIGNED' ? 'bg-amber-500' : activeKey === 'ON_PROGRESS' ? 'bg-blue-500' : activeKey === 'PENDING' ? 'bg-purple-500' : 'bg-green-500'}`} />
            {badge.label}
          </span>
        )}
      </div>

      {/* ── Summary ─────────────────────────────────────────── */}
      <p className='mt-2 line-clamp-2 text-sm font-semibold text-(--text-primary)'>
        {ticket.summary || ticket.symptom || 'Tidak ada deskripsi'}
      </p>

      {/* ── Customer Info ───────────────────────────────────── */}
      <div className='mt-3 space-y-1.5'>
        <div className='flex items-center justify-between'>
          <p className='text-xs font-bold text-(--text-primary) uppercase'>
            {ticket.contactName || '-'}
          </p>
          {ticket.contactPhone && (
            <a
              href={`https://wa.me/${ticket.contactPhone.replace(/\D/g, '').replace(/^0/, '62')}`}
              target='_blank'
              rel='noopener noreferrer'
              onClick={(e) => e.stopPropagation()}
              className='inline-flex items-center gap-1 rounded-lg bg-green-500 px-2 py-1 text-[10px] font-bold text-white transition-all active:scale-95'
            >
              <Phone size={11} />
              WhatsApp
            </a>
          )}
        </div>
        <p className='line-clamp-2 text-xs text-(--text-secondary)'>
          {ticket.alamat || 'Alamat belum terisi'}
        </p>
        {ticket.contactPhone && (
          <p className='text-xs text-(--text-secondary)'>{formatPhone(ticket.contactPhone)}</p>
        )}
      </div>

      {/* ── Service Detail ──────────────────────────────────── */}
      <div className='mt-3 flex flex-wrap items-center gap-2 border-t border-(--border) pt-3'>
        <span className='rounded-md border border-(--border) bg-(--surface-2) px-2 py-1 text-[10px] font-bold text-(--text-secondary)'>
          {ticket.serviceNo || '-'}
        </span>
        <span className='rounded-md bg-[#0052cc]/10 px-2 py-1 text-[10px] font-bold text-[#0052cc]'>
          {ticket.serviceType || 'Internet'}
        </span>
        {ticket.deviceName && ticket.deviceName !== '-' && (
          <span className='rounded-md border border-(--border) bg-(--surface-2) px-2 py-1 text-[10px] font-bold text-(--text-primary)'>
            {ticket.deviceName}
          </span>
        )}
        {ticket.onuRx && (
          <span className='rounded-md border border-(--border) bg-(--surface-2) px-2 py-1 text-[10px] font-mono font-bold text-(--text-primary)'>
            RX {ticket.onuRx}
          </span>
        )}
      </div>

      {/* ── SLA Monitor ─────────────────────────────────────── */}
      {closed ? (
        <div className='mt-3 flex items-center justify-between rounded-xl border border-green-200 bg-green-50 p-3 dark:border-green-500/20 dark:bg-green-500/10'>
          <div>
            <p className='text-[10px] font-bold text-(--text-tertiary) uppercase'>
              Ditutup
            </p>
            <p className='mt-0.5 text-xs font-bold text-green-700 dark:text-green-400'>
              {ticket.closedAt
                ? formatDateTimeWIB(ticket.closedAt)
                : 'Tiket selesai'}
            </p>
          </div>
          <span className='rounded-full bg-green-500 px-2.5 py-1 text-[10px] font-bold text-white'>
            Selesai
          </span>
        </div>
      ) : slaInfo ? (
        <div className='mt-3 space-y-1.5 rounded-xl border border-(--border) bg-(--surface-2) p-3'>
          <div className='flex items-center justify-between'>
            <span className='flex items-center gap-1 text-[10px] font-bold text-(--text-tertiary) uppercase'>
              <Clock size={11} />
              Max TTR
            </span>
            <span className={`text-xs font-bold ${slaInfo.overdue ? 'text-red-500' : 'text-orange-500'}`}>
              {slaInfo.label}
            </span>
          </div>
          <div className='h-1.5 w-full overflow-hidden rounded-full bg-(--surface-3)'>
            <div
              className={`h-full rounded-full transition-all ${slaInfo.overdue ? 'bg-red-500' : slaInfo.pct > 80 ? 'bg-orange-500' : 'bg-green-500'}`}
              style={{ width: `${slaInfo.pct}%` }}
            />
          </div>
          <p className='text-[10px] text-(--text-tertiary)'>{slaInfo.deadline}</p>
          {slaInfo.overdue && (
            <div className='flex items-center gap-1 text-[10px] font-bold text-red-500'>
              <AlertTriangle size={10} /> Terlambat
            </div>
          )}
        </div>
      ) : null}
    </button>
  );
}
