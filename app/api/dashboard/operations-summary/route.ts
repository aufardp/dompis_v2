import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import prisma from '@/app/libs/prisma';
import { protectApi } from '@/app/libs/protectApi';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';
import { DailyTicketService } from '@/app/libs/services/daily-ticket.service';
import {
  CLOSE_STATUS_VALUES,
  isTicketInWork,
  getTicketCategory,
} from '@/app/libs/ticket-utils';
import {
  normalizeJenis,
} from '@/app/config/jenis-tiket';
import { getB2BGroupKey } from '@/app/config/b2b-groups';
import { normalizeCustomerType } from '@/app/config/customer-types';
import { getOrSetCache, DASHBOARD_CACHE_TTL } from '@/lib/cache';
import { enforceApiRateLimit } from '@/lib/api-rate-limit';
import { parseSearchType } from '@/lib/search-intent';
import { toEnumValue } from '@/lib/http-query';
import { logger } from '@/lib/observability/logger';

export const dynamic = 'force-dynamic';

const CACHE_TTL_SECONDS = DASHBOARD_CACHE_TTL;
const CLOSE_STATUS_SQL = CLOSE_STATUS_VALUES.map((v) => `'${v}'`).join(', ');
const EMPTY_COUNTS = {
  total: 0,
  open: 0,
  assigned: 0,
  close: 0,
  regulerCount: 0,
  sqmCount: 0,
  unspecCount: 0,
  customerCount: 0,
  ffgCount: 0,
  gamasCount: 0,
  p1Count: 0,
  pPlusCount: 0,
};

type SummaryCounts = typeof EMPTY_COUNTS;

function cloneCounts(): SummaryCounts {
  return { ...EMPTY_COUNTS };
}

function isMissingIndexError(error: unknown): boolean {
  const message = String((error as { message?: string })?.message ?? '');
  return message.includes('Code: `1176`') || /doesn't exist in table/i.test(message);
}

function buildCacheKey(params: URLSearchParams, role: string, userId: number) {
  const filterParams = new URLSearchParams(params);
  if (filterParams.has('_t')) return null;
  filterParams.sort();
  return `dashboard_operations_summary:${role}:${userId}:${filterParams.toString()}`;
}

function withWhere(
  baseWhere: Prisma.ticketWhereInput,
  ...clauses: Prisma.ticketWhereInput[]
) {
  const activeClauses = clauses.filter((clause) => Object.keys(clause).length > 0);
  if (activeClauses.length === 0) return baseWhere;
  return {
    AND: [baseWhere, ...activeClauses],
  };
}

