import {
  formatDateTimeFullWIB,
  getSlaHours,
  isDifferentWIBDay,
  parseWIBDateInput,
} from '@/app/utils/datetime';

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

function pickCustomerTypeRaw(ticket: any): string {
  const raw = String(ticket?.customerType ?? ticket?.ctype ?? '').trim();
  if (!raw) return '';
  const upper = raw.toUpperCase().replace(/\s+/g, '_');
  if (upper.includes('DIAMOND')) return 'HVC_DIAMOND';
  if (upper.includes('PLATINUM')) return 'HVC_PLATINUM';
  if (upper.includes('GOLD')) return 'HVC_GOLD';
  if (upper.includes('REGULER') || upper.includes('REGULAR')) return 'REGULER';
  return upper;
}

function pickDbMaxTtrValue(ticket: any): string | null {
  const ct = pickCustomerTypeRaw(ticket).toLowerCase();
  if (!ct) {
    return (
      ticket?.maxTtrDiamond ||
      ticket?.maxTtrPlatinum ||
      ticket?.maxTtrGold ||
      ticket?.maxTtrReguler ||
      null
    );
  }

  if (ct.includes('diamond')) return ticket?.maxTtrDiamond ?? null;
  if (ct.includes('platinum')) return ticket?.maxTtrPlatinum ?? null;
  if (ct.includes('gold')) return ticket?.maxTtrGold ?? null;
  if (ct.includes('reguler') || ct.includes('regular')) {
    return ticket?.maxTtrReguler ?? null;
  }

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

  const guarantee = normalizeGuarantee(ticket?.guaranteeStatus);
  const rawFlag = normalizeFlagging(ticket?.flaggingManja);
  const hasPriorityFlag = rawFlag === 'P1' || rawFlag === 'P+';

  // Guarantee + (P1/P+) -> always 3 hours from reported
  if (guarantee === 'guarantee' && hasPriorityFlag) {
    const d = addHours(reported, 3);
    return d.getTime() > reported.getTime() ? d : null;
  }

  // Use DB maxTTR if present and valid (> reported)
  const dbValue = pickDbMaxTtrValue(ticket);
  if (dbValue && String(dbValue).trim()) {
    const db = parseWIBDateInput(dbValue);
    if (db && db.getTime() > reported.getTime()) return db;
  }

  // Fallback: reported + SLA hours based on customer type
  const slaHours = getSlaHours(pickCustomerTypeRaw(ticket));
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
