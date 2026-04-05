'use client';

import { Technician, TechnicianTicket } from '@/app/types/technician';
import { X } from 'lucide-react';

interface AllTicketsModalProps {
  isOpen: boolean;
  onClose: () => void;
  technician: Technician | null;
  onDetail: (ticketId: number) => void;
  onReassign: (ticket: {
    ticketId: number;
    ticketCode: string;
    workzone: string;
    currentTechnicianId: number;
    currentTechnicianName: string;
  }) => void;
}

function getAgeColor(hours: number): string {
  if (hours >= 24) return 'text-red-600 dark:text-red-400';
  if (hours >= 8) return 'text-amber-600 dark:text-amber-400';
  return 'text-green-600 dark:text-green-400';
}

function getAgeBgColor(hours: number): string {
  if (hours >= 24) return 'bg-red-100 dark:bg-red-500/15';
  if (hours >= 8) return 'bg-amber-100 dark:bg-amber-500/15';
  return 'bg-green-100 dark:bg-green-500/15';
}

function getAgeBorderColor(hours: number): string {
  if (hours >= 24) return 'border-l-red-500';
  if (hours >= 8) return 'border-l-amber-500';
  return 'border-l-green-500';
}

function getStatusLabel(ticket: TechnicianTicket): string {
  const status = ticket.statusUpdate?.toLowerCase();
  if (status === 'assigned') return 'Menunggu';
  if (status === 'on_progress') return 'Dikerjakan';
  if (status === 'pending') return 'Pending';
  return status || '-';
}

function getStatusBadge(ticket: TechnicianTicket): string {
  const status = ticket.statusUpdate?.toLowerCase();
  if (status === 'assigned')
    return 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300';
  if (status === 'on_progress')
    return 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300';
  if (status === 'pending')
    return 'bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300';
  return 'bg-slate-100 text-slate-700 dark:bg-slate-500/20 dark:text-slate-300';
}

export default function AllTicketsModal({
  isOpen,
  onClose,
  technician,
  onDetail,
  onReassign,
}: AllTicketsModalProps) {
  if (!isOpen || !technician) return null;

  const status =
    technician.total_assigned === 0
      ? 'IDLE'
      : technician.total_assigned > 5
        ? 'OVERLOAD'
        : 'AKTIF';

  const statusColor =
    status === 'OVERLOAD' ? 'text-red-600' : status === 'AKTIF' ? 'text-blue-600' : 'text-slate-600';

  return (
    <div
      className='fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm'
      onClick={onClose}
      role='dialog'
      aria-modal='true'
      aria-label='All technician tickets modal'
    >
      <div
        className='animate-in fade-in zoom-in-95 flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl duration-200 dark:bg-slate-800'
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className='border-b border-slate-200 bg-slate-50 px-6 py-5 dark:border-slate-700 dark:bg-slate-700/50'>
          <div className='flex items-start justify-between gap-3'>
            <div className='min-w-0'>
              <h2 className='text-lg font-semibold text-slate-800 dark:text-slate-100'>
                Semua Tiket — {technician.nama}
              </h2>
              <p className='mt-1 text-sm text-slate-500 dark:text-slate-400'>
                <span className={statusColor}>{status}</span> ·{' '}
                {technician.total_assigned} tiket aktif ·{' '}
                <span className='inline-flex items-center rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-700 dark:bg-violet-500/20 dark:text-violet-400'>
                  {technician.workzone}
                </span>
              </p>
            </div>

            <button
              type='button'
              onClick={onClose}
              className='inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-400 dark:hover:bg-slate-600'
              aria-label='Close'
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Ticket List */}
        <div className='flex-1 space-y-2 overflow-y-auto px-6 py-4'>
          {technician.assigned_tickets.map((ticket, idx) => (
            <div
              key={ticket.idTicket}
              className={`flex items-center justify-between rounded-lg border-l-4 bg-slate-50 p-3 dark:bg-slate-700/50 ${getAgeBorderColor(ticket.ageHours)}`}
            >
              <div className='min-w-0 flex-1'>
                <div className='flex items-center gap-2'>
                  <span className='font-mono text-xs font-medium text-slate-500 dark:text-slate-400'>
                    #{idx + 1}
                  </span>
                  <span
                    className={`rounded px-1.5 py-0.5 text-xs font-medium ${getAgeBgColor(ticket.ageHours)} ${getAgeColor(ticket.ageHours)}`}
                  >
                    {ticket.ageHours >= 24
                      ? '🔴'
                      : ticket.ageHours >= 8
                        ? '🟡'
                        : '🟢'}
                  </span>
                  <span className='inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium'>
                    {getStatusLabel(ticket)}
                  </span>
                </div>
                <p className='mt-1 truncate text-sm font-medium text-slate-700 dark:text-slate-200'>
                  {ticket.ticket}
                </p>
                <p className='truncate text-xs text-slate-500 dark:text-slate-400'>
                  {ticket.contactName || 'N/A'}
                </p>
              </div>
              <div className='ml-3 flex shrink-0 items-center gap-2'>
                <span
                  className={`rounded px-2 py-1 text-xs font-medium ${getAgeBgColor(ticket.ageHours)} ${getAgeColor(ticket.ageHours)}`}
                >
                  {ticket.age}
                </span>
                <button
                  type='button'
                  onClick={() => onDetail(ticket.idTicket)}
                  className='rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600'
                >
                  Detail
                </button>
                <button
                  type='button'
                  onClick={() =>
                    onReassign({
                      ticketId: ticket.idTicket,
                      ticketCode: ticket.ticket,
                      workzone: ticket.workzone ?? technician.workzone,
                      currentTechnicianId: technician.id_user,
                      currentTechnicianName: technician.nama,
                    })
                  }
                  className='rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-[10px] font-semibold text-blue-700 hover:bg-blue-100 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-400 dark:hover:bg-blue-500/20'
                >
                  Reassign
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className='border-t border-slate-200 bg-white px-6 py-4 dark:border-slate-700 dark:bg-slate-800'>
          <button
            onClick={onClose}
            className='w-full rounded-xl border border-slate-200 bg-white py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600'
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}
