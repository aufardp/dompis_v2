/**
 * Ticket status utilities - canonical source for ticket status logic.
 * Use these functions instead of inline string comparisons.
 *
 * STATUS_UPDATE is the single source of truth for ticket workflow.
 * Valid values: 'open' | 'assigned' | 'on_progress' | 'pending' | 'close'
 */

export type StatusUpdateValue =
  | 'open'
  | 'assigned'
  | 'on_progress'
  | 'pending'
  | 'close';

export interface StatusBucketCounts {
  total: number;
  open: number;
  assigned: number;
  onProgress: number;
  pending: number;
  close: number;
}

const CLOSE_VALUE = 'close';

const STATUS_LABELS: Record<string, string> = {
  open: 'Open',
  assigned: 'Assigned',
  on_progress: 'On Progress',
  pending: 'Pending',
  close: 'Close',
};

const STATUS_COLORS: Record<string, string> = {
  open: 'bg-yellow-100 text-yellow-800',
  assigned: 'bg-blue-100 text-blue-800',
  on_progress: 'bg-purple-100 text-purple-800',
  pending: 'bg-orange-100 text-orange-800',
  close: 'bg-green-100 text-green-800',
};

/**
 * Returns true if ticket is closed — FINAL state.
 * Primary value is 'close' (from Google Sheets sync).
 * Fallback to 'closed' for legacy data compatibility.
 */
export function isTicketClosed(
  statusUpdate: string | null | undefined,
): boolean {
  if (!statusUpdate) return false;

  const status = statusUpdate.trim().toLowerCase();

  return status === 'close' || status === 'closed';
}

export function normalizeStatusUpdate(
  statusUpdate: string | null | undefined,
): StatusUpdateValue {
  const status = (statusUpdate ?? '').trim().toLowerCase();

  if (status === 'close' || status === 'closed') return 'close';
  if (status === 'assigned') return 'assigned';
  if (status === 'on_progress' || status === 'on progress') {
    return 'on_progress';
  }
  if (status === 'pending') return 'pending';
  return 'open';
}

export function isTicketOpenLike(
  statusUpdate: string | null | undefined,
): boolean {
  return normalizeStatusUpdate(statusUpdate) === 'open';
}

export function isTicketInWork(
  statusUpdate: string | null | undefined,
): boolean {
  const status = normalizeStatusUpdate(statusUpdate);
  return status === 'assigned' || status === 'on_progress' || status === 'pending';
}

export function countStatusBuckets<T>(
  rows: T[],
  getStatus: (row: T) => string | null | undefined,
): StatusBucketCounts {
  const counts: StatusBucketCounts = {
    total: rows.length,
    open: 0,
    assigned: 0,
    onProgress: 0,
    pending: 0,
    close: 0,
  };

  for (const row of rows) {
    const status = normalizeStatusUpdate(getStatus(row));
    if (status === 'open') counts.open++;
    else if (status === 'assigned') counts.assigned++;
    else if (status === 'on_progress') counts.onProgress++;
    else if (status === 'pending') counts.pending++;
    else if (status === 'close') counts.close++;
  }

  return counts;
}

/**
 * Returns true if ticket still allows actions.
 */
export function canActOnTicket(
  statusUpdate: string | null | undefined,
): boolean {
  return !isTicketClosed(statusUpdate);
}

/**
 * Returns true if Google Sheets sync is allowed to override STATUS_UPDATE.
 * Only OPEN or empty values can be overridden.
 */
export function isStatusOverridableBySheet(
  statusUpdate: string | null | undefined,
): boolean {
  const value = (statusUpdate ?? '').trim().toLowerCase();
  return value === '' || value === 'open';
}

/**
 * Human readable label
 */
export function getStatusLabel(
  statusUpdate: string | null | undefined,
): string {
  const key = (statusUpdate ?? '').trim().toLowerCase();
  return STATUS_LABELS[key] ?? statusUpdate ?? 'Open';
}

/**
 * Tailwind color classes
 */
export function getStatusColor(
  statusUpdate: string | null | undefined,
): string {
  const key = (statusUpdate ?? '').trim().toLowerCase();
  return STATUS_COLORS[key] ?? 'bg-gray-100 text-gray-800';
}
