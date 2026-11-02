import { parseWIBDateInput } from '@/app/utils/datetime';
import {
  BranchFullPrioritySummary,
  PriorityBranchCode,
  TtrBucket,
  TtrStateFilter,
} from './types';
import { resolveTtrBucket } from './ttr';

export type PriorityGroup = 'reguler' | 'sqm' | 'underspec';
export interface PrioritySourceRow {
  id_ticket: number;
  incident: string;
  service_no: string | null;
  customer_name: string | null;
  workzone: string | null;
  jenis_tiket_2: string | null;
  customer_type: string | null;
  flagging_manja: string | null;
  reported_date_dt: Date | string | null;
  booking_date: string | null;
  resolve_date: Date | string | null;
  status: string | null;
  status_update: string | null;
  tickets_30d?: number;
  reg_hvc_30d?: number;
  last_reg_hvc_incident?: string | null;
}

export interface PrioritySelection {
  kind: PriorityGroup | 'all';
  subKind?: 'open_hi' | 'close_hi' | 'disruption' | 'gaul';
  bucket?: TtrBucket;
  state?: TtrStateFilter;
  q?: string;
}

const CLOSED_STATUSES = new Set([
  'CLOSED',
  'CLOSE',
  'FINALCHECK',
  'MEDIACARE',
  'SALAMSIM',
  'RESOLVED',
]);
const normalized = (value: string | null) => (value ?? '').trim().toUpperCase();

export function priorityGroup(jenis: string | null): PriorityGroup | null {
  const value = normalized(jenis);
  if (['REG', 'REGULER', 'HVC'].includes(value)) return 'reguler';
  if (value === 'SQM') return 'sqm';
  if (['UNSPEC', 'UNDERSPEC'].includes(value)) return 'underspec';
  return null;
}

export function priorityOpen(row: PrioritySourceRow): boolean {
  return (
    !CLOSED_STATUSES.has(normalized(row.status)) &&
    !['CLOSE', 'CLOSED'].includes(normalized(row.status_update))
  );
}

function validServiceNo(value: string | null): boolean {
  const service = normalized(value);
  return Boolean(service) && !/^(NN|DEFAULT[-_]|DUMMY)/.test(service);
}

export function selectPriorityRows(
  rows: PrioritySourceRow[],
  selection: PrioritySelection,
  now: Date,
) {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  const start = new Date(`${today}T00:00:00+07:00`).getTime();
  return rows.flatMap((row) => {
    const group = priorityGroup(row.jenis_tiket_2);
    if (!group || (selection.kind !== 'all' && group !== selection.kind))
      return [];
    const reported = parseWIBDateInput(row.reported_date_dt);
    const incomingToday =
      reported !== null &&
      reported.getTime() >= start &&
      reported.getTime() <= now.getTime();
    const open = priorityOpen(row);
    if (selection.subKind === 'open_hi' || selection.subKind === 'close_hi') {
      if (!incomingToday || (selection.subKind === 'close_hi' && open))
        return [];
    } else if (!open) return [];

    if (selection.subKind === 'disruption') {
      if (
        !validServiceNo(row.service_no) ||
        Number(row.tickets_30d) < 2 ||
        Number(row.reg_hvc_30d) !== 0
      )
        return [];
    }
    if (
      selection.subKind === 'gaul' &&
      (!validServiceNo(row.service_no) || !row.last_reg_hvc_incident)
    )
      return [];

    // Hitung TTR untuk reguler (tanpa subKind) DAN untuk HI (open_hi/close_hi)
    const isHI =
      selection.subKind === 'open_hi' || selection.subKind === 'close_hi';
    const ttr =
      group === 'reguler' && (!selection.subKind || isHI)
        ? resolveTtrBucket(row, now)
        : null;
    if (selection.bucket && ttr?.bucket !== selection.bucket) return [];
    if (selection.state === 'over' && ttr?.ttr_state !== 'over') return [];
    if (
      selection.state === 'within' &&
      (!ttr?.deadline_at || ttr.ttr_state === 'over')
    )
      return [];
    if (selection.state === 'near' && ttr?.ttr_state !== 'near') return [];
    const search = selection.q?.trim().toLowerCase();
    if (
      search &&
      ![row.incident, row.service_no, row.customer_name].some((value) =>
        value?.toLowerCase().includes(search),
      )
    )
      return [];

    return [
      {
        ...row,
        kind:
          group === 'reguler'
            ? selection.subKind
              ? 'hi'
              : 'ttr'
            : (selection.subKind ?? group),
        evidence: ttr
          ? {
              ...ttr,
              max_ttr_deadline: ttr.deadline_at,
              manja_deadline_info:
                ttr.bucket === 'manja' ? row.booking_date : null,
              ttr_state_label: !ttr.deadline_at
                ? 'Tanggal tidak tersedia'
                : {
                    safe: 'Aman',
                    near: 'Kritis',
                    over: 'Terlewat',
                  }[ttr.ttr_state],
            }
          : group === 'reguler'
            ? { kind: selection.subKind }
            : {
                tickets_30d: Number(row.tickets_30d ?? 0),
                has_reg_hvc_30d: Number(row.reg_hvc_30d ?? 0) > 0,
                last_reg_hvc_incident: row.last_reg_hvc_incident,
                gaul_relation: 'current',
                related_to_incident: row.last_reg_hvc_incident,
              },
      },
    ];
  });
}

export function summarizePriorityBranch(
  code: PriorityBranchCode,
  name: string,
  rows: PrioritySourceRow[],
  now: Date,
): BranchFullPrioritySummary {
  const count = (selection: PrioritySelection) =>
    selectPriorityRows(rows, selection, now).length;
  const reguler = count({ kind: 'reguler' });
  const sqm = count({ kind: 'sqm' });
  const underspec = count({ kind: 'underspec' });
  const bucketCounts = (bucket: TtrBucket) => ({
    all: count({ kind: 'reguler', bucket }),
    within: count({ kind: 'reguler', bucket, state: 'within' }),
    over: count({ kind: 'reguler', bucket, state: 'over' }),
  });
  return {
    code,
    name,
    card: {
      reguler_open: reguler,
      sqm_open: sqm,
      underspec_open: underspec,
      total_open: reguler + sqm + underspec,
    },
    reguler_summary: {
      saldo_open: reguler,
      osla: count({ kind: 'reguler', state: 'over' }),
      open_hi: count({ kind: 'reguler', subKind: 'open_hi' }),
      close_hi: count({ kind: 'reguler', subKind: 'close_hi' }),
    },
    reguler_ttr: {
      diamond_vvip: bucketCounts('diamond_vvip'),
      platinum: bucketCounts('platinum'),
      manja: bucketCounts('manja'),
      reguler: bucketCounts('reguler'),
    },
    sqm_underspec: {
      sqm_disruption: count({ kind: 'sqm', subKind: 'disruption' }),
      sqm_gaul: count({ kind: 'sqm', subKind: 'gaul' }),
      underspec_disruption: count({ kind: 'underspec', subKind: 'disruption' }),
      underspec_gaul: count({ kind: 'underspec', subKind: 'gaul' }),
    },
  };
}
