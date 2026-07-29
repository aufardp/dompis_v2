import { prisma } from '@/app/libs/prisma';
import { buildStatusCategorySql } from '@/app/libs/services/daily-ticket.service';
import { nowWib } from '@/lib/timezone';

const statusCat = buildStatusCategorySql();

function dateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

const AGG_SELECT = `
  DATE(reported_date) AS agg_date,
  COALESCE(workzone, '') AS workzone,
  COUNT(*) AS total,
  SUM(CASE WHEN ${statusCat} = 'open' THEN 1 ELSE 0 END) AS open,
  SUM(CASE WHEN ${statusCat} = 'assigned' THEN 1 ELSE 0 END) AS assigned,
  SUM(CASE WHEN ${statusCat} = 'on_progress' THEN 1 ELSE 0 END) AS on_progress,
  SUM(CASE WHEN ${statusCat} = 'pending' THEN 1 ELSE 0 END) AS pending,
  SUM(CASE WHEN ${statusCat} = 'close' THEN 1 ELSE 0 END) AS close,
  SUM(CASE WHEN LOWER(COALESCE(guarantee_status, '')) = 'guarantee' THEN 1 ELSE 0 END) AS ffg_count,
  SUM(CASE WHEN ticket_id_gamas IS NOT NULL AND LOWER(TRIM(ticket_id_gamas)) NOT IN ('', '-', '--', 'null', 'undefined', 'n/a', 'na') THEN 1 ELSE 0 END) AS gamas_count,
  SUM(CASE WHEN flagging_manja = 'P1' THEN 1 ELSE 0 END) AS p1_count,
  SUM(CASE WHEN flagging_manja = 'P+' THEN 1 ELSE 0 END) AS p_plus_count,
  SUM(CASE WHEN LOWER(TRIM(COALESCE(customer_type, ''))) IN ('hvc_diamond', 'hvc diamond', 'diamond') THEN 1 ELSE 0 END) AS hvc_diamond,
  SUM(CASE WHEN LOWER(TRIM(COALESCE(customer_type, ''))) IN ('hvc_platinum', 'hvc platinum', 'platinum') THEN 1 ELSE 0 END) AS hvc_platinum,
  SUM(CASE WHEN LOWER(TRIM(COALESCE(customer_type, ''))) IN ('hvc_gold', 'hvc gold', 'gold') THEN 1 ELSE 0 END) AS hvc_gold,
  SUM(CASE WHEN LOWER(TRIM(COALESCE(customer_type, ''))) IN ('reguler', 'regular') THEN 1 ELSE 0 END) AS reguler
`;

type SnapshotRow = {
  agg_date: string;
  workzone: string;
  total: number;
  open: number;
  assigned: number;
  on_progress: number;
  pending: number;
  close: number;
  ffg_count: number;
  gamas_count: number;
  p1_count: number;
  p_plus_count: number;
  hvc_diamond: number;
  hvc_platinum: number;
  hvc_gold: number;
  reguler: number;
};

type RowForInsert = {
  agg_date: string;
  workzone: string;
  total: number;
  open: number;
  assigned: number;
  on_progress: number;
  pending: number;
  close: number;
  ffg_count: number;
  gamas_count: number;
  p1_count: number;
  p_plus_count: number;
  hvc_diamond: number;
  hvc_platinum: number;
  hvc_gold: number;
  reguler: number;
};

const ROW_PLACEHOLDER = `(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(3))`;

function flattenRow(r: RowForInsert): unknown[] {
  return [
    r.agg_date, r.workzone,
    r.total, r.open, r.assigned, r.on_progress, r.pending, r.close,
    r.ffg_count, r.gamas_count, r.p1_count, r.p_plus_count,
    r.hvc_diamond, r.hvc_platinum, r.hvc_gold, r.reguler,
  ];
}

async function upsertRows(rows: RowForInsert[]): Promise<void> {
  if (rows.length === 0) return;

  const placeholders = rows.map(() => ROW_PLACEHOLDER).join(', ');
  const sql = `INSERT INTO dashboard_summary_snapshot
    (agg_date, workzone, total, open, assigned, on_progress, pending, close,
     ffg_count, gamas_count, p1_count, p_plus_count,
     hvc_diamond, hvc_platinum, hvc_gold, reguler, updated_at)
  VALUES ${placeholders}
  ON DUPLICATE KEY UPDATE
    total = VALUES(total),
    open = VALUES(open),
    assigned = VALUES(assigned),
    on_progress = VALUES(on_progress),
    pending = VALUES(pending),
    close = VALUES(close),
    ffg_count = VALUES(ffg_count),
    gamas_count = VALUES(gamas_count),
    p1_count = VALUES(p1_count),
    p_plus_count = VALUES(p_plus_count),
    hvc_diamond = VALUES(hvc_diamond),
    hvc_platinum = VALUES(hvc_platinum),
    hvc_gold = VALUES(hvc_gold),
    reguler = VALUES(reguler),
    updated_at = NOW(3)`;

  await prisma.$executeRawUnsafe(sql, ...rows.flatMap(flattenRow));
}

export async function recomputeTodaySnapshot(): Promise<number> {
  const now = nowWib();
  const today = dateStr(now);
  const yesterday = dateStr(new Date(now.getTime() - 86400000));

  const rows = await prisma.$queryRawUnsafe<RowForInsert[]>(
    `SELECT ${AGG_SELECT} FROM ticket WHERE reported_date IS NOT NULL AND reported_date >= ? GROUP BY agg_date, workzone`,
    yesterday,
  );

  const validRows = rows.filter((r): r is RowForInsert => r.agg_date !== null);
  await upsertRows(validRows);
  return rows.length;
}

function* weeklyChunks(from: string, to: string): Generator<{ start: string; end: string }> {
  let current = new Date(from + 'T00:00:00Z');
  const end = new Date(to + 'T00:00:00Z');
  const WEEK_MS = 7 * 86400000;

  while (current < end) {
    const next = new Date(current.getTime() + WEEK_MS);
    const chunkEnd = next < end ? next : end;
    yield {
      start: dateStr(current),
      end: dateStr(chunkEnd),
    };
    current = next;
  }
}

export async function recomputeSnapshotForDateRange(from: string, to: string): Promise<number> {
  await prisma.$executeRawUnsafe('SET SESSION max_execution_time = 120000').catch(() => {});
  let total = 0;

  for (const chunk of weeklyChunks(from, to)) {
    const rows = await prisma.$queryRawUnsafe<RowForInsert[]>(
      `SELECT ${AGG_SELECT} FROM ticket WHERE reported_date IS NOT NULL AND reported_date >= ? AND reported_date < ? GROUP BY agg_date, workzone`,
      chunk.start,
      chunk.end,
    );
    const validRows = rows.filter((r): r is RowForInsert => r.agg_date !== null);
    await upsertRows(validRows);
    total += rows.length;
    console.log(`  ${chunk.start}..${chunk.end}: ${rows.length} rows`);
  }

  return total;
}