function buildSqlWhereClause(baseWhere: Prisma.ticketWhereInput): [string, any[]] {
  const conditions: string[] = [];
  const params: any[] = [];

  function walk(node: any, parentOp: 'AND' | 'OR' = 'AND') {
    if (!node || typeof node !== 'object') return;

    if (Array.isArray(node)) {
      const childConditions = node
        .map((item) => {
          const localConditions: string[] = [];
          const originalPush = conditions.push;
          conditions.push = ((condition: string) => {
            localConditions.push(condition);
            return localConditions.length;
          }) as typeof conditions.push;
          walk(item, parentOp);
          conditions.push = originalPush;
          if (localConditions.length === 0) return null;
          return localConditions.length > 1
            ? `(${localConditions.join(` ${parentOp} `)})`
            : localConditions[0];
        })
        .filter(Boolean) as string[];

      if (childConditions.length > 0) {
        conditions.push(
          childConditions.length > 1
            ? `(${childConditions.join(` ${parentOp} `)})`
            : childConditions[0],
        );
      }
      return;
    }

    for (const [key, value] of Object.entries(node)) {
      if (key === 'AND' && Array.isArray(value)) {
        const childConditions: string[] = [];
        const originalPush = conditions.push;
        conditions.push = ((condition: string) => {
          childConditions.push(condition);
          return childConditions.length;
        }) as typeof conditions.push;
        for (const item of value) walk(item, 'AND');
        conditions.push = originalPush;
        if (childConditions.length > 0) {
          conditions.push(`(${childConditions.join(' AND ')})`);
        }
        continue;
      }

      if (key === 'OR' && Array.isArray(value)) {
        const childConditions: string[] = [];
        const originalPush = conditions.push;
        conditions.push = ((condition: string) => {
          childConditions.push(condition);
          return childConditions.length;
        }) as typeof conditions.push;
        for (const item of value) walk(item, 'OR');
        conditions.push = originalPush;
        if (childConditions.length > 0) {
          conditions.push(`(${childConditions.join(' OR ')})`);
        }
        continue;
      }

      if (key === 'NOT') {
        const values = Array.isArray(value) ? value : [value];
        const childConditions: string[] = [];
        const originalPush = conditions.push;
        conditions.push = ((condition: string) => {
          childConditions.push(condition);
          return childConditions.length;
        }) as typeof conditions.push;
        for (const item of values) walk(item, 'AND');
        conditions.push = originalPush;
        if (childConditions.length > 0) {
          conditions.push(`NOT (${childConditions.join(' AND ')})`);
        }
        continue;
      }

      if (
        typeof value === 'object' &&
        value !== null &&
        !Array.isArray(value)
      ) {
        const operator = value as Record<string, any>;

        if (operator.in !== undefined && Array.isArray(operator.in)) {
          const placeholders = operator.in.map(() => '?');
          conditions.push(`\`${key}\` IN (${placeholders.join(',')})`);
          params.push(...operator.in);
          continue;
        }

        if (operator.notIn !== undefined && Array.isArray(operator.notIn)) {
          if (operator.notIn.length === 0) continue;
          const placeholders = operator.notIn.map(() => '?');
          conditions.push(`\`${key}\` NOT IN (${placeholders.join(',')})`);
          params.push(...operator.notIn);
          continue;
        }

        if (operator.not !== undefined) {
          if (operator.not === null) {
            conditions.push(`\`${key}\` IS NOT NULL`);
          } else {
            conditions.push(`\`${key}\` != ?`);
            params.push(operator.not);
          }
          continue;
        }

        if (operator.gte !== undefined) {
          conditions.push(`\`${key}\` >= ?`);
          params.push(operator.gte);
          continue;
        }

        if (operator.lte !== undefined) {
          conditions.push(`\`${key}\` <= ?`);
          params.push(operator.lte);
          continue;
        }

        if (operator.contains !== undefined) {
          conditions.push(`\`${key}\` LIKE ?`);
          params.push(`%${operator.contains}%`);
          continue;
        }

        if (operator.startsWith !== undefined) {
          conditions.push(`\`${key}\` LIKE ?`);
          params.push(`${operator.startsWith}%`);
          continue;
        }

        if (operator.equals !== undefined) {
          conditions.push(`\`${key}\` = ?`);
          params.push(operator.equals);
          continue;
        }
      }

      if (value === null) {
        conditions.push(`\`${key}\` IS NULL`);
      } else {
        conditions.push(`\`${key}\` = ?`);
        params.push(value);
      }
    }
  }

  walk(baseWhere);
  return [conditions.length > 0 ? conditions.join(' AND ') : '1=1', params];
}

const validGamasWhere = {
  AND: [
    { ticket_id_gamas: { not: null } },
    { ticket_id_gamas: { not: '' } },
    { ticket_id_gamas: { not: '-' } },
    { ticket_id_gamas: { not: '--' } },
    { ticket_id_gamas: { not: 'null' } },
    { ticket_id_gamas: { not: 'undefined' } },
    { ticket_id_gamas: { not: 'n/a' } },
    { ticket_id_gamas: { not: 'na' } },
  ],
};

const carryOverWhere = {
  AND: [
    { pending_dompis: { not: null } },
    { pending_dompis: { not: '' } },
  ],
};

