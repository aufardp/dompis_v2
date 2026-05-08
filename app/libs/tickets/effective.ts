import {
  formatDateTimeFullWIB,
  isDifferentWIBDay,
  parseWIBDateInput,
} from '@/app/utils/datetime';
import {
  normalizeCustomerType,
  getCustomerTypeConfig,
  getSlaHours,
} from '@/app/config/customer-types';
import {
  BOOKING_DEADLINE_HOURS,
  GUARANTEE_ESCALATION_HOURS,
} from '@/app/config/priority-rules';

export type FlaggingLabel = 'P1' | 'P+';

function normalizeStatus(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_');
}

function normalizeFlagging(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toUpperCase();
}

function normalizeGuarantee(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase();
}

function addHours(date: Date, hours: number): Date {
  const d = new Date(date);
  d.setHours(d.getHours() + hours);
  return d;
}

function pickDbMaxTtrValue(ticket: any): string | null {
  const config = getCustomerTypeConfig(ticket?.customerType ?? ticket?.ctype);
  if (config) return ticket?.[`maxTtr${config.shortLabel}`] ?? null;

  return (
    ticket?.maxTtrDiamond ||
    ticket?.maxTtrPlatinum ||
    ticket?.maxTtrGold ||
    ticket?.maxTtrReguler ||
    null
  );
}

export function getEffectiveFlaggingLabel(ticket: any): FlaggingLabel | null {
  const flag = normalizeFlagging(ticket?.flaggingManja);
  if (flag !== 'P1' && flag !== 'P+') return null;

  if (flag === 'P1') return 'P1';

  const status = normalizeStatus(ticket?.hasilVisit ?? ticket?.status);
  const isOpenOrPending = status === 'OPEN' || status === 'PENDING';
  const escalated =
    isOpenOrPending && isDifferentWIBDay(ticket?.reportedDate, new Date());

  return escalated ? 'P1' : 'P+';
}

export function getEffectiveMaxTtrDate(ticket: any): Date | null {
  const reported = parseWIBDateInput(ticket?.reportedDate);
  if (!reported) return null;

  const bookingDate = parseWIBDateInput(ticket?.bookingDate);
  if (bookingDate) {
    const deadline = addHours(bookingDate, BOOKING_DEADLINE_HOURS);
    return deadline.getTime() > bookingDate.getTime() ? deadline : null;
  }

  const guarantee = normalizeGuarantee(ticket?.guaranteeStatus);
  const rawFlag = normalizeFlagging(ticket?.flaggingManja);
  const hasPriorityFlag = rawFlag === 'P1' || rawFlag === 'P+';

  if (guarantee === 'guarantee' && hasPriorityFlag) {
    const d = addHours(reported, GUARANTEE_ESCALATION_HOURS);
    return d.getTime() > reported.getTime() ? d : null;
  }

  // Use DB maxTTR if present and valid (> reported)
  const dbValue = pickDbMaxTtrValue(ticket);
  if (dbValue && String(dbValue).trim()) {
    const db = parseWIBDateInput(dbValue);
    if (db && db.getTime() > reported.getTime()) return db;
  }

  // Fallback: reported + SLA hours based on customer type
  const slaHours = getSlaHours(ticket?.customerType ?? ticket?.ctype);
  const computed = addHours(reported, slaHours);
  return computed.getTime() > reported.getTime() ? computed : null;
}

export function getEffectiveMaxTtrISO(ticket: any): string | null {
  const d = getEffectiveMaxTtrDate(ticket);
  return d ? d.toISOString() : null;
}

export function getEffectiveMaxTtrLabel(ticket: any): string | null {
  const d = getEffectiveMaxTtrDate(ticket);
  return d ? formatDateTimeFullWIB(d) : null;
}

export function getEffectiveTtrMs(ticket: any): number | null {
  const d = getEffectiveMaxTtrDate(ticket);
  return d ? d.getTime() : null;
}

export function isBookingBased(ticket: any): boolean {
  return Boolean(parseWIBDateInput(ticket?.bookingDate));
}
