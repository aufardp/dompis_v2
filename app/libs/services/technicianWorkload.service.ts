import prisma from '@/app/libs/prisma';
import { Prisma } from '@prisma/client';

export type TechnicianLoad = {
  active_tickets: number;
  assigned_count: number;
  on_progress_count: number;
  pending_count: number;
  avg_ttr_hours: number | null;
  overloaded: boolean;
  load_score: number;
  recommended: boolean;
};

export type WorkloadThresholds = {
  maxActivePerTech: number;
  targetTtrHours: number;
  maxPendingPerTech: number;
};

export const DEFAULT_WORKLOAD_THRESHOLDS: WorkloadThresholds = {
  maxActivePerTech: 3,
  targetTtrHours: 8,
  maxPendingPerTech: 3,
};

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function computeLoadScore(
  load: Pick<TechnicianLoad, 'active_tickets' | 'pending_count' | 'avg_ttr_hours'>,
  thresholds: WorkloadThresholds,
): number {
  const { maxActivePerTech, targetTtrHours, maxPendingPerTech } = thresholds;

  const loadedPart =
    clamp01(load.active_tickets / maxActivePerTech) * 60;
  const ttrPart =
    clamp01((load.avg_ttr_hours ?? 0) / targetTtrHours) * 25;
  const pendingPart =
    clamp01(load.pending_count / maxPendingPerTech) * 15;

  return Math.round(loadedPart + ttrPart + pendingPart);
}

function emptyLoad(): TechnicianLoad {
  return {
    active_tickets: 0,
    assigned_count: 0,
    on_progress_count: 0,
    pending_count: 0,
    avg_ttr_hours: null,
    overloaded: false,
    load_score: 0,
    recommended: false,
  };
}

/**
 * Compute real-time workload + historical TTR for a set of technicians.
 * Source data:
 *  - active tickets: `ticket` groupBy teknisi_user_id x status_update
 *  - avg TTR (30d): ticket_tracking assigned_at -> closed_at (same pattern as performance route)
 */
export async function computeTechnicianWorkload(
  technicianIds: number[],
  thresholds: WorkloadThresholds = DEFAULT_WORKLOAD_THRESHOLDS,
): Promise<Map<number, TechnicianLoad>> {
  const loadMap = new Map<number, TechnicianLoad>();

  if (technicianIds.length === 0) return loadMap;

  for (const id of technicianIds) {
    loadMap.set(id, emptyLoad());
  }

  const [ticketGroups, ttrRows] = await Promise.all([
    prisma.ticket.groupBy({
      by: ['teknisi_user_id', 'status_update'],
      where: {
        teknisi_user_id: { in: technicianIds },
        status_update: { in: ['assigned', 'on_progress', 'pending'] },
      },
      _count: { _all: true },
    }),
    prisma.$queryRaw<
      Array<{ tech_id: number; avg_hours: number | null }>
    >(
      Prisma.sql`
        SELECT tt.assigned_to as tech_id,
               AVG(TIMESTAMPDIFF(SECOND, tt.assigned_at, tt.closed_at)) / 3600 as avg_hours
        FROM ticket_tracking tt
        JOIN ticket t ON t.id_ticket = tt.ticket_id
        WHERE tt.assigned_at IS NOT NULL
          AND tt.closed_at IS NOT NULL
          AND tt.closed_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
          AND t.teknisi_user_id = tt.assigned_to
          AND t.teknisi_user_id IN (${Prisma.join(technicianIds)})
          AND LOWER(t.status_update) IN ('close','closed')
        GROUP BY tt.assigned_to
      `,
    ),
  ]);

  for (const g of ticketGroups) {
    const load = loadMap.get(g.teknisi_user_id ?? -1);
    if (!load) continue;

    const status = String(g.status_update ?? '').toLowerCase();
    const count = g._count._all;

    load.active_tickets += count;
    if (status === 'assigned') load.assigned_count += count;
    else if (status === 'on_progress') load.on_progress_count += count;
    else if (status === 'pending') load.pending_count += count;
  }

  for (const row of ttrRows) {
    const load = loadMap.get(row.tech_id);
    if (row.avg_hours === null) continue;
    if (!load) continue;
    load.avg_ttr_hours = Number(row.avg_hours);
  }

  // Recompute derived metrics after aggregation
  for (const [id, load] of loadMap) {
    load.overloaded =
      load.active_tickets >= thresholds.maxActivePerTech;
    load.load_score = computeLoadScore(load, thresholds);
    loadMap.set(id, load);
  }

  return loadMap;
}

/**
 * Mark the single lowest-scored (non-overloaded) technician as `recommended`.
 * Returns 0 if all technicians are overloaded.
 */
export function markRecommendedTechnician(
  loadMap: Map<number, TechnicianLoad>,
): number {
  let bestId = 0;
  let bestScore = Infinity;

  for (const [id, load] of loadMap) {
    if (load.overloaded) continue;
    if (load.load_score < bestScore) {
      bestScore = load.load_score;
      bestId = id;
    }
  }

  if (bestId) {
    const best = loadMap.get(bestId);
    if (best) {
      best.recommended = true;
      loadMap.set(bestId, best);
    }
  }

  return bestId;
}

export function summarizeWorkload(
  loadMap: Map<number, TechnicianLoad>,
): { total_teknisi: number; available: number; overloaded: number } {
  let available = 0;
  let overloadedCount = 0;

  for (const load of loadMap.values()) {
    if (load.overloaded) overloadedCount++;
    else available++;
  }

  return {
    total_teknisi: loadMap.size,
    available,
    overloaded: overloadedCount,
  };
}