const regulerJenis1Where: Prisma.ticketWhereInput = {
  OR: [
    { jenis_tiket_1: 'reguler' },
    { jenis_tiket_1: 'REGULER' },
    { jenis_tiket_1: 'regular' },
    { jenis_tiket_1: 'REGULAR' },
    { jenis_tiket_1: 'reg' },
    { jenis_tiket_1: 'REG' },
  ],
};

function statusBucket(status: string | null, statusUpdate: string | null): 'open' | 'assigned' | 'close' {
  const category = getTicketCategory(status, statusUpdate);
  if (category === 'close') return 'close';
  if (category === 'assigned' || category === 'on_progress' || category === 'pending') return 'assigned';
  return 'open';
}

function buildFocusCountsRawSql(
  baseWhere: Prisma.ticketWhereInput,
): [string, string, any[]] {
  const [whereClause, params] = buildSqlWhereClause(baseWhere);
  const sqlWithIndex = `
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN status IN (${CLOSE_STATUS_SQL}) THEN 1 ELSE 0 END) AS close_count,
      SUM(CASE WHEN status NOT IN (${CLOSE_STATUS_SQL}) AND status_update IN ('assigned', 'on_progress', 'pending', 'escalated') THEN 1 ELSE 0 END) AS assigned_count,
      SUM(CASE WHEN status NOT IN (${CLOSE_STATUS_SQL}) AND (status_update IS NULL OR status_update NOT IN ('assigned', 'on_progress', 'pending', 'escalated', 'close')) THEN 1 ELSE 0 END) AS open_count,
      SUM(CASE WHEN customer_type = 'HVC_DIAMOND' THEN 1 ELSE 0 END) AS diamond,
      SUM(CASE WHEN flagging_manja = 'P1' THEN 1 ELSE 0 END) AS p1,
      SUM(CASE WHEN ticket_id_gamas IS NOT NULL AND ticket_id_gamas NOT IN ('', '-', '--', 'null', 'undefined', 'n/a', 'na') THEN 1 ELSE 0 END) AS gamas,
      SUM(CASE WHEN guarantee_status = 'guarantee' THEN 1 ELSE 0 END) AS ffg,
      SUM(CASE WHEN pending_dompis IS NOT NULL AND pending_dompis != '' THEN 1 ELSE 0 END) AS carry_over
    FROM ticket
    WHERE ${whereClause}
  `;
  const sqlWithoutIndex = `
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN status IN (${CLOSE_STATUS_SQL}) THEN 1 ELSE 0 END) AS close_count,
      SUM(CASE WHEN status NOT IN (${CLOSE_STATUS_SQL}) AND status_update IN ('assigned', 'on_progress', 'pending', 'escalated') THEN 1 ELSE 0 END) AS assigned_count,
      SUM(CASE WHEN status NOT IN (${CLOSE_STATUS_SQL}) AND (status_update IS NULL OR status_update NOT IN ('assigned', 'on_progress', 'pending', 'escalated', 'close')) THEN 1 ELSE 0 END) AS open_count,
      SUM(CASE WHEN customer_type = 'HVC_DIAMOND' THEN 1 ELSE 0 END) AS diamond,
      SUM(CASE WHEN flagging_manja = 'P1' THEN 1 ELSE 0 END) AS p1,
      SUM(CASE WHEN ticket_id_gamas IS NOT NULL AND ticket_id_gamas NOT IN ('', '-', '--', 'null', 'undefined', 'n/a', 'na') THEN 1 ELSE 0 END) AS gamas,
      SUM(CASE WHEN guarantee_status = 'guarantee' THEN 1 ELSE 0 END) AS ffg,
      SUM(CASE WHEN pending_dompis IS NOT NULL AND pending_dompis != '' THEN 1 ELSE 0 END) AS carry_over
    FROM ticket
    WHERE ${whereClause}
  `;
  return [sqlWithIndex, sqlWithoutIndex, params];
}

