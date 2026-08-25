import { toZonedTime } from 'date-fns-tz';
import { parseWIBDateInput } from '@/app/utils/datetime';
import {
  normalizeCustomerType,
  SLA_HOURS_MAP,
} from '@/app/config/customer-types';
import { getJenisSlaHours } from '@/app/config/jenis-tiket';
import { BOOKING_DEADLINE_HOURS } from '@/app/config/priority-rules';
import { CLOSE_STATUS_VALUES } from '@/app/libs/ticket-utils';

const TIMEZONE = 'Asia/Jakarta';

export type TtrComplyStatus = 'comply' | 'not_comply';

export interface TtrComplyInput {
  status: string | null;
  closedAt: Date | null;
  reportedDate: string | null;
  customerSegment: string | null;
  customerType: string | null;
  jenisTiket1: string | null;
  jenisTiket2: string | null;
}

export interface TtrComplyResult {
  status: TtrComplyStatus | null;
  deadlineAt: Date | null;
}

const B2C_SEGMENTS = ['DCS', 'PL-TSEL'];

/**
 * DATIN dan turunannya (ASTINET/METRO_E/VPNIP/SIP_TRUNK) menyimpan tier
 * TTR-nya sebagai suffix " K2"/" K3" di jenis_tiket_2 (mis. "ASTINET K3").
 * Tidak ada suffix = tier K1 (tercepat), sama dengan nilai default DATIN
 * di app/config/jenis-tiket.ts.
 */
function getDatinTierHours(
  jenisTiket1: string | null,
  jenisTiket2: string | null,
): number | null {
  if ((jenisTiket1 ?? '').trim().toUpperCase() !== 'DATIN') return null;
  const j2 = (jenisTiket2 ?? '').trim().toUpperCase();
  if (/\bK3$/.test(j2)) return 7.2;
  if (/\bK2$/.test(j2)) return 3.6;
  return 1.5;
}

/**
 * Max TTR (jam) untuk tiket, atau null kalau kategorinya tidak punya
 * threshold yang jelas (dikecualikan dari perhitungan comply, bukan
 * didefaultkan ke suatu angka).
 */
export function getComplyMaxTtrHours(
  ticket: Pick<
    TtrComplyInput,
    'customerSegment' | 'customerType' | 'jenisTiket1' | 'jenisTiket2'
  >,
): number | null {
  const isB2C = B2C_SEGMENTS.includes(
    (ticket.customerSegment ?? '').trim().toUpperCase(),
  );

  if (isB2C) {
    const key = normalizeCustomerType(ticket.customerType);
    return key ? (SLA_HOURS_MAP.get(key) ?? null) : null;
  }

  const datinHours = getDatinTierHours(ticket.jenisTiket1, ticket.jenisTiket2);
  if (datinHours !== null) return datinHours;

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
  if (!isClosed || !ticket.closedAt) {
    return { status: null, deadlineAt: null };
  }

  const reported = parseWIBDateInput(ticket.reportedDate);
  if (!reported) return { status: null, deadlineAt: null };

  const hours = getComplyMaxTtrHours(ticket);
  if (hours === null) return { status: null, deadlineAt: null };

  const deadlineAt = new Date(reported.getTime() + hours * 60 * 60 * 1000);
  const status: TtrComplyStatus =
    ticket.closedAt.getTime() <= deadlineAt.getTime()
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
  closedAt: Date | null;
  reportedDate: string | null;
}): SqmWorkHourResult {
  const workHour = getWorkHourCategory(ticket.reportedDate);
  const isClosed = CLOSE_STATUS_VALUES.includes(
    (ticket.status ?? '').trim().toUpperCase(),
  );

  if (!isClosed || !ticket.closedAt || !workHour || workHour === 'non_work_hour') {
    return { workHour, status: null, deadlineAt: null };
  }

  const reported = parseWIBDateInput(ticket.reportedDate)!;
  const deadlineAt = new Date(
    reported.getTime() + SQM_WORK_HOUR_TTR_HOURS * 60 * 60 * 1000,
  );
  const status: TtrComplyStatus =
    ticket.closedAt.getTime() <= deadlineAt.getTime()
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
  closedAt: Date | null;
  bookingDate: string | null;
  flaggingManja: string | null;
}): TtrComplyResult {
  if (!isManjaP1Ticket(ticket.flaggingManja)) {
    return { status: null, deadlineAt: null };
  }

  const isClosed = CLOSE_STATUS_VALUES.includes(
    (ticket.status ?? '').trim().toUpperCase(),
  );
  if (!isClosed || !ticket.closedAt) return { status: null, deadlineAt: null };

  const booking = parseWIBDateInput(ticket.bookingDate);
  if (!booking) return { status: null, deadlineAt: null };

  const deadlineAt = new Date(
    booking.getTime() + BOOKING_DEADLINE_HOURS * 60 * 60 * 1000,
  );
  const status: TtrComplyStatus =
    ticket.closedAt.getTime() <= deadlineAt.getTime()
      ? 'comply'
      : 'not_comply';

  return { status, deadlineAt };
}
