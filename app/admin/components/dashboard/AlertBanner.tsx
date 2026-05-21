'use client';

import { useState, useMemo } from 'react';
import { ChevronDown, ChevronUp, UserPlus, AlertTriangle } from 'lucide-react';
import { cn } from '@/app/libs/utils';

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
    return {
      label: `${Math.round(hours * 60)}m`,
      className:
        'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20',
    };
  }
  if (hours <= 3) {
    return {
      label: `${Math.round(hours)}h`,
      className:
        'bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/20',
    };
  }
  return {
    label: `${Math.round(hours)}h`,
    className:
      'bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/20 animate-pulse font-black',
  };
}

function getStatusBadge(status: string): { label: string; className: string } {
  const s = (status || '').toLowerCase();
  if (s === 'open')
    return {
      label: 'OPEN',
      className:
        'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20',
    };
  if (s === 'assigned')
    return {
      label: 'ASSIGNED',
      className:
        'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20',
    };
  if (s === 'on_progress')
    return {
      label: 'ON PROGRESS',
      className:
        'bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/20',
    };
  return {
    label: s.toUpperCase() || 'UNKNOWN',
    className:
      'bg-slate-500/10 text-slate-600 dark:text-slate-400 border border-slate-500/20',
  };
}

/* ==========================================
   1. EXPIRED TICKETS BANNER (RED REDESIGN)
   ========================================== */
export function AlertBanner({ tickets }: AlertBannerProps) {
  if (tickets.length === 0) return null;

  const firstTicket = tickets[0];
  const maxOverdue = Math.max(...tickets.map((t) => t.overdueHours));

  return (
    <div className='relative overflow-hidden rounded-2xl border border-red-200 bg-red-50/60 p-4 shadow-xs md:p-5 dark:border-red-500/20 dark:bg-red-950/20'>
      {/* Pulse effect border malam hari */}
      <div className='pointer-events-none absolute inset-0 animate-pulse rounded-2xl border border-red-500/10 dark:border-red-500/20' />

      <div className='relative z-10 flex flex-col gap-4'>
        {/* Top Header */}
        <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
          <div className='flex items-center gap-3'>
            <div className='flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-100 text-red-600 dark:bg-red-500/20 dark:text-red-400'>
              <AlertTriangle className='h-5 w-5' />
            </div>
            <div>
              <h3 className='text-base font-black text-red-900 dark:text-red-200'>
                {tickets.length} Expired Ticket Perlu Perhatian!
              </h3>
              <p className='mt-0.5 text-xs font-medium text-red-700/70 dark:text-red-400/60'>
                TTR terlampaui — butuh segera ditindak lanjuti hari ini
              </p>
            </div>
          </div>

          <div className='flex items-center self-start sm:self-center'>
            <span className='rounded-full bg-red-600 px-3 py-1 text-xs font-black tracking-wide text-white shadow-sm shadow-red-500/30 dark:bg-red-500 dark:text-slate-950'>
              ⚠️ {Math.round(maxOverdue)}H OVERDUE
            </span>
          </div>
        </div>

        {/* First Ticket Preview Box */}
        <div className='flex flex-wrap items-center gap-2.5 rounded-xl border border-red-200/60 bg-white/80 px-4 py-3 dark:border-red-500/10 dark:bg-red-950/40'>
          <span className='rounded bg-red-100/60 px-2 py-0.5 font-mono text-xs font-black tracking-wide text-red-700 dark:bg-red-500/10 dark:text-red-400'>
            {firstTicket.ticketId}
          </span>
          <span className='rounded bg-amber-500/10 px-2 py-0.5 text-xs font-bold text-amber-700 dark:text-amber-400'>
            ⚡ {firstTicket.customerType}
          </span>
          {firstTicket.workzone && (
            <span className='text-xs font-semibold text-slate-600 dark:text-slate-400'>
              📍 {firstTicket.workzone}
            </span>
          )}
          <span className='text-[11px] font-medium text-slate-500 dark:text-slate-400'>
            {formatDateTime(firstTicket.reportedAt)}
          </span>

          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-[10px] font-black',
              getStatusBadge(firstTicket.status).className,
            )}
          >
            {getStatusBadge(firstTicket.status).label}
          </span>

          <span className='ml-auto text-[11px] font-bold text-red-700/80 dark:text-red-400/80'>
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