function buildB2BGroupsRawSql(
  b2bWhere: Prisma.ticketWhereInput,
): [string, string, any[]] {
  const [whereClause, params] = buildSqlWhereClause(b2bWhere);

  const sqlWithIndex = `
    SELECT
      jenis_tiket_1,
      status,
      status_update,
      COUNT(*) AS total,
      SUM(CASE WHEN guarantee_status = 'guarantee' THEN 1 ELSE 0 END) AS ffg,
      SUM(CASE WHEN ticket_id_gamas IS NOT NULL AND ticket_id_gamas NOT IN ('', '-', '--', 'null', 'undefined', 'n/a', 'na') THEN 1 ELSE 0 END) AS gamas,
      SUM(CASE WHEN flagging_manja = 'P1' THEN 1 ELSE 0 END) AS p1,
      SUM(CASE WHEN flagging_manja = 'P+' THEN 1 ELSE 0 END) AS p_plus
    FROM ticket
    WHERE ${whereClause}
    GROUP BY jenis_tiket_1, status, status_update
  `;
  const sqlWithoutIndex = `
    SELECT
      jenis_tiket_1,
      status,
      status_update,
      COUNT(*) AS total,
      SUM(CASE WHEN guarantee_status = 'guarantee' THEN 1 ELSE 0 END) AS ffg,
      SUM(CASE WHEN ticket_id_gamas IS NOT NULL AND ticket_id_gamas NOT IN ('', '-', '--', 'null', 'undefined', 'n/a', 'na') THEN 1 ELSE 0 END) AS gamas,
      SUM(CASE WHEN flagging_manja = 'P1' THEN 1 ELSE 0 END) AS p1,
      SUM(CASE WHEN flagging_manja = 'P+' THEN 1 ELSE 0 END) AS p_plus
    FROM ticket
    WHERE ${whereClause}
    GROUP BY jenis_tiket_1, status, status_update
  `;
  return [sqlWithIndex, sqlWithoutIndex, params];
}

function buildB2CSummaryRawSql(
  b2cWhere: Prisma.ticketWhereInput,
): [string, string, any[]] {
  const [whereClause, params] = buildSqlWhereClause(b2cWhere);

  const sqlWithIndex = `
    SELECT
      customer_type,
      status,
      status_update,
      COALESCE(jenis_tiket_2, jenis_tiket_1) AS jenis_tiket_bucket,
      COUNT(*) AS total,
      SUM(CASE WHEN guarantee_status = 'guarantee' THEN 1 ELSE 0 END) AS ffg,
      SUM(CASE WHEN ticket_id_gamas IS NOT NULL AND ticket_id_gamas NOT IN ('', '-', '--', 'null', 'undefined', 'n/a', 'na') THEN 1 ELSE 0 END) AS gamas,
      SUM(CASE WHEN flagging_manja = 'P1' THEN 1 ELSE 0 END) AS p1,
      SUM(CASE WHEN flagging_manja = 'P+' THEN 1 ELSE 0 END) AS p_plus
    FROM ticket
    WHERE ${whereClause}
    GROUP BY customer_type, status, status_update, COALESCE(jenis_tiket_2, jenis_tiket_1)
  `;
  const sqlWithoutIndex = `
    SELECT
      customer_type,
      status,
      status_update,
      COALESCE(jenis_tiket_2, jenis_tiket_1) AS jenis_tiket_bucket,
      COUNT(*) AS total,
      SUM(CASE WHEN guarantee_status = 'guarantee' THEN 1 ELSE 0 END) AS ffg,
      SUM(CASE WHEN ticket_id_gamas IS NOT NULL AND ticket_id_gamas NOT IN ('', '-', '--', 'null', 'undefined', 'n/a', 'na') THEN 1 ELSE 0 END) AS gamas,
      SUM(CASE WHEN flagging_manja = 'P1' THEN 1 ELSE 0 END) AS p1,
      SUM(CASE WHEN flagging_manja = 'P+' THEN 1 ELSE 0 END) AS p_plus
    FROM ticket
    WHERE ${whereClause}
    GROUP BY customer_type, status, status_update, COALESCE(jenis_tiket_2, jenis_tiket_1)
  `;
  return [sqlWithIndex, sqlWithoutIndex, params];
}

