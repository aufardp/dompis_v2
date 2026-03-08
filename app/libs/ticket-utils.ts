/**
 * Ticket status utilities - canonical source for ticket status logic.
 * Use these functions instead of inline string comparisons.
 *
 * STATUS_UPDATE is the single source of truth for ticket workflow.
 * Valid values: 'open' | 'assigned' | 'on_progress' | 'pending' | 'escalated' | 'close'
 */

export type StatusUpdateValue =
  | 'open'
  | 'assigned'
  | 'on_progress'
  | 'pending'
  | 'escalated'
  | 'close';

const CLOSE_VALUE = 'close';

const STATUS_LABELS: Record<string, string> = {
  open: 'Open',
  assigned: 'Assigned',
  on_progress: 'On Progress',
  pending: 'Pending',
  escalated: 'Escalated',
  close: 'Close',
};

const STATUS_COLORS: Record<string, string> = {
  open: 'bg-yellow-100 text-yellow-800',
  assigned: 'bg-blue-100 text-blue-800',
  on_progress: 'bg-purple-100 text-purple-800',
  pending: 'bg-orange-100 text-orange-800',
  escalated: 'bg-red-100 text-red-800',
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
