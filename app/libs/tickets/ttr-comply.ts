import { toZonedTime } from 'date-fns-tz';
import { parseWIBDateInput } from '@/app/utils/datetime';
import {
  normalizeCustomerType,
  SLA_HOURS_MAP,
} from '@/app/config/customer-types';
import {
  getJenisSlaHours,
  isNetralJenis,
  normalizeJenis,
} from '@/app/config/jenis-tiket';
import { BOOKING_DEADLINE_HOURS } from '@/app/config/priority-rules';
import { CLOSE_STATUS_VALUES } from '@/app/libs/ticket-utils';

const TIMEZONE = 'Asia/Jakarta';

export type TtrComplyStatus = 'comply' | 'not_comply';

export interface TtrComplyInput {
  status: string | null;
  /** Acuan kepatuhan = resolve_date (dari Nossa). Null → status tak dinilai. */
  resolveAt: Date | null;
  reportedDate: string | null;
  customerSegment: string | null;
  customerType: string | null;
  jenisTiket1: string | null;
  jenisTiket2: string | null;
  ticketIdGamas?: string | null;
}

export interface TtrComplyResult {
  status: TtrComplyStatus | null;
  deadlineAt: Date | null;
}

const B2C_SEGMENTS = ['DCS', 'PL-TSEL'];

/**
 * K-tier family: DATIN dan turunannya (ASTINET/METRO_E/VPN IP/IP_TRANSIT)
 * menyimpan tier TTR sebagai suffix " K1"/" K2"/" K3" di jenis_tiket_2
 * (mis. "ASTINET K3"). Tidak ada suffix = K1 (1.5j). SIP TRUNK tidak ikut
 * K-tier (flat 10j via slaOverrideHours).
 */
const K_TIER_JENIS1_SET = new Set(['DATIN']);
const K_TIER_JENIS2_KEYS = new Set(['datin', 'astinet', 'vpn-ip', 'metro-e', 'ip-transit']);

function getKTierHours(
  jenisTiket1: string | null,
  jenisTiket2: string | null,
): number | null {
  const j1 = (jenisTiket1 ?? '').trim().toUpperCase();
  const j2Upper = (jenisTiket2 ?? '').trim().toUpperCase();
  // SIP TRUNK flat 10j, jangan K-tier
  if (j2Upper.includes('SIP TRUNK') || j2Upper.includes('SIP_TRUNK')) return null;

  const j1IsDatin = K_TIER_JENIS1_SET.has(j1);
  const j2Key = normalizeJenis(jenisTiket2);
  const j2IsFamily = j2Key ? K_TIER_JENIS2_KEYS.has(j2Key) : false;

  // K-tier berlaku jika jenis_tiket_1=DATIN (hasil classifier) ATAU
  // jenis_tiket_2 sendiri adalah family (cover data lama tanpa DATIN)
  if (!j1IsDatin && !j2IsFamily) return null;

  if (/\bK3$/.test(j2Upper)) return 7.2;
  if (/\bK2$/.test(j2Upper)) return 3.6;
  // K1 explicit atau tanpa suffix → K1
  return 1.5;
}

// Legacy alias untuk kompatibilitas
const getDatinTierHours = getKTierHours;

function getTopOloHours(
  jenisTiket2: string | null,
  ticketIdGamas: string | null | undefined,
): number | null {
  if (normalizeJenis(jenisTiket2) !== 'top-olo') return null;
  const hasGamas = String(ticketIdGamas ?? '').trim().length > 0;
  return hasGamas ? 7 : 4;
}

/**
 * Max TTR (jam) untuk tiket, atau null kalau kategorinya tidak punya
 * threshold yang jelas (dikecualikan dari perhitungan comply, bukan
 * didefaultkan ke suatu angka).
 */
export function getComplyMaxTtrHours(
  ticket: Pick<
    TtrComplyInput,
    'customerSegment' | 'customerType' | 'jenisTiket1' | 'jenisTiket2' | 'ticketIdGamas'
  >,
): number | null {
  // Netral exclude dari comply (tapi tetap punya display TTR via jenis-tiket.ts)
  if (isNetralJenis(ticket.jenisTiket2) || isNetralJenis(ticket.jenisTiket1)) {
    return null;
  }

  const isB2C = B2C_SEGMENTS.includes(
    (ticket.customerSegment ?? '').trim().toUpperCase(),
  );

  if (isB2C) {
    const key = normalizeCustomerType(ticket.customerType);
    return key ? (SLA_HOURS_MAP.get(key) ?? null) : null;
  }

  // B2B: TOP OLO conditional (ticket_id_gamas ada →7j)
  const topOloHours = getTopOloHours(ticket.jenisTiket2, ticket.ticketIdGamas);
  if (topOloHours !== null) return topOloHours;

  // K-tier family (DATIN/ASTINET/VPN IP/METRO-E/IP_TRANSIT)
  const kTierHours = getKTierHours(ticket.jenisTiket1, ticket.jenisTiket2);
  if (kTierHours !== null) return kTierHours;

  return (
    getJenisSlaHours(ticket.jenisTiket2) ??
    getJenisSlaHours(ticket.jenisTiket1) ??
    null
  );
}