function buildServiceAreasRawSql(
  where: Prisma.ticketWhereInput,
): [string, string, any[]] {
  const [whereClause, params] = buildSqlWhereClause(where);

  const sqlWithIndex = `
    SELECT
      workzone,
      COUNT(*) AS total,
      SUM(CASE WHEN status IN (${CLOSE_STATUS_SQL}) THEN 1 ELSE 0 END) AS close_count,
      SUM(CASE WHEN status NOT IN (${CLOSE_STATUS_SQL}) AND status_update IN ('assigned', 'on_progress', 'pending', 'escalated') THEN 1 ELSE 0 END) AS assigned_count,
      SUM(CASE WHEN status NOT IN (${CLOSE_STATUS_SQL}) AND (status_update IS NULL OR status_update NOT IN ('assigned', 'on_progress', 'pending', 'escalated', 'close')) THEN 1 ELSE 0 END) AS open_count,
      COUNT(DISTINCT teknisi_user_id) AS teknisi,
      SUM(CASE WHEN customer_type = 'REGULER' THEN 1 ELSE 0 END) AS reguler,
      SUM(CASE WHEN customer_type = 'HVC_GOLD' THEN 1 ELSE 0 END) AS hvc_gold,
      SUM(CASE WHEN customer_type = 'HVC_PLATINUM' THEN 1 ELSE 0 END) AS hvc_platinum,
      SUM(CASE WHEN customer_type = 'HVC_DIAMOND' THEN 1 ELSE 0 END) AS hvc_diamond
    FROM ticket
    WHERE ${whereClause}
    GROUP BY workzone
    ORDER BY total DESC
    LIMIT 10
  `;
  const sqlWithoutIndex = `
    SELECT
      workzone,
      COUNT(*) AS total,
      SUM(CASE WHEN status IN (${CLOSE_STATUS_SQL}) THEN 1 ELSE 0 END) AS close_count,
      SUM(CASE WHEN status NOT IN (${CLOSE_STATUS_SQL}) AND status_update IN ('assigned', 'on_progress', 'pending', 'escalated') THEN 1 ELSE 0 END) AS assigned_count,
      SUM(CASE WHEN status NOT IN (${CLOSE_STATUS_SQL}) AND (status_update IS NULL OR status_update NOT IN ('assigned', 'on_progress', 'pending', 'escalated', 'close')) THEN 1 ELSE 0 END) AS open_count,
      COUNT(DISTINCT teknisi_user_id) AS teknisi,
      SUM(CASE WHEN customer_type = 'REGULER' THEN 1 ELSE 0 END) AS reguler,
      SUM(CASE WHEN customer_type = 'HVC_GOLD' THEN 1 ELSE 0 END) AS hvc_gold,
      SUM(CASE WHEN customer_type = 'HVC_PLATINUM' THEN 1 ELSE 0 END) AS hvc_platinum,
      SUM(CASE WHEN customer_type = 'HVC_DIAMOND' THEN 1 ELSE 0 END) AS hvc_diamond
    FROM ticket
    WHERE ${whereClause}
    GROUP BY workzone
    ORDER BY total DESC
    LIMIT 10
  `;
  return [sqlWithIndex, sqlWithoutIndex, params];
}

