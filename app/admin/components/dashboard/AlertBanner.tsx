'use client';

import { useState, useMemo } from 'react';
import { ChevronDown, ChevronUp, UserPlus, Clock } from 'lucide-react';
import clsx from 'clsx';

interface ExpiredTicket {
  ticketId: string;
  customerType: string;
  reportedAt: Date;
  status: string;
  overdueHours: number;
  workzone?: string | null;
  idTicket?: number;
}

interface AlertBannerProps {
  tickets: ExpiredTicket[];
}

function formatDateTime(date: Date): string {
  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${day}/${month}/${year} ${hours}:${minutes}`;
}

function getAgeBadge(hours: number): { label: string; className: string } {
  if (hours < 1) {
    return { label: `${Math.round(hours * 60)}m`, className: 'bg-emerald-500/20 text-emerald-400' };
  }
  if (hours <= 3) {
    return { label: `${Math.round(hours)}h`, className: 'bg-amber-500/20 text-amber-400' };
  }
  return { label: `${Math.round(hours)}h`, className: 'bg-red-500/20 text-red-400 animate-pulse' };
}

function getStatusBadge(status: string): { label: string; className: string } {
  const s = (status || '').toLowerCase();
  if (s === 'open') return { label: 'OPEN', className: 'bg-amber-500/20 text-amber-400' };
  if (s === 'assigned') return { label: 'ASSIGNED', className: 'bg-blue-500/20 text-blue-400' };
  if (s === 'on_progress') return { label: 'ON PROGRESS', className: 'bg-orange-500/20 text-orange-400' };
  return { label: s.toUpperCase() || 'UNKNOWN', className: 'bg-slate-500/20 text-slate-400' };
}

export function AlertBanner({ tickets }: AlertBannerProps) {
  if (tickets.length === 0) return null;

  const firstTicket = tickets[0];
  const maxOverdue = Math.max(...tickets.map((t) => t.overdueHours));

  return (
    <div className='relative overflow-hidden rounded-2xl border border-red-500/30 bg-gradient-to-br from-red-500/10 via-red-500/5 to-transparent'>
      {/* Animated pulse border */}
      <div className='pointer-events-none absolute inset-0 rounded-2xl border-2 border-red-500/20 animate-pulse' />

      {/* Header */}
      <div className='relative z-10 flex flex-col gap-3 p-4 md:p-5'>
        <div className='flex items-center justify-between'>
          <div className='flex items-center gap-3'>
            <div className='flex h-10 w-10 items-center justify-center rounded-xl bg-red-500/20 text-xl'>
              ⚠️
            </div>
            <div>
              <p className='text-base font-bold text-red-400 md:text-lg'>
                {tickets.length} Expired Ticket Perlu Perhatian!
              </p>
              <p className='text-xs text-(--text-secondary)'>
                TTR terlampaui — butuh segera ditindak lanjuti
              </p>
            </div>
          </div>

          <div className='flex items-center gap-2'>
            <span className='rounded-full bg-red-500 px-3 py-1.5 text-xs font-bold text-white shadow-lg shadow-red-500/30'>
              ⚠️ {Math.round(maxOverdue)}h OVERDUE
            </span>
          </div>
        </div>

        {/* First ticket preview */}
        <div className='flex flex-wrap items-center gap-3 rounded-xl border border-red-500/10 bg-red-500/5 px-4 py-3'>
          <span className='font-mono text-sm font-bold text-red-400'>
            {firstTicket.ticketId}
          </span>
          <span className='text-xs text-amber-400'>⚡ {firstTicket.customerType}</span>
          {firstTicket.workzone && (
            <span className='text-xs text-(--text-secondary)'>📍 {firstTicket.workzone}</span>
          )}
          <span className='text-xs text-(--text-secondary)'>
            {formatDateTime(firstTicket.reportedAt)}
          </span>
          <span
            className={clsx(
              'rounded-full px-2 py-0.5 text-[10px] font-bold',
              getStatusBadge(firstTicket.status).className,
            )}
          >
            {getStatusBadge(firstTicket.status).label}
          </span>
          <span className='ml-auto text-[10px] text-(--text-secondary)'>
            +{tickets.length - 1} tiket lainnya
          </span>
        </div>
      </div>
    </div>
  );
}

interface DiamondAlertBannerProps {
  tickets: ExpiredTicket[];
  onAssign?: (ticketId: string, idTicket?: number) => void;
}

export function DiamondAlertBanner({
  tickets,
  onAssign,
}: DiamondAlertBannerProps) {
  const [expanded, setExpanded] = useState(false);
  const MAX_VISIBLE = 5;

  const statusSummary = useMemo(() => {
    return tickets.reduce(
      (acc, ticket) => {
        const status = (ticket.status || 'open').toLowerCase();
        if (status === 'assigned') acc.assigned++;
        else if (status === 'on_progress') acc.onProgress++;
        else if (status === 'pending') acc.pending++;
        else acc.open++;
        return acc;
      },
      { open: 0, assigned: 0, onProgress: 0, pending: 0 },
    );
  }, [tickets]);

  const oldestHours = useMemo(() => {
    if (tickets.length === 0) return 0;
    return Math.max(...tickets.map((ticket) => ticket.overdueHours));
  }, [tickets]);

  const visibleTickets = useMemo(() => {
    if (expanded || tickets.length <= MAX_VISIBLE) return tickets;
    return tickets.slice(0, MAX_VISIBLE);
  }, [tickets, expanded]);

  if (tickets.length === 0) return null;

  return (
    <div className='relative overflow-hidden rounded-2xl border border-cyan-500/30 bg-gradient-to-br from-cyan-500/10 via-cyan-500/5 to-transparent'>
      {/* Animated shimmer border */}
      <style>{`
        @keyframes shimmer {
          0% { opacity: 0.3; }
          50% { opacity: 0.8; }
          100% { opacity: 0.3; }
        }
        .shimmer-border { animation: shimmer 2s ease-in-out infinite; }
      `}</style>
      <div className='pointer-events-none absolute inset-0 rounded-2xl border-2 border-cyan-500/20 shimmer-border' />

      {/* Header */}
      <div className='relative z-10 flex flex-col gap-3 p-4 md:p-5'>
        <div className='flex items-center justify-between'>
          <div className='flex items-center gap-3'>
            <div className='flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/20 text-xl'>
              💎
            </div>
            <div>
              <p className='text-base font-bold text-cyan-400 md:text-lg'>
                {tickets.length} Diamond Ticket Perlu Perhatian!
              </p>
              <p className='text-xs text-(--text-secondary)'>
                Prioritas tertinggi — fokus pada open dan belum progress
              </p>
            </div>
          </div>

          <div className='flex flex-wrap items-center gap-2'>
            <span className='rounded-full bg-cyan-500 px-3 py-1.5 text-xs font-bold text-white shadow-lg shadow-cyan-500/30'>
              💎 DIAMOND
            </span>
            <span className='rounded-full bg-red-500/15 px-3 py-1.5 text-xs font-bold text-red-300'>
              Open {statusSummary.open}
            </span>
            <span className='rounded-full bg-blue-500/15 px-3 py-1.5 text-xs font-bold text-blue-300'>
              Assigned {statusSummary.assigned}
            </span>
            <span className='rounded-full bg-orange-500/15 px-3 py-1.5 text-xs font-bold text-orange-300'>
              Progress {statusSummary.onProgress}
            </span>
          </div>
        </div>

        <div className='grid grid-cols-2 gap-2 md:grid-cols-4'>
          <div className='rounded-xl border border-cyan-500/10 bg-cyan-500/5 px-3 py-2'>
            <p className='text-[10px] font-bold uppercase tracking-wide text-cyan-300'>Total</p>
            <p className='text-lg font-black text-cyan-100'>{tickets.length}</p>
          </div>
          <div className='rounded-xl border border-red-500/10 bg-red-500/5 px-3 py-2'>
            <p className='text-[10px] font-bold uppercase tracking-wide text-red-300'>Butuh Assign</p>
            <p className='text-lg font-black text-red-100'>{statusSummary.open}</p>
          </div>
          <div className='rounded-xl border border-amber-500/10 bg-amber-500/5 px-3 py-2'>
            <p className='text-[10px] font-bold uppercase tracking-wide text-amber-300'>Belum Progress</p>
            <p className='text-lg font-black text-amber-100'>{statusSummary.assigned + statusSummary.pending}</p>
          </div>
          <div className='rounded-xl border border-slate-500/10 bg-slate-500/5 px-3 py-2'>
            <p className='text-[10px] font-bold uppercase tracking-wide text-slate-300'>Tertua</p>
            <p className='text-lg font-black text-slate-100'>{Math.round(oldestHours)}h</p>
          </div>
        </div>

        {/* Ticket list */}
        <div className='space-y-2'>
          {visibleTickets.map((ticket, index) => {
            const statusLower = (ticket.status || '').toLowerCase();
            const statusBadge = getStatusBadge(ticket.status);
            const ageBadge = getAgeBadge(ticket.overdueHours);
            const reportedDate = new Date(ticket.reportedAt);
            const now = new Date();
            const ageHours = (now.getTime() - reportedDate.getTime()) / (1000 * 60 * 60);
            const canAssign = onAssign && statusLower !== 'on_progress' && statusLower !== 'close';

            return (
              <div
                key={ticket.ticketId || ticket.idTicket || index}
                className='flex flex-wrap items-center gap-2 rounded-xl border border-cyan-500/10 bg-cyan-500/5 px-3 py-2.5 transition-colors hover:bg-cyan-500/10'
              >
                {/* Number */}
                <span className='flex h-5 w-5 items-center justify-center rounded-full bg-cyan-500/20 text-[10px] font-bold text-cyan-400'>
                  {index + 1}
                </span>

                {/* Ticket ID */}
                <span className='font-mono text-sm font-bold text-cyan-400'>
                  {ticket.ticketId}
                </span>

                {/* Customer type */}
                <span className='text-xs text-cyan-300'>⚡ {ticket.customerType}</span>

                {/* Workzone */}
                {ticket.workzone && (
                  <span className='hidden text-xs text-(--text-secondary) sm:inline'>
                    📍 {ticket.workzone}
                  </span>
                )}

                {/* Reported date */}
                <span className='text-[11px] text-(--text-secondary)'>
                  {formatDateTime(ticket.reportedAt)}
                </span>

                {/* Age badge */}
                <span
                  className={clsx(
                    'rounded-full px-2 py-0.5 text-[10px] font-bold',
                    ageBadge.className,
                  )}
                >
                  {ageBadge.label}
                </span>

                {/* Status badge */}
                <span
                  className={clsx(
                    'rounded-full px-2 py-0.5 text-[10px] font-bold',
                    statusBadge.className,
                  )}
                >
                  {statusBadge.label}
                </span>

                {/* Assign button */}
                {canAssign && (
                  <button
                    onClick={() => onAssign!(ticket.ticketId, ticket.idTicket)}
                    className='ml-auto flex items-center gap-1 rounded-lg border border-cyan-500/30 bg-cyan-500/15 px-2.5 py-1 text-[11px] font-semibold text-cyan-400 transition-colors hover:bg-cyan-500/25'
                  >
                    <UserPlus size={11} />
                    {statusLower === 'assigned' ? 'Reassign' : 'Assign'}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Expand toggle */}
        {tickets.length > MAX_VISIBLE && (
          <button
            onClick={() => setExpanded(!expanded)}
            className='flex w-full items-center justify-center gap-1 rounded-lg border border-cyan-500/10 bg-cyan-500/5 py-2 text-xs font-semibold text-cyan-400 transition-colors hover:bg-cyan-500/10'
          >
            {expanded ? (
              <>
                <ChevronUp size={14} />
                Sembunyikan
              </>
            ) : (
              <>
                <ChevronDown size={14} />
                Lihat semua {tickets.length} tiket
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
