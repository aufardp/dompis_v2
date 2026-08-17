'use client';

import clsx from 'clsx';
import {
  Camera,
  CheckCircle2,
  CircleDot,
  Clock3,
  FileText,
  MapPin,
  PauseCircle,
  PlayCircle,
  UserRoundPlus,
} from 'lucide-react';
import type { ComponentType } from 'react';
import { Ticket } from '@/app/types/ticket';
import { formatDateTimeWIB } from '@/app/utils/datetime';

interface Props {
  ticket: Ticket;
  status: string;
}

interface TimelineEvent {
  icon: ComponentType<{ size?: number; className?: string }>;
  label: string;
  timestamp: string | null;
  detail?: string | null;
  lines?: Array<string | null>;
  tone: 'gray' | 'blue' | 'purple' | 'green' | 'amber';
}

export default function TicketHistoryTimeline({ ticket, status }: Props) {
  const reportedAt = ticket.reportedDate ? new Date(ticket.reportedDate) : null;
  const closedAt = ticket.tracking?.closedAt || ticket.closedAt || null;
  const closedDate = closedAt ? new Date(closedAt) : null;
  const durationLabel =
    reportedAt && closedDate ? formatDuration(reportedAt, closedDate) : null;

  const tracking = ticket.tracking;
  const activityLog = ticket.activityLog ?? [];
  const assignmentHistory = (ticket.assignmentHistory ?? [])
    .slice()
    .sort(
      (a, b) =>
        new Date(a.assignedAt).getTime() - new Date(b.assignedAt).getTime(),
    );

  const reportBy = ticket.reportedBy || ticket.contactName || '—';
  const latestAssignment =
    assignmentHistory[assignmentHistory.length - 1] ?? null;
  const activeAssignment =
    assignmentHistory.find((item) => item.isActive) ?? null;

  const assignedBy =
    tracking?.assignedBy ||
    latestAssignment?.assignerName ||
    activeAssignment?.assignerName ||
    findActivityUser(activityLog, ['assign', 'reassign']) ||
    '—';
  const assignedTo =
    tracking?.assignedTo ||
    activeAssignment?.technicianName ||
    latestAssignment?.technicianName ||
    '—';

  const assignCount =
    assignmentHistory.length || (tracking?.assignedAt ? 1 : 0);
  const reassignCount = Math.max(assignCount - 1, 0);
  const hasReassign = reassignCount > 0;

  // ── Cari semua activity log untuk pending, resume, upload ────
  const pendingLogs = activityLog.filter((log) => {
    if ((log.type ?? '') !== 'STATUS_CHANGE') return false;
    return (log.description ?? '')
      .toLowerCase()
      .includes('on_progress -> pending');
  });
  const resumeLogs = activityLog.filter((log) => {
    if ((log.type ?? '') !== 'STATUS_CHANGE') return false;
    return (log.description ?? '')
      .toLowerCase()
      .includes('pending -> on_progress');
  });
  const uploadLogs = activityLog.filter(
    (log) => (log.type ?? '') === 'UPLOAD_EVIDENCE',
  );

  const pendingCount = Math.max(
    pendingLogs.length,
    tracking?.pendingAt ? 1 : 0,
    ticket.pendingDompis ? 1 : 0,
  );

  const pickupActivity = findActivityEntry(activityLog, ['pickup']);
  const closeActivity = findActivityEntry(activityLog, ['close', 'closed']);

  // ── Collect all chronologically sorted events ───────────────
  const events: TimelineEvent[] = [];

  // 1. Tiket dilaporkan
  events.push({
    icon: CircleDot,
    label: 'Tiket dilaporkan',
    timestamp: ticket.reportedDate,
    detail: ticket.summary || ticket.symptom || ticket.ticket,
    lines: [
      `Dibuka oleh: ${reportBy}`,
      ticket.serviceNo ? `Service: ${ticket.serviceNo}` : null,
      ticket.customerType ? `Pelanggan: ${ticket.customerType}` : null,
      ticket.workzone ? `Workzone: ${ticket.workzone}` : null,
    ],
    tone: 'gray',
  });

  // 2. Tiket di-assign
  if (tracking?.assignedAt || assignmentHistory.length > 0) {
    events.push({
      icon: UserRoundPlus,
      label: 'Tiket di-assign',
      timestamp: tracking?.assignedAt || latestAssignment?.assignedAt || null,
      detail: `${assignedBy} → ${assignedTo}`,
      lines: [
        assignCount > 0 ? `Total assign: ${assignCount}x` : null,
        latestAssignment?.isActive ? 'Status: aktif' : null,
      ],
      tone: 'blue',
    });
  }

  // 3. Tiket di-pickup
  if (tracking?.pickedUpAt || pickupActivity) {
    events.push({
      icon: PlayCircle,
      label: 'Tiket di-pickup',
      timestamp: tracking?.pickedUpAt || pickupActivity?.createdAt || null,
      detail:
        pickupActivity?.description ||
        'Tiket sudah diambil teknisi untuk dikerjakan',
      lines: [
        pickupActivity?.userName ? `Oleh: ${pickupActivity.userName}` : null,
      ],
      tone: 'amber',
    });
  }

  // 4. ALL pending events dari activity log
  pendingLogs.forEach((log) => {
    events.push({
      icon: PauseCircle,
      label: 'Tiket dipending',
      timestamp: log.createdAt,
      detail: log.description || 'Tiket sempat masuk status pending',
      lines: [log.userName ? `Oleh: ${log.userName}` : null],
      tone: 'purple',
    });
  });

  // 5. Fallback pending dari tracking (jika tidak ada activity log)
  if (tracking?.pendingAt && pendingLogs.length === 0) {
    events.push({
      icon: PauseCircle,
      label: 'Tiket dipending',
      timestamp: tracking.pendingAt,
      detail: ticket.pendingDompis || 'Tiket sempat masuk status pending',
      lines: [],
      tone: 'purple',
    });
  }

  // 6. ALL resume/pengerjaan events dari activity log
  resumeLogs.forEach((log) => {
    events.push({
      icon: Clock3,
      label: 'Pengerjaan dilanjutkan',
      timestamp: log.createdAt,
      detail: log.description || 'Teknisi melanjutkan pengerjaan',
      lines: [log.userName ? `Oleh: ${log.userName}` : null],
      tone: 'blue',
    });
  });

  // 7. Fallback onProgress dari tracking (jika tidak ada activity log)
  if (tracking?.onProgressAt && resumeLogs.length === 0) {
    events.push({
      icon: Clock3,
      label: 'Pengerjaan dimulai',
      timestamp: tracking.onProgressAt,
      detail: 'Tiket masuk proses pengerjaan',
      lines: [],
      tone: 'blue',
    });
  }

  // 8. ALL evidence upload events
  uploadLogs.forEach((log) => {
    events.push({
      icon: Camera,
      label: 'Evidence diupload',
      timestamp: log.createdAt,
      detail: log.description || 'Foto evidence telah diupload',
      lines: [log.userName ? `Oleh: ${log.userName}` : null],
      tone: 'amber',
    });
  });

  // 9. Tiket ditutup
  if (closedAt) {
    events.push({
      icon: CheckCircle2,
      label: 'Tiket ditutup',
      timestamp: closedAt,
      detail:
        ticket.descriptionSolutionDompis ||
        ticket.worklogSummary ||
        'Tiket sudah ditutup',
      lines: [
        ticket.rca ? `RCA: ${ticket.rca}` : null,
        ticket.subRca ? `Sub RCA: ${ticket.subRca}` : null,
        durationLabel ? `Durasi tiket: ${durationLabel}` : null,
        closeActivity?.userName
          ? `Ditutup oleh: ${closeActivity.userName}`
          : null,
        hasReassign ? `Pernah reassign: ${reassignCount}x` : null,
        (() => {
          const loc = ticket.serviceLocation;
          const lat = loc?.latitude ?? null;
          const lng = loc?.longitude ?? null;
          if (lat !== null && lng !== null) {
            return `Lokasi: ${lat.toFixed(6)}, ${lng.toFixed(6)}`;
          }
          return null;
        })(),
        ticket.serviceLocation?.barcodeDc
          ? `Barcode DC: ${ticket.serviceLocation.barcodeDc}`
          : null,
        ticket.serviceLocation?.deviceName
          ? `Device: ${ticket.serviceLocation.deviceName}`
          : null,
      ],
      tone: 'green',
    });
  }

  // ── Sort by timestamp ────────────────────────────────────────
  events.sort((a, b) => {
    if (!a.timestamp && !b.timestamp) return 0;
    if (!a.timestamp) return -1;
    if (!b.timestamp) return 1;
    return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
  });

  // ── Correct label untuk progress events ──────────────────────
  for (const ev of events) {
    if (ev.icon === Clock3) {
      const hasPriorPending = events.some(
        (e) =>
          e.icon === PauseCircle &&
          e.timestamp &&
          ev.timestamp &&
          new Date(e.timestamp).getTime() < new Date(ev.timestamp).getTime(),
      );
      ev.label = hasPriorPending
        ? 'Pengerjaan dilanjutkan'
        : 'Pengerjaan dimulai';
      ev.detail = hasPriorPending
        ? 'Teknisi melanjutkan pengerjaan setelah pending'
        : 'Tiket masuk proses pengerjaan';
      ev.lines = ev.lines?.filter(Boolean);
    }
  }

  // ── Filter out events without any data ───────────────────────
  const shownEvents = events.filter(
    (event) =>
      event.timestamp || event.detail || (event.lines?.length ?? 0) > 0,
  );

  const toneClasses: Record<TimelineEvent['tone'], string> = {
    gray: 'bg-(--surface-2) text-(--text-secondary)',
    blue: 'bg-blue-100 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400',
    amber:
      'bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400',
    purple:
      'bg-purple-100 text-purple-600 dark:bg-purple-500/15 dark:text-purple-400',
    green:
      'bg-green-100 text-green-600 dark:bg-green-500/15 dark:text-green-400',
  };

  const relevantLogs = activityLog.filter((log) => {
    const text = `${log.type ?? ''} ${log.description ?? ''}`.toLowerCase();
    return (
      text.includes('assign') ||
      text.includes('pickup') ||
      text.includes('progress') ||
      text.includes('pending') ||
      text.includes('resume') ||
      text.includes('close') ||
      text.includes('upload')
    );
  });

  return (
    <div className='space-y-4'>
      <div className='space-y-0'>
        {shownEvents.map((event, i) => {
          const Icon = event.icon;
          const isLast = i === shownEvents.length - 1;
          return (
            <div
              key={`${event.label}-${i}`}
              className='relative flex gap-3 pb-5'
            >
              {!isLast && (
                <div className='absolute top-8 left-3.75 h-full w-0.5 bg-(--border-secondary)' />
              )}
              <div
                className={clsx(
                  'z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                  toneClasses[event.tone],
                )}
              >
                <Icon size={15} />
              </div>
              <div className='flex-1 pt-0.5'>
                <p className='text-sm font-bold text-(--text-primary)'>
                  {event.label}
                </p>
                {event.timestamp && (
                  <p className='text-xs text-(--text-tertiary)'>
                    {formatDateTimeWIB(event.timestamp)}
                  </p>
                )}
                {event.detail && (
                  <p className='mt-1 rounded-lg bg-(--surface-2) px-2.5 py-1.5 text-xs text-(--text-secondary)'>
                    {event.detail}
                  </p>
                )}
                {event.lines?.length ? (
                  <div className='mt-1 space-y-1'>
                    {event.lines
                      .filter((line): line is string => Boolean(line))
                      .map((line) => (
                        <div
                          key={line}
                          className='inline-flex max-w-full items-center gap-1.5 rounded-full bg-(--surface-2) px-2.5 py-1 text-[11px] text-(--text-secondary)'
                        >
                          {line?.includes('Workzone') ||
                          line?.startsWith('Lokasi:') ? (
                            <MapPin
                              size={11}
                              className='shrink-0 text-(--text-tertiary)'
                            />
                          ) : (
                            <FileText
                              size={11}
                              className='shrink-0 text-(--text-tertiary)'
                            />
                          )}
                          <span className='truncate'>{line}</span>
                        </div>
                      ))}
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {relevantLogs.length > 0 && (
        <div className='space-y-2'>
          <p className='text-[10px] font-semibold tracking-widest text-(--text-tertiary) uppercase'>
            Log Aktivitas
          </p>
          <div className='divide-y divide-(--border) rounded-xl border border-(--border) bg-(--surface)'>
            {relevantLogs.slice(0, 5).map((log) => (
              <div
                key={log.id}
                className='flex items-start justify-between gap-3 px-3 py-2 text-xs'
              >
                <div className='min-w-0'>
                  <p className='font-bold text-(--text-primary)'>
                    {log.userName ?? 'Sistem'}
                  </p>
                  <p className='mt-0.5 text-(--text-secondary)'>
                    {log.description ?? log.type ?? 'Aktivitas tiket'}
                  </p>
                </div>
                <div className='shrink-0 text-right text-[10px] text-(--text-tertiary)'>
                  <p>{formatDateTimeWIB(log.createdAt)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function formatDuration(start: Date, end: Date) {
  const diff = Math.max(end.getTime() - start.getTime(), 0);
  const totalMinutes = Math.floor(diff / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;

  const parts = [
    days > 0 ? `${days} hari` : null,
    hours > 0 ? `${hours} jam` : null,
    minutes > 0 ? `${minutes} menit` : null,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(' ') : '0 menit';
}

function findActivityEntry(
  logs: NonNullable<Ticket['activityLog']>,
  keywords: string[],
) {
  return logs.find((log) => {
    const text = `${log.type ?? ''} ${log.description ?? ''}`.toLowerCase();
    return keywords.some((keyword) => text.includes(keyword));
  });
}

function findActivityUser(
  logs: NonNullable<Ticket['activityLog']>,
  keywords: string[],
) {
  return findActivityEntry(logs, keywords)?.userName ?? null;
}