function buildStatusCountsRawSql(
  where: Prisma.ticketWhereInput,
): [string, string, any[]] {
  const [whereClause, params] = buildSqlWhereClause(where);

  const sqlWithIndex = `
    SELECT
      status,
      status_update,
      COUNT(*) AS total
    FROM ticket
    WHERE ${whereClause}
    GROUP BY status, status_update
  `;
  const sqlWithoutIndex = `
    SELECT
      status,
      status_update,
      COUNT(*) AS total
    FROM ticket
    WHERE ${whereClause}
    GROUP BY status, status_update
  `;

  return [sqlWithIndex, sqlWithoutIndex, params];
}

async function queryRawWithOptionalIndex<T>(
  sqlWithIndex: string,
  sqlWithoutIndex: string,
  params: unknown[],
): Promise<T> {
  try {
    return await prisma.$queryRawUnsafe<T>(sqlWithIndex, ...params);
  } catch (error) {
    if (!isMissingIndexError(error)) throw error;
    logger.warn('[OperationsSummary] FORCE INDEX skipped:', { detail: String((error as Error)?.message ?? error) });
    return prisma.$queryRawUnsafe<T>(sqlWithoutIndex, ...params);
  }
}

async function buildB2CSummary(
  b2cWhere: Prisma.ticketWhereInput,
): Promise<{
  summary: SummaryCounts;
  reguler: SummaryCounts;
  hvcGold: SummaryCounts;
  hvcPlatinum: SummaryCounts;
  hvcDiamond: SummaryCounts;
}> {
  const [sqlWithIndex, sqlWithoutIndex, params] = buildB2CSummaryRawSql(b2cWhere);
  const rows: Array<{
    customer_type: string | null;
    status: string | null;
    status_update: string | null;
    jenis_tiket_bucket: string | null;
    total: bigint;
    ffg: bigint;
    gamas: bigint;
    p1: bigint;
    p_plus: bigint;
  }> = await queryRawWithOptionalIndex(sqlWithIndex, sqlWithoutIndex, params);

  const summary = cloneCounts();
  const ctMap = new Map<string, SummaryCounts>();

  function getCt(ct: string | null): SummaryCounts {
    const key = normalizeCustomerType(ct) || String(ct ?? '').trim().toUpperCase();
    if (!ctMap.has(key)) ctMap.set(key, cloneCounts());
    return ctMap.get(key)!;
  }

  function applyJenisCount(target: SummaryCounts, jenis: string | null, count: number) {
    const normalized = normalizeJenis(jenis);
    if (!normalized || normalized === 'reguler' || normalized === 'hvc') {
      target.customerCount += count;
      return;
    }

    if (normalized === 'sqm') {
      target.sqmCount += count;
      return;
    }

    target.unspecCount += count;
  }

  for (const row of rows) {
    const count = Number(row.total);
    const flags = {
      ffg: Number(row.ffg),
      gamas: Number(row.gamas),
      p1: Number(row.p1),
      pPlus: Number(row.p_plus),
    };
    const bucket = statusBucket(row.status, row.status_update);
    const customerSummary = getCt(row.customer_type);
    const targets = [summary, customerSummary];

    for (const target of targets) {
      target.total += count;
      if (bucket === 'close') target.close += count;
      else if (bucket === 'assigned') target.assigned += count;
      else target.open += count;
      target.ffgCount += flags.ffg;
      target.gamasCount += flags.gamas;
      target.p1Count += flags.p1;
      target.pPlusCount += flags.pPlus;
      applyJenisCount(target, row.jenis_tiket_bucket, count);
    }
  }

  return {
    summary,
    reguler: getCt('REGULER'),
    hvcGold: getCt('HVC_GOLD'),
    hvcPlatinum: getCt('HVC_PLATINUM'),
    hvcDiamond: getCt('HVC_DIAMOND'),
  };
}