/**
 * Comply kalau tiket sudah closed (status masuk CLOSE_STATUS_VALUES) dan
 * ditutup sebelum/pada deadline efektifnya; not_comply kalau melewati
 * deadline. Null (belum dievaluasi) kalau tiket belum closed, reported_date
 * tidak bisa di-parse, atau kategorinya tidak punya max-TTR yang jelas.
 */
export function computeTtrCompliance(
  ticket: TtrComplyInput,
): TtrComplyResult {
  const isClosed = CLOSE_STATUS_VALUES.includes(
    (ticket.status ?? '').trim().toUpperCase(),
  );
  if (!isClosed || !ticket.resolveAt) {
    return { status: null, deadlineAt: null };
  }

  const reported = parseWIBDateInput(ticket.reportedDate);
  if (!reported) return { status: null, deadlineAt: null };

  // SQM-CCAN workhour: 4j hanya jika reported di jam kerja 08-17 WIB
  if (normalizeJenis(ticket.jenisTiket2) === 'sqm-ccan') {
    const wh = getWorkHourCategory(ticket.reportedDate);
    if (wh === 'non_work_hour') return { status: null, deadlineAt: null };
    if (wh === null) return { status: null, deadlineAt: null };
  }

  const hours = getComplyMaxTtrHours(ticket);
  if (hours === null) return { status: null, deadlineAt: null };

  const deadlineAt = new Date(reported.getTime() + hours * 60 * 60 * 1000);
  const status: TtrComplyStatus =
    ticket.resolveAt.getTime() <= deadlineAt.getTime()
      ? 'comply'
      : 'not_comply';

  return { status, deadlineAt };
}

export function isGamasTicket(sourceTicket: string | null): boolean {
  return (sourceTicket ?? '').trim().toUpperCase() === 'GAMAS';
}

export type WorkHourCategory = 'work_hour' | 'non_work_hour';

/**
 * WorkHour = tiket dilaporkan jam 08:00-17:00 WIB, selain itu Non-WorkHour
 * (17:00-08:00). Null kalau reported_date tidak bisa di-parse.
 */
export function getWorkHourCategory(
  reportedDate: string | null,
): WorkHourCategory | null {
  const reported = parseWIBDateInput(reportedDate);
  if (!reported) return null;
  const wibHour = toZonedTime(reported, TIMEZONE).getHours();
  return wibHour >= 8 && wibHour < 17 ? 'work_hour' : 'non_work_hour';
}

export interface SqmWorkHourResult {
  workHour: WorkHourCategory | null;
  status: TtrComplyStatus | null;
  deadlineAt: Date | null;
}

const SQM_WORK_HOUR_TTR_HOURS = 4;

/**
 * Khusus tiket SQM: comply dievaluasi (TTR 4 jam, reported->closed) HANYA
 * untuk tiket yang dilaporkan saat WorkHour. Tiket Non-WorkHour dikecualikan
 * dari comply/not_comply (tetap dihitung closed di tempat lain, cuma tidak
 * dinilai SLA-nya).
 */
export function computeSqmWorkHourCompliance(ticket: {
  status: string | null;
  resolveAt: Date | null;
  reportedDate: string | null;
}): SqmWorkHourResult {
  const workHour = getWorkHourCategory(ticket.reportedDate);
  const isClosed = CLOSE_STATUS_VALUES.includes(
    (ticket.status ?? '').trim().toUpperCase(),
  );

  if (!isClosed || !ticket.resolveAt || !workHour || workHour === 'non_work_hour') {
    return { workHour, status: null, deadlineAt: null };
  }

  const reported = parseWIBDateInput(ticket.reportedDate)!;
  const deadlineAt = new Date(
    reported.getTime() + SQM_WORK_HOUR_TTR_HOURS * 60 * 60 * 1000,
  );
  const status: TtrComplyStatus =
    ticket.resolveAt.getTime() <= deadlineAt.getTime()
      ? 'comply'
      : 'not_comply';

  return { workHour, status, deadlineAt };
}

export function isManjaP1Ticket(flaggingManja: string | null): boolean {
  return (flaggingManja ?? '').trim().toUpperCase() === 'P1';
}

/**
 * Tier "3 Jam MANJA" — hanya tiket flagging_manja='P1' (P+ tidak dihitung,
 * karena otomatis naik jadi P1 keesokan harinya lewat lib/flagging-manja.ts).
 * Deadline = booking_date + BOOKING_DEADLINE_HOURS (3 jam), bukan
 * reported_date seperti tier lain.
 */
export function computeManjaCompliance(ticket: {
  status: string | null;
  resolveAt: Date | null;
  bookingDate: string | null;
  flaggingManja: string | null;
}): TtrComplyResult {
  if (!isManjaP1Ticket(ticket.flaggingManja)) {
    return { status: null, deadlineAt: null };
  }

  const isClosed = CLOSE_STATUS_VALUES.includes(
    (ticket.status ?? '').trim().toUpperCase(),
  );
  if (!isClosed || !ticket.resolveAt) return { status: null, deadlineAt: null };

  const booking = parseWIBDateInput(ticket.bookingDate);
  if (!booking) return { status: null, deadlineAt: null };

  const deadlineAt = new Date(
    booking.getTime() + BOOKING_DEADLINE_HOURS * 60 * 60 * 1000,
  );
  const status: TtrComplyStatus =
    ticket.resolveAt.getTime() <= deadlineAt.getTime()
      ? 'comply'
      : 'not_comply';

  return { status, deadlineAt };
}
