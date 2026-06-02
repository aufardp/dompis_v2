import { format, formatDistanceToNowStrict } from 'date-fns';
import { id } from 'date-fns/locale';
import type { TicketDetail } from './types';

export function normalizeKey(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
}

export function formatShortDistance(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '—';
    return formatDistanceToNowStrict(d, {
      addSuffix: true,
      locale: id,
    });
  } catch {
    return '—';
  }
}

export function formatDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return format(d, 'dd MMM yyyy HH:mm', { locale: id });
  } catch {
    return dateStr;
  }
}

export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return format(d, 'dd MMM yyyy', { locale: id });
  } catch {
    return dateStr;
  }
}

export function pickTtrDeadline(ticket: TicketDetail | null): string | null {
  if (!ticket) return null;
  return (
    ticket.maxTtrReguler ??
    ticket.maxTtrGold ??
    ticket.maxTtrPlatinum ??
    ticket.maxTtrDiamond ??
    null
  );
}

export function formatTtrDelta(deadline: string | null | undefined): string {
  if (!deadline) return '—';
  try {
    const d = new Date(deadline);
    if (isNaN(d.getTime())) return deadline;
    const now = new Date();
    const diffMs = d.getTime() - now.getTime();
    const absMs = Math.abs(diffMs);
    const hours = Math.floor(absMs / (1000 * 60 * 60));
    const mins = Math.floor((absMs - hours * 3600_000) / 60_000);
    const hh = `${hours}h${mins ? ` ${mins}m` : ''}`;
    return diffMs < 0 ? `Overdue ${hh}` : `${hh} remaining`;
  } catch {
    return deadline;
  }
}

export function getTTRUrgency(
  value: string | null | undefined,
): 'overdue' | 'warning' | 'safe' {
  if (!value) return 'safe';
  try {
    const ttrDate = new Date(value);
    if (isNaN(ttrDate.getTime())) return 'safe';
    const now = new Date();
    const hoursRemaining =
      (ttrDate.getTime() - now.getTime()) / (1000 * 60 * 60);
    if (hoursRemaining < 0) return 'overdue';
    if (hoursRemaining < 3) return 'warning';
    return 'safe';
  } catch {
    return 'safe';
  }
}

export function getTicketStatusRaw(ticket: TicketDetail | null): string {
  if (!ticket) return '';
  return String(
    ticket.status_update ??
      ticket.statusUpdate ??
      ticket.hasilVisit ??
      ticket.status ??
      '',
  )
    .toLowerCase()
    .trim();
}