async function buildB2BGroupsOptimized(
  b2bWhere: Prisma.ticketWhereInput,
) {
  const [sqlWithIndex, sqlWithoutIndex, params] = buildB2BGroupsRawSql(b2bWhere);
  const rows: Array<{
    jenis_tiket_1: string | null;
    status: string | null;
    status_update: string | null;
    total: bigint;
    ffg: bigint;
    gamas: bigint;
    p1: bigint;
    p_plus: bigint;
  }> = await queryRawWithOptionalIndex(sqlWithIndex, sqlWithoutIndex, params);

  const groups = new Map<string, SummaryCounts>();
  const getGroup = (jenisTiket1: string | null) => {
    const key = getB2BGroupKey(jenisTiket1);
    if (!groups.has(key)) groups.set(key, cloneCounts());
    return groups.get(key)!;
  };

  for (const row of rows) {
    const s = getGroup(row.jenis_tiket_1);
    const count = Number(row.total);
    s.total += count;
    const bucket = statusBucket(row.status, row.status_update);
    if (bucket === 'close') s.close += count;
    else if (bucket === 'assigned') s.assigned += count;
    else s.open += count;
    s.ffgCount += Number(row.ffg);
    s.gamasCount += Number(row.gamas);
    s.p1Count += Number(row.p1);
    s.pPlusCount += Number(row.p_plus);
  }

  return Object.fromEntries(groups.entries());
}

async function buildServiceAreas(where: Prisma.ticketWhereInput) {
  const [sqlWithIndex, sqlWithoutIndex, params] = buildServiceAreasRawSql(where);
  const rows: Array<{
    workzone: string | null;
    total: bigint;
    close_count: bigint;
    assigned_count: bigint;
    open_count: bigint;
    teknisi: bigint;
    reguler: bigint;
    hvc_gold: bigint;
    hvc_platinum: bigint;
    hvc_diamond: bigint;
  }> = await queryRawWithOptionalIndex(sqlWithIndex, sqlWithoutIndex, params);

  return rows.map((row) => ({
    name: String(row.workzone ?? '').trim(),
    total: Number(row.total),
    open: Number(row.open_count),
    assigned: Number(row.assigned_count),
    close: Number(row.close_count),
    unassigned: Number(row.open_count),
    teknisi: Number(row.teknisi),
    reguler: Number(row.reguler),
    hvcGold: Number(row.hvc_gold),
    hvcPlatinum: Number(row.hvc_platinum),
    hvcDiamond: Number(row.hvc_diamond),
  }));
}

