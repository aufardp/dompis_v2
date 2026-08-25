import { parseWIBDateInput } from '@/app/utils/datetime';
import {
  normalizeCustomerType,
  SLA_HOURS_MAP,
} from '@/app/config/customer-types';
import { getJenisSlaHours } from '@/app/config/jenis-tiket';
import { CLOSE_STATUS_VALUES } from '@/app/libs/ticket-utils';

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
