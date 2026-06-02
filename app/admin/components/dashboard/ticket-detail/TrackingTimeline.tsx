'use client';

import { format, formatDistanceToNowStrict } from 'date-fns';
import { id } from 'date-fns/locale';
import { ClipboardList } from 'lucide-react';
import clsx from 'clsx';
import type { TicketDetail } from './types';

interface TimelineEvent {
  time: string;
  label: string;
  detail: string;
  icon: string;
  color: string;
  sortOrder: number;
}

export default function TrackingTimeline({ ticket }: { ticket: TicketDetail }) {
  const tracking = ticket.tracking;
  const activityLog = ticket.activityLog ?? [];
  const assignmentHistory = ticket.assignmentHistory ?? [];

  const timelineEvents: TimelineEvent[] = [];

  if (tracking?.assignedAt) {
    const assignerName = tracking.assignedBy
      || assignmentHistory.find(h => h.isActive)?.assignerName
      || activityLog.find(a => a.type?.toLowerCase().includes('assign'))?.userName;
    timelineEvents.push({
      time: tracking.assignedAt,
      label: 'Tiket Di-assign',
      detail: `Oleh: ${assignerName ?? '—'} → ${tracking.assignedTo ?? '—'}`,
      icon: '📋',
      color: 'blue',
      sortOrder: 1,
    });
  }

  if (tracking?.pickedUpAt) {
    timelineEvents.push({
      time: tracking.pickedUpAt,
      label: 'Tiket Diambil (Pickup)',
      detail: tracking.assignedTo ?? '—',
      icon: '🤚',
      color: 'indigo',
      sortOrder: 2,
    });
  }

  if (tracking?.onProgressAt) {
    timelineEvents.push({
      time: tracking.onProgressAt,
      label: 'Mulai Dikerjakan',
      detail: tracking.assignedTo ?? '—',
      icon: '🔧',
      color: 'amber',
      sortOrder: 3,
    });
  }

  if (tracking?.pendingAt) {
    timelineEvents.push({
      time: tracking.pendingAt,
      label: 'Pending',
      detail: tracking.pendingDompis ?? '—',
      icon: '⏸️',
      color: 'orange',
      sortOrder: 4,
    });
  }

  if (tracking?.closedAt) {
    timelineEvents.push({
      time: tracking.closedAt,
      label: 'Tiket Ditutup',
      detail: tracking.assignedTo ?? '—',
      icon: '✅',
      color: 'emerald',
      sortOrder: 5,
    });
  }

  timelineEvents.sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <div className='space-y-6 p-4'>
      {/* Milestone Timeline */}
      <div>
        <div className='mb-3 flex items-center gap-2'>
          <ClipboardList size={14} className='text-slate-400' />
          <p className='text-[10px] font-bold tracking-wider text-slate-400 uppercase'>
            Milestone
          </p>
        </div>
        {timelineEvents.length === 0 ? (
          <p className='text-sm text-slate-400'>Belum ada data tracking</p>
        ) : (
          <div className='relative ml-3 space-y-0'>
            <div className='absolute top-2 bottom-2 left-0 w-px bg-slate-200 dark:bg-slate-700' />
            {timelineEvents.map((event) => (
              <div key={event.time + event.label} className='relative flex gap-4 pb-5'>
                <div
                  className={clsx(
                    'relative z-10 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] text-white shadow-sm',
                    event.color === 'emerald'
                      ? 'bg-emerald-500'
                      : event.color === 'blue'
                        ? 'bg-blue-500'
                        : event.color === 'amber'
                          ? 'bg-amber-500'
                          : event.color === 'orange'
                            ? 'bg-orange-500'
                            : 'bg-indigo-500',
                  )}
                >
                  <span>{event.icon}</span>
                </div>
                <div className='min-w-0 flex-1 pt-0.5'>
                  <p className='text-xs font-semibold text-slate-700 dark:text-slate-200'>
                    {event.label}
                  </p>
                  <p className='text-[11px] text-slate-500 dark:text-slate-400'>
                    {event.detail}
                  </p>
                  <p className='mt-0.5 text-[10px] text-slate-400 dark:text-slate-500'>
                    {format(new Date(event.time), 'dd MMM yyyy, HH:mm', {
                      locale: id,
                    })}
                    {' · '}
                    <span className='text-slate-400'>
                      {formatDistanceToNowStrict(new Date(event.time), {
                        addSuffix: true,
                        locale: id,
                      })}
                    </span>
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Riwayat Assign */}
      {assignmentHistory.length > 0 && (
        <div>
          <p className='mb-3 text-[10px] font-bold tracking-wider text-slate-400 uppercase'>
            Riwayat Assign
          </p>
          <div className='space-y-2'>
            {assignmentHistory.map((h) => (
              <div
                key={h.id}
                className={clsx(
                  'rounded-lg border p-3 text-xs',
                  h.isActive
                    ? 'border-blue-200 bg-blue-50 dark:border-blue-500/30 dark:bg-blue-500/10'
                    : 'border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/50',
                )}
              >
                <div className='flex items-start justify-between'>
                  <div>
                    <span className='font-medium text-slate-700 dark:text-slate-200'>
                      {h.technicianName ?? '—'}
                    </span>
                    {h.isActive && (
                      <span className='ml-2 rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] text-blue-700 dark:bg-blue-500/20 dark:text-blue-400'>
                        Aktif
                      </span>
                    )}
                    <p className='mt-0.5 text-slate-500'>
                      Di-assign oleh: {h.assignerName ?? 'Sistem'}
                    </p>
                  </div>
                  <div className='text-right text-[10px] text-slate-400'>
                    <p>
                      {format(new Date(h.assignedAt), 'dd MMM yyyy, HH:mm', {
                        locale: id,
                      })}
                    </p>
                    {h.unassignedAt && (
                      <p className='mt-0.5 text-slate-400'>
                        s/d{' '}
                        {format(new Date(h.unassignedAt), 'dd MMM, HH:mm', {
                          locale: id,
                        })}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Activity Log */}
      {activityLog.length > 0 && (
        <div>
          <p className='mb-3 text-[10px] font-bold tracking-wider text-slate-400 uppercase'>
            Log Aktivitas
          </p>
          <div className='space-y-2'>
            {activityLog.map((log) => (
              <div key={log.id} className='flex items-start gap-3 text-xs'>
                <span className='mt-0.5 shrink-0 text-[10px] text-slate-400'>
                  {format(new Date(log.createdAt), 'HH:mm', { locale: id })}
                </span>
                <div className='min-w-0 flex-1'>
                  <span className='font-medium text-slate-700 dark:text-slate-200'>
                    {log.userName ?? 'Sistem'}
                  </span>
                  <span className='mx-1 text-slate-400'>·</span>
                  <span className='text-slate-500 dark:text-slate-400'>
                    {log.description ?? log.type}
                  </span>
                  <p className='mt-0.5 text-[10px] text-slate-400'>
                    {format(new Date(log.createdAt), 'dd MMM yyyy', {
                      locale: id,
                    })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
