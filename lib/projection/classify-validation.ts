import { CLOSE_STATUS_VALUES } from '@/app/libs/ticket-utils';

const VALIDATION_TRIGGER = /tech\s*closed/i;
const VALIDATION_NEGATE = /\breopen\b/i;

export interface ValidationClassificationInput {
  status: string | null;
  statusUpdate: string | null;
  worklogSummary: string | null;
}

export interface ValidationClassificationResult {
  needsValidation: boolean;
  reason: 'Worklog menunjukkan sudah selesai' | 'Status update: close' | null;
}

export function classifyNeedsValidation(
  input: ValidationClassificationInput,
): ValidationClassificationResult {
  const { status, statusUpdate, worklogSummary } = input;
  const statusUpper = (status ?? '').trim().toUpperCase();

  // Status sudah termasuk CLOSE_STATUS_VALUES → tidak perlu validasi
  if (CLOSE_STATUS_VALUES.includes(statusUpper)) {
    return { needsValidation: false, reason: null };
  }

  // status_update = 'close' → trigger validasi
  const su = (statusUpdate ?? '').trim().toLowerCase();
  if (su === 'close') {
    return { needsValidation: true, reason: 'Status update: close' };
  }

  // worklog match regex (case-insensitive) dengan negation check
  const wl = (worklogSummary ?? '').trim();
  if (wl) {
    const match = wl.match(VALIDATION_TRIGGER);
    if (match && match.index !== undefined) {
      const afterMatch = wl.slice(match.index + match[0].length);
      if (!VALIDATION_NEGATE.test(afterMatch)) {
        return { needsValidation: true, reason: 'Worklog menunjukkan sudah selesai' };
      }
    }
  }

  return { needsValidation: false, reason: null };
}