/* ==========================================
   2. DIAMOND ALERTS BANNER (CYAN REDESIGN)
   ========================================== */
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
    <div className='relative overflow-hidden rounded-2xl border border-cyan-200 bg-cyan-50/50 p-4 shadow-xs md:p-5 dark:border-cyan-500/20 dark:bg-cyan-950/20'>
      {/* Subtle Breathing Border */}
      <div className='pointer-events-none absolute inset-0 rounded-2xl border border-cyan-500/10 dark:border-cyan-500/20' />

      <div className='relative z-10 flex flex-col gap-4'>
        {/* Main Header Row */}
        <div className='flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between'>
          <div className='flex items-center gap-3'>
            <div className='flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-100 text-lg text-cyan-700 dark:bg-cyan-500/20 dark:text-cyan-400'>
              💎
            </div>
            <div>
              <h3 className='text-base font-black text-cyan-950 dark:text-cyan-100'>
                {tickets.length} Diamond Ticket Perlu Perhatian!
              </h3>
              <p className='mt-0.5 text-xs font-medium text-cyan-800/70 dark:text-cyan-400/60'>
                Prioritas tertinggi — fokus utama pada open dan reassign segera
              </p>
            </div>
          </div>

          {/* Quick Pillar Pill Status */}
          <div className='flex flex-wrap items-center gap-1.5 self-start lg:self-center'>
            <span className='rounded-md bg-cyan-600 px-2.5 py-1 text-[10px] font-black tracking-wide text-white dark:bg-cyan-500 dark:text-slate-950'>
              DIAMOND VIP
            </span>
            <span className='rounded-md border border-red-200 bg-red-100 px-2 py-1 text-[10px] font-black text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400'>
              OPEN: {statusSummary.open}
            </span>
            <span className='rounded-md border border-blue-200 bg-blue-100 px-2 py-1 text-[10px] font-black text-blue-700 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-400'>
              ASSIGNED: {statusSummary.assigned}
            </span>
            <span className='rounded-md border border-orange-200 bg-orange-100 px-2 py-1 text-[10px] font-black text-orange-700 dark:border-orange-500/20 dark:bg-orange-500/10 dark:text-orange-400'>
              PROGRESS: {statusSummary.onProgress}
            </span>
          </div>
        </div>

        {/* Analytic Cards Row */}
        <div className='grid grid-cols-2 gap-2.5 md:grid-cols-4'>
          <div className='rounded-xl border border-cyan-100 bg-white p-3 shadow-2xs dark:border-cyan-500/10 dark:bg-cyan-950/40'>
            <p className='text-[10px] font-bold tracking-wider text-cyan-700/80 uppercase dark:text-cyan-400/70'>
              Total Antrean
            </p>
            <p className='mt-1 text-xl font-black text-cyan-950 dark:text-cyan-100'>
              {tickets.length}
            </p>
          </div>
          <div className='rounded-xl border border-red-100 bg-white p-3 shadow-2xs dark:border-red-500/10 dark:bg-red-950/40'>
            <p className='text-[10px] font-bold tracking-wider text-red-600 uppercase dark:text-red-400/80'>
              Butuh Assign
            </p>
            <p className='mt-1 text-xl font-black text-red-600 dark:text-red-400'>
              {statusSummary.open}
            </p>
          </div>
          <div className='rounded-xl border border-amber-100 bg-white p-3 shadow-2xs dark:border-amber-500/10 dark:bg-red-950/40'>
            <p className='text-[10px] font-bold tracking-wider text-amber-700 uppercase dark:text-amber-400/80'>
              Belum Progress
            </p>
            <p className='mt-1 text-xl font-black text-amber-600 dark:text-amber-300'>
              {statusSummary.assigned + statusSummary.pending}
            </p>
          </div>
          <div className='rounded-xl border border-slate-200 bg-white p-3 shadow-2xs dark:border-slate-800 dark:bg-slate-900/40'>
            <p className='text-[10px] font-bold tracking-wider text-slate-500 uppercase dark:text-slate-400'>
              Durasi Tertua
            </p>
            <p className='mt-1 text-xl font-black text-slate-800 dark:text-slate-200'>
              {Math.round(oldestHours)}h
            </p>
          </div>
        </div>

        {/* Dynamic Ticket Row Lists */}
        <div className='space-y-2'>
          {visibleTickets.map((ticket, index) => {
            const statusLower = (ticket.status || '').toLowerCase();
            const statusBadge = getStatusBadge(ticket.status);
            const ageBadge = getAgeBadge(ticket.overdueHours);
            const canAssign =
              onAssign &&
              statusLower !== 'on_progress' &&
              statusLower !== 'close';

            return (
              <div
                key={ticket.ticketId || ticket.idTicket || index}
                className='flex flex-wrap items-center gap-3 rounded-xl border border-slate-100 bg-white px-3 py-2.5 shadow-2xs transition-all hover:border-cyan-300 dark:border-cyan-500/10 dark:bg-cyan-950/30 dark:hover:bg-cyan-500/10'
              >
                {/* Index Count */}
                <span className='flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-cyan-100 text-[10px] font-black text-cyan-700 dark:bg-cyan-500/20 dark:text-cyan-400'>
                  {index + 1}
                </span>

                {/* Ticket ID */}
                <span className='rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs font-black text-slate-900 dark:bg-slate-800 dark:text-cyan-300'>
                  {ticket.ticketId}
                </span>

                {/* Customer Code */}
                <span className='text-xs font-bold text-cyan-700 dark:text-cyan-400'>
                  ⚡ {ticket.customerType}
                </span>

                {/* Location Workzone */}
                {ticket.workzone && (
                  <span className='text-xs font-semibold text-slate-600 sm:inline dark:text-slate-400'>
                    📍 {ticket.workzone}
                  </span>
                )}

                {/* Post Time */}
                <span className='text-[11px] font-medium text-slate-400 dark:text-slate-500'>
                  {formatDateTime(ticket.reportedAt)}
                </span>

                {/* Right Badge Status Operations */}
                <div className='ml-auto flex items-center gap-2'>
                  <span
                    className={cn(
                      'rounded-md px-2 py-0.5 text-[10px] font-black tracking-wide',
                      ageBadge.className,
                    )}
                  >
                    {ageBadge.label}
                  </span>

                  <span
                    className={cn(
                      'rounded-md px-2 py-0.5 text-[10px] font-black tracking-wide',
                      statusBadge.className,
                    )}
                  >
                    {statusBadge.label}
                  </span>

                  {/* Assign Action Trigger */}
                  {canAssign && (
                    <button
                      onClick={() =>
                        onAssign!(ticket.ticketId, ticket.idTicket)
                      }
                      className='flex items-center gap-1.5 rounded-lg border border-cyan-600 bg-cyan-600 px-3 py-1 text-[11px] font-bold text-white shadow-2xs transition-all hover:bg-cyan-700 dark:border-cyan-500/30 dark:bg-cyan-500/10 dark:text-cyan-400 dark:hover:bg-cyan-500/20'
                    >
                      <UserPlus size={11} className='stroke-3' />
                      {statusLower === 'assigned' ? 'Reassign' : 'Assign'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Collapse Control Footer */}
        {tickets.length > MAX_VISIBLE && (
          <button
            onClick={() => setExpanded(!expanded)}
            className='flex w-full items-center justify-center gap-1 rounded-xl border border-cyan-200 bg-white py-2 text-xs font-bold text-cyan-700 shadow-2xs transition-all hover:bg-cyan-50/50 dark:border-cyan-500/10 dark:bg-cyan-950/40 dark:text-cyan-400 dark:hover:bg-cyan-500/10'
          >
            {expanded ? (
              <>
                <ChevronUp size={13} className='stroke-[2.5]' />
                Sembunyikan Antrean
              </>
            ) : (
              <>
                <ChevronDown size={13} className='stroke-[2.5]' />
                Lihat Semua ({tickets.length} Tiket Diamond)
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