async function buildOperationsSummaryResult(
  user: { role: string; id_user: number },
  filters: {
    search: string;
    searchType: ReturnType<typeof parseSearchType>;
    dept: 'all' | 'b2b' | 'b2c';
    workzone?: string;
    ticketType?: string;
    statusUpdate?: string;
  },
) {
  const where = (await DailyTicketService.buildDailyTicketWhere(
    user.role,
    user.id_user,
    {
      ...filters,
      includeClosed: true,
    },
  )) as Prisma.ticketWhereInput;
  const activeWhere = DailyTicketService.buildMainTableWhere(where);

  const b2cWhere = withWhere(
    where,
    { customer_segment: { in: ['DCS', 'PL-TSEL'] } } as Prisma.ticketWhereInput,
  );
  const b2bWhere = withWhere(
    where,
    {
      OR: [
        { customer_segment: { notIn: ['DCS', 'PL-TSEL'] } },
        { customer_segment: null },
      ],
    } as Prisma.ticketWhereInput,
  );
  const b2cRegulerWhere = withWhere(b2cWhere, regulerJenis1Where);
  const b2bRegulerWhere = withWhere(b2bWhere, regulerJenis1Where);

  const [
    b2cStats,
    b2cRegulerStats,
    b2bGroups,
    b2bRegulerGroups,
    serviceAreas,
    focusRaw,
  ] = await Promise.all([
    buildB2CSummary(b2cWhere),
    buildB2CSummary(b2cRegulerWhere),
    buildB2BGroupsOptimized(b2bWhere),
    buildB2BGroupsOptimized(b2bRegulerWhere),
    buildServiceAreas(where),
    (() => {
      const [sqlWithIndex, sqlWithoutIndex, params] = buildFocusCountsRawSql(activeWhere);
      return queryRawWithOptionalIndex<Array<{
        total: bigint;
        close_count: bigint;
        assigned_count: bigint;
        open_count: bigint;
        diamond: bigint;
        p1: bigint;
        gamas: bigint;
        ffg: bigint;
        carry_over: bigint;
      }>>(sqlWithIndex, sqlWithoutIndex, params);
    })(),
  ]);

  const focusRow = focusRaw?.[0];

  const focusCounts = {
    diamond: Number(focusRow?.diamond ?? 0),
    p1: Number(focusRow?.p1 ?? 0),
    gamas: Number(focusRow?.gamas ?? 0),
    ffg: Number(focusRow?.ffg ?? 0),
    carryOver: Number(focusRow?.carry_over ?? 0),
  };

  const b2bSummary = Object.values(b2bGroups).reduce(
    (acc, group) => {
      acc.total += group.total;
      acc.open += group.open;
      acc.assigned += group.assigned;
      acc.close += group.close;
      acc.ffgCount += group.ffgCount ?? 0;
      acc.gamasCount += group.gamasCount ?? 0;
      acc.p1Count += group.p1Count ?? 0;
      acc.pPlusCount += group.pPlusCount ?? 0;
      return acc;
    },
    cloneCounts(),
  );

  const b2cSummary = {
    ...b2cStats,
    summary: b2cStats.summary,
  };

  const b2cTotal = b2cStats.summary.total;
  const b2bTotal = b2bSummary.total;

  const overallSummary = {
    total: b2cStats.summary.total + b2bSummary.total,
    unassigned: b2cStats.summary.open + b2bSummary.open,
    assigned: b2cStats.summary.assigned + b2bSummary.assigned,
    close: b2cStats.summary.close + b2bSummary.close,
  };

  return {
    stats: {
      total: overallSummary.total,
      unassigned: overallSummary.unassigned,
      assigned: overallSummary.assigned,
      close: overallSummary.close,
      b2c: b2cTotal,
      b2b: b2bTotal,
    },
    b2cStats: b2cSummary,
    b2bSummary,
    b2bGroups,
    serviceAreas,
    focusCounts,
    generatedAt: new Date().toISOString(),
  };
}

export async function GET(request: Request) {
  try {
    const rateLimited = await enforceApiRateLimit(request, {
      namespace: 'operations-summary',
      limit: 30,
      windowSeconds: 60,
    });
    if (rateLimited) return rateLimited;

    const user = await protectApi([
      'admin',
      'teknisi',
      'helpdesk',
      'superadmin',
      'super_admin',
    ]);

    const { searchParams } = new URL(request.url);
    const filters = {
      search: searchParams.get('search') || '',
      searchType: parseSearchType(searchParams.get('searchType')),
      dept: toEnumValue(searchParams.get('dept'), ['all', 'b2b', 'b2c']) ?? 'all',
      workzone: searchParams.get('workzone') || undefined,
      ticketType:
        searchParams.get('ticketType') ||
        searchParams.get('jenisTiket') ||
        undefined,
      statusUpdate:
        searchParams.get('statusUpdate') ||
        searchParams.get('status') ||
        undefined,
    };

    const cacheKey = buildCacheKey(searchParams, user.role, user.id_user);
    const result = cacheKey
      ? await getOrSetCache(
          cacheKey,
          () => buildOperationsSummaryResult(user, filters),
          CACHE_TTL_SECONDS,
        )
      : await buildOperationsSummaryResult(user, filters);

    return NextResponse.json(
      {
        success: true,
        data: result,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error: unknown) {
    return NextResponse.json(
      {
        success: false,
        message: getErrorMessage(error, 'Error fetching operations summary'),
      },
      { status: getErrorStatus(error, 500) },
    );
  }
}
