import { Prisma } from '@prisma/client';
import prisma from '@/app/libs/prisma';
import { ActivityType } from '@/app/helpers/ticket.helpers';
import { invalidateTicketsCache } from '@/lib/cache';
import { broadcastTicketInvalidate } from '@/app/libs/sseBroadcast';
import { logActivity } from '@/app/helpers/ticket.helpers';
import { fastTrackingUpdate } from '@/app/helpers/tracking.helpers';
import { AttendanceService } from '@/app/libs/services/attendance.service';
import { createTechEvent } from '@/app/libs/createTechEvent';
import { buildTechEventEvidence } from '@/app/libs/buildTechEventEvidence';
import { autoAssignLogger } from '@/app/libs/autoAssignLogger';
import { logger } from '@/lib/observability/logger';
import { todayWibDate } from '@/lib/timezone';

export const SYSTEM_ACTOR = { id_user: 0, role: 'admin' } as const;

const CHUNK_SIZE = 50;
const isDev = process.env.NODE_ENV !== 'production';
const MAX_CONCURRENT = Math.max(
  1,
  Math.min(10, Number(process.env.AUTO_ASSIGN_CONCURRENCY || 3)),
);
const MAX_RETRIES = 3;
const MAX_TICKETS_PER_RUN = Math.max(
  50,
  Math.min(2000, Number(process.env.AUTO_ASSIGN_MAX_TICKETS_PER_RUN || 500)),
);
const TECH_EVENT_DISPATCH_CONCURRENCY = Math.max(
  1,
  Math.min(10, Number(process.env.AUTO_ASSIGN_EVENT_CONCURRENCY || 5)),
);

export interface AutoAssignResult {
  assigned: boolean;
  ticketId: number;
  reason: string;
  teknisiId?: number;
  teknisiNama?: string;
  clusterId?: number;
  clusterName?: string;
}

export interface BatchAutoAssignResult {
  total: number;
  assigned: number;
  skipped: number;
  failed: number;
  results: AutoAssignResult[];
}

export interface ProgressCallback {
  (data: {
    type: 'progress' | 'completed' | 'error';
    current: number;
    total: number;
    assigned: number;
    failed: number;
    chunk: number;
    totalChunks: number;
    message?: string;
  }): void;
}

interface TicketWithRk {
  id_ticket: number;
  incident: string;
  rk_information: string | null;
  status_update: string | null;
  teknisi_user_id: number | null;
  workzone: string | null;
  service_no: string | null;
  contact_name: string | null;
  owner_group: string | null;
  customer_type: string | null;
  jam_expired: string | null;
}

interface TicketForTechEvent {
  id_ticket: number;
  incident: string;
  workzone: string | null;
  service_no: string | null;
  contact_name: string | null;
  owner_group: string | null;
  customer_type: string | null;
  status_update: string | null;
}

interface ClusterInfo {
  id: number;
  nama_cluster: string;
  sa_id: number;
}

interface TeknisiLoad {
  teknisi_id: number;
  load: number;
}

/**
 * ClusterAutoAssignServiceV2 - Primary service (used in API route)
 * @deprecated use ClusterAutoAssignServiceV2 instead for batch operations
 */
export class ClusterAutoAssignServiceV2 {
  private static progressCallback: ProgressCallback | null = null;

  static setProgressCallback(callback: ProgressCallback | null) {
    this.progressCallback = callback;
  }

  private static emitProgress(data: Parameters<ProgressCallback>[0]) {
    if (this.progressCallback) {
      this.progressCallback(data);
    }
  }

  static async findClustersByOdc(
    odcValues: string[],
  ): Promise<Map<string, ClusterInfo>> {
    if (!odcValues.length) return new Map();

    const upperOdcValues = odcValues.map((v) => v.toUpperCase().trim());

    const nodes = await prisma.cluster_node.findMany({
      where: {
        is_active: true,
        odc_value: { in: [...odcValues, ...upperOdcValues] },
      },
      include: {
        cluster: {
          select: { id: true, nama_cluster: true, sa_id: true },
        },
      },
    });

    const result = new Map<string, ClusterInfo>();
    for (const node of nodes) {
      if (node.cluster) {
        const key = node.odc_value.toUpperCase();
        if (!result.has(key)) {
          result.set(key, {
            id: node.cluster.id,
            nama_cluster: node.cluster.nama_cluster,
            sa_id: node.cluster.sa_id,
          });
        }
      }
    }
    return result;
  }

  // @deprecated — use ClusterAutoAssignServiceV2.findClustersByOdc()
  static async findClusterByOdc(rkValue: string | null) {
    if (!rkValue?.trim()) return null;

    const trimmed = rkValue.trim();
    const upper = trimmed.toUpperCase();

    // Try exact match first, then uppercase match
    const nodes = (await prisma.cluster_node.findMany({
      where: {
        is_active: true,
        odc_value: { in: [trimmed, upper] },
      },
      include: {
        cluster: {
          select: {
            id: true,
            nama_cluster: true,
            is_active: true,
          },
        },
      },
    })) as Array<{
      odc_value: string;
      cluster: { id: number; nama_cluster: string; is_active: boolean } | null;
    }>;

    const matched = nodes.find(
      (n: {
        odc_value: string;
        cluster: {
          id: number;
          nama_cluster: string;
          is_active: boolean;
        } | null;
      }) => n.odc_value.toUpperCase() === upper && n.cluster?.is_active,
    );

    return matched?.cluster ?? null;
  }

  static async getWorkloadsForTeknisi(
    teknisiIds: number[],
    today?: string,
  ): Promise<Map<number, number>> {
    if (!teknisiIds.length) return new Map();

    const targetDate = today || AttendanceService.getTodayDateString();
    const targetDateStart = new Date(targetDate + 'T00:00:00.000Z');
    const targetDateEnd = new Date(targetDate + 'T23:59:59.999Z');

    const loads = await prisma.ticket.groupBy({
      by: ['teknisi_user_id'],
      where: {
        teknisi_user_id: { in: teknisiIds },
        status_update: { in: ['assigned', 'on_progress', 'pending'] },
        ticket_tracking: {
          assigned_at: {
            gte: targetDateStart,
            lt: targetDateEnd,
          },
        },
      },
      _count: { id_ticket: true },
    });

    return new Map(
      loads.map(
        (l: {
          teknisi_user_id: number | null;
          _count: { id_ticket: number };
        }) => [l.teknisi_user_id!, l._count.id_ticket],
      ),
    );
  }

  private static async getCheckedInTeknisiIds(
    teknisiIds: number[],
    today: string,
  ): Promise<Set<number>> {
    if (!teknisiIds.length) return new Set();

    const attendances = await prisma.technician_attendance.findMany({
      where: {
        technician_id: { in: teknisiIds },
        date: today,
      },
      select: { technician_id: true },
    });

    return new Set(attendances.map((a) => a.technician_id));
  }

  static async getActiveTeknisiForClusters(
    clusterIds: number[],
    today: string,
  ): Promise<
    Map<number, { teknisi_id: number; nama: string; nik: string | null; load: number }[]>
  > {
    if (!clusterIds.length) return new Map();

    if (isDev) {
      logger.info('[DEBUG-GATEC] Input clusterIds:', { clusterIds });
      logger.info('[DEBUG-GATEC] Input today:', { today });
    }

    const assignments = await prisma.cluster_assignment.findMany({
      where: {
        cluster_id: { in: clusterIds },
        assigned_date: today,
        is_active: true,
      },
      include: {
        teknisi: { select: { id_user: true, nama: true, nik: true } },
      },
    });

    if (isDev) {
      logger.info('[DEBUG-GATEC] cluster_assignment found:', { count: assignments.length });
      logger.info('[DEBUG-GATEC] Assignments:', { assignments: assignments.map(a => ({
        cluster_id: a.cluster_id,
        teknisi_id: a.teknisi_id,
        assigned_date: a.assigned_date
      })) });
    }

    const teknisiIds = [...new Set(assignments.map((a) => a.teknisi_id))];
    if (isDev) logger.info('[DEBUG-GATEC] Unique teknisi IDs:', { teknisiIds });

    const checkedInTeknisi = await this.getCheckedInTeknisiIds(teknisiIds, today);
    if (isDev) logger.info('[DEBUG-GATEC] Checked in teknisi:', { checkedIn: Array.from(checkedInTeknisi) });

    const workloadMap = await this.getWorkloadsForTeknisi(teknisiIds, today);
    if (isDev) logger.info('[DEBUG-GATEC] Workload map:', { workload: Array.from(workloadMap.entries()) });

    const MAX_LOAD_PER_TEKNISI = 40;
    const result = new Map<
      number,
      { teknisi_id: number; nama: string; nik: string | null; load: number }[]
    >();

    for (const assignment of assignments) {
      const teknisiId = assignment.teknisi_id;
      const currentLoad = workloadMap.get(teknisiId) ?? 0;

      if (!checkedInTeknisi.has(teknisiId)) {
        autoAssignLogger.ticketSkipped(
          0,
          `technisi_${teknisiId}`,
          `teknisi_not_checked_in_${today}`,
        );
        continue;
      }

      if (currentLoad >= MAX_LOAD_PER_TEKNISI) {
        autoAssignLogger.ticketSkipped(
          0,
          `technisi_${teknisiId}`,
          `teknisi_load_exceeded_${currentLoad}_${MAX_LOAD_PER_TEKNISI}`,
        );
        continue;
      }

      const existing = result.get(assignment.cluster_id) || [];
      existing.push({
        teknisi_id: teknisiId,
        nama: assignment.teknisi.nama ?? 'Unknown',
        nik: assignment.teknisi.nik ?? null,
        load: currentLoad,
      });
      result.set(assignment.cluster_id, existing);
    }
    return result;
  }

  private static async processChunkWithRetry(
    tickets: TicketWithRk[],
    clusterMap: Map<string, ClusterInfo>,
    teknisiMap: Map<
      number,
      { teknisi_id: number; nama: string; nik: string | null; load: number }[]
    >,
    workloadMap: Map<number, number>,
    actorId: number,
    chunkIndex: number,
  ): Promise<{ assigned: number; failed: number }> {
    const now = new Date();
    const roleId = 2;

    let assigned = 0;
    let failed = 0;

    const assignments: Array<{
      ticketId: number;
      incident: string;
      teknisiId: number;
      teknisiNama: string;
      teknisiNik: string | null;
      clusterName: string;
      oldStatus: string | null;
    }> = [];
    const appliedAssignments: typeof assignments = [];

    for (const ticket of tickets) {
      if (ticket.teknisi_user_id) {
        autoAssignLogger.ticketSkipped(
          ticket.id_ticket,
          ticket.incident,
          'already_assigned',
        );
        continue;
      }

      const rkValue = ticket.rk_information?.trim();
      if (!rkValue) {
        autoAssignLogger.ticketSkipped(
          ticket.id_ticket,
          ticket.incident,
          'no_rk_information',
        );
        continue;
      }

      const cluster = clusterMap.get(rkValue.toUpperCase());
      if (!cluster) {
        autoAssignLogger.ticketSkipped(
          ticket.id_ticket,
          ticket.incident,
          `no_cluster_matched_rk_${rkValue}`,
        );
        continue;
      }

      const teknisiList = teknisiMap.get(cluster.id);
      if (isDev) {
        logger.info('[AUTO-ASSIGN] Ticket -> Teknisi:', { ticketId: ticket.id_ticket, rk: rkValue, clusterId: cluster.id, clusterName: cluster.nama_cluster, teknisiCount: teknisiList?.length || 0 });
      }
      
      if (!teknisiList?.length) {
        if (isDev) {
          logger.info(`[AUTO-ASSIGN] SKIP: No teknisi in cluster ${cluster.id} for date ${new Date().toISOString().split('T')[0]}`);
        }
        autoAssignLogger.ticketSkipped(
          ticket.id_ticket,
          ticket.incident,
          `no_teknisi_available_cluster_${cluster.nama_cluster}`,
        );
        continue;
      }

      const sorted = [...teknisiList].sort((a, b) => {
        const loadA = (workloadMap.get(a.teknisi_id) ?? 0) + a.load;
        const loadB = (workloadMap.get(b.teknisi_id) ?? 0) + b.load;
        return loadA - loadB;
      });
      const chosen = sorted[0];
      if (isDev) {
        logger.info('[AUTO-ASSIGN] Round-robin chosen:', { teknisiId: chosen.teknisi_id, nama: chosen.nama, load: workloadMap.get(chosen.teknisi_id) ?? 0 });
      }

      assignments.push({
        ticketId: ticket.id_ticket,
        incident: ticket.incident,
        teknisiId: chosen.teknisi_id,
        teknisiNama: chosen.nama,
        teknisiNik: chosen.nik,
        clusterName: cluster.nama_cluster,
        oldStatus: ticket.status_update,
      });

      workloadMap.set(
        chosen.teknisi_id,
        (workloadMap.get(chosen.teknisi_id) ?? 0) + 1,
      );
      if (isDev) {
        logger.info('[AUTO-ASSIGN] ASSIGNED:', { ticketId: ticket.id_ticket, teknisiId: chosen.teknisi_id, load: chosen.load });
      }
    }

    for (const a of assignments) {
      try {
        const applied = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
          const updated = await tx.ticket.updateMany({
            where: {
              id_ticket: a.ticketId,
              teknisi_user_id: null,
              OR: [{ status_update: null }, { status_update: 'open' }],
            },
            data: {
              teknisi_user_id: a.teknisiId,
              status_update: 'assigned',
            },
          });

          if (updated.count === 0) return false;

          await fastTrackingUpdate(tx, a.ticketId, a.teknisiId, now);

          await tx.ticket_assignment_history.updateMany({
            where: { ticket_id: a.ticketId, is_active: true },
            data: { is_active: false, unassigned_at: now },
          });

          await tx.ticket_assignment_history.create({
            data: {
              ticket_id: a.ticketId,
              assigned_by: actorId || a.teknisiId,
              assigned_to: a.teknisiId,
              assigned_at: now,
              is_active: true,
            },
          });

          await logActivity(tx, {
            ticketId: a.ticketId,
            userId: actorId || a.teknisiId,
            roleId,
            type: ActivityType.AUTO_ASSIGN,
            description: `Auto-assigned ke ${a.teknisiNama} via cluster "${a.clusterName}"`,
          });

          return true;
        }, { isolationLevel: 'ReadCommitted', timeout: 15000 });

        if (!applied) {
          autoAssignLogger.ticketSkipped(
            a.ticketId,
            a.incident,
            'ticket_changed_before_autoassign_commit',
          );
          continue;
        }

        assigned++;
        appliedAssignments.push(a);

        autoAssignLogger.ticketAssigned(
          a.ticketId,
          a.incident,
          a.teknisiId,
          a.teknisiNama,
        );
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        autoAssignLogger.error('individual_assign_failed', {
          ticketId: a.ticketId,
          incident: a.incident,
          error: errorMsg,
        });
        failed++;
      }
    }

    if (appliedAssignments.length > 0) {
      void this.dispatchTechEventsAsync(appliedAssignments, actorId);
    }

    return { assigned, failed };
  }

  private static async dispatchTechEventsAsync(
    assignments: Array<{
      ticketId: number;
      incident: string;
      teknisiId: number;
      teknisiNama: string;
      teknisiNik: string | null;
      clusterName: string;
      oldStatus: string | null;
    }>,
    actorId: number,
  ) {
    const ticketIds = assignments.map((a) => a.ticketId);

    const ticketData = await prisma.ticket.findMany({
      where: { id_ticket: { in: ticketIds } },
      select: {
        id_ticket: true,
        incident: true,
        workzone: true,
        service_no: true,
        contact_name: true,
        owner_group: true,
        customer_type: true,
        status_update: true,
      },
    });

    const ticketMap = new Map(
      (ticketData as unknown as TicketForTechEvent[]).map(
        (t: TicketForTechEvent) => [t.id_ticket, t],
      ),
    );

    let cursor = 0;
    const workers = Array.from(
      { length: Math.min(TECH_EVENT_DISPATCH_CONCURRENCY, assignments.length) },
      async () => {
        while (cursor < assignments.length) {
          const a = assignments[cursor++];
          if (!a) continue;
          const ticket = ticketMap.get(a.ticketId);
          if (!ticket) continue;

          try {
            const evidence = await buildTechEventEvidence(ticket.incident);

            await createTechEvent({
              event_type: 'TICKET_ASSIGNED',
              ticket: {
                id: a.ticketId,
                incident: ticket.incident,
                workzone: ticket.workzone ?? '',
                service_no: ticket.service_no ?? '',
                customer_name: ticket.contact_name ?? '',
                owner_group: ticket.owner_group ?? null,
                customer_type: ticket.customer_type ?? null,
              },
              status: {
                old_hasil_visit:
                  (ticket.status_update?.toUpperCase() as any) ?? 'OPEN',
                new_hasil_visit: 'ASSIGNED',
                pending_dompis: null,
                evidence,
                rca: null,
                sub_rca: null,
              },
              old_technician: null,
              new_technician: {
                id_user: a.teknisiId,
                nik: a.teknisiNik,
                nama: a.teknisiNama ?? null,
              },
              actor: {
                id_user: actorId || 0,
                role: 'system',
              },
              admin: {
                nama: `AUTO-ASSIGN via cluster "${a.clusterName}"`,
                action: 'ASSIGNED',
              },
            });

            autoAssignLogger.webhookDispatched(a.ticketId, a.incident, true);
          } catch (err) {
            const errorMsg = err instanceof Error ? err.message : 'Unknown error';
            autoAssignLogger.webhookDispatched(
              a.ticketId,
              a.incident,
              false,
              errorMsg,
            );
          }
        }
      },
    );

    await Promise.allSettled(workers);
  }

  static async runBatchV2(
    saIds?: number[],
    actorId: number = SYSTEM_ACTOR.id_user,
  ): Promise<BatchAutoAssignResult> {
    const startTime = Date.now();
    if (isDev) {
      logger.info('[AUTO-ASSIGN] ===== START =====');
      logger.info('[AUTO-ASSIGN] saIds:', { saIds });
    }

    let workzoneFilter: string[] = [];
    if (saIds && saIds.length > 0) {
      const serviceAreas = await prisma.service_area.findMany({
        where: { id_sa: { in: saIds } },
        select: { nama_sa: true },
      });
      workzoneFilter = serviceAreas
        .map((sa) => sa.nama_sa)
        .filter((nama): nama is string => !!nama);
      if (isDev) {
        logger.info('[AUTO-ASSIGN] Filtering by workzones:', { workzoneFilter });
      }
    }

    const activeNodes = await prisma.cluster_node.findMany({
      where: {
        is_active: true,
        ...(saIds && saIds.length > 0 ? { cluster: { sa_id: { in: saIds } } } : {}),
      },
      select: { odc_value: true },
    });

    const activeOdcValues = activeNodes.map(
      (n: { odc_value: string }) => n.odc_value,
    );

    if (isDev) { logger.info('[AUTO-ASSIGN] Active ODC values:', { count: activeOdcValues.length }); }
    if (isDev && activeOdcValues.length > 0) {
      logger.info('[AUTO-ASSIGN] Active ODC values sample:', { sample: activeOdcValues.slice(0, 5) });
    }

    if (!activeOdcValues.length) {
      if (isDev) { logger.info('[AUTO-ASSIGN] No active ODC values found - returning 0'); }
      autoAssignLogger.batchStart(0);
      autoAssignLogger.batchComplete(0, 0, 0, 0, 0);
      return { total: 0, assigned: 0, skipped: 0, failed: 0, results: [] };
    }

    const today = AttendanceService.getTodayDateString();
    if (isDev) { logger.info('[AUTO-ASSIGN] Today date:', { today }); }

    const todayDate = todayWibDate();

    const allTickets: TicketWithRk[] = await prisma.ticket.findMany({
      where: {
        teknisi_user_id: null,
        rk_information: { in: activeOdcValues },
        ...(workzoneFilter.length > 0 && {
          workzone: { in: workzoneFilter },
        }),
        OR: [
          { status_update: null },
          { status_update: 'open' },
        ],
        sync_date: todayDate,
      },
      select: {
        id_ticket: true,
        incident: true,
        rk_information: true,
        status_update: true,
        teknisi_user_id: true,
        workzone: true,
        service_no: true,
        contact_name: true,
        owner_group: true,
        customer_type: true,
        jam_expired: true,
      },
      orderBy: { jam_expired: 'asc' },
      take: MAX_TICKETS_PER_RUN,
    });

    if (isDev) {
      logger.info('[AUTO-ASSIGN] Found tickets to process:', { count: allTickets.length });
      if (allTickets.length > 0) {
        logger.info('[AUTO-ASSIGN] Sample tickets:', { sample: allTickets.slice(0, 3).map(t => ({
          id: t.id_ticket,
          incident: t.incident,
          rk: t.rk_information,
          status: t.status_update
        })) });
      }
    }

    const total = allTickets.length;
    autoAssignLogger.batchStart(total);
    this.emitProgress({
      type: 'progress',
      current: 0,
      total,
      assigned: 0,
      failed: 0,
      chunk: 0,
      totalChunks: Math.ceil(total / CHUNK_SIZE),
    });

    if (total === 0) {
      if (isDev) { logger.info('[AUTO-ASSIGN] No tickets found - returning 0'); }
      autoAssignLogger.batchComplete(0, 0, 0, 0, Date.now() - startTime);
      return { total: 0, assigned: 0, skipped: 0, failed: 0, results: [] };
    }

    if (isDev) { logger.info('[AUTO-ASSIGN] Finding clusters by ODC...'); }
    const clusterMap = await this.findClustersByOdc(activeOdcValues);
    if (isDev) { logger.info('[AUTO-ASSIGN] Clusters found:', { size: clusterMap.size }); }
    
    const clusterIds = Array.from(clusterMap.values()).map((c) => c.id);
    if (isDev) { logger.info('[AUTO-ASSIGN] Cluster IDs:', { ids: [...new Set(clusterIds)].slice(0, 10) }); }

    // Debug: Show cluster mapping
    if (isDev) {
      const clusterIdToName = new Map<number, string>();
      for (const [rk, cluster] of clusterMap.entries()) {
        clusterIdToName.set(cluster.id, cluster.nama_cluster);
      }
      logger.info('[AUTO-ASSIGN] Cluster ID -> Name:', Object.fromEntries(clusterIdToName));
    }

    if (isDev) { logger.info('[AUTO-ASSIGN] Getting active teknisi for clusters...'); }
    const teknisiMap = await this.getActiveTeknisiForClusters(
      clusterIds,
      today,
    );
    if (isDev) { logger.info('[AUTO-ASSIGN] Clusters with teknisi:', { size: teknisiMap.size }); }
    
    if (isDev) {
      for (const [clusterId, teknisis] of teknisiMap.entries()) {
        logger.info('[AUTO-ASSIGN] Cluster teknisi:', { clusterId, count: teknisis.length, teknisiIds: teknisis.map(t => t.teknisi_id) });
      }
    }

    const allTeknisiIds = Array.from(teknisiMap.values())
      .flat()
      .map((t) => t.teknisi_id);
    if (isDev) { logger.info('[AUTO-ASSIGN] All teknisi IDs:', { allTeknisiIds }); }
    
    const workloadMap = await this.getWorkloadsForTeknisi(allTeknisiIds, today);
    if (isDev) { logger.info('[AUTO-ASSIGN] Workload map size:', { size: workloadMap.size }); }

    const chunks: TicketWithRk[][] = [];
    for (let i = 0; i < allTickets.length; i += CHUNK_SIZE) {
      chunks.push(allTickets.slice(i, i + CHUNK_SIZE));
    }

    const totalChunks = chunks.length;
    let totalAssigned = 0;
    let totalFailed = 0;

    if (isDev) { logger.info('[AUTO-ASSIGN] Starting to process chunks:', { totalChunks }); }

    const processWithConcurrency = async () => {
      const results: Array<{ assigned: number; failed: number }> = [];

      for (let i = 0; i < chunks.length; i += MAX_CONCURRENT) {
        const batch = chunks.slice(i, i + MAX_CONCURRENT);
        const batchPromises = batch.map((chunk, idx) =>
          this.processChunkWithRetry(
            chunk,
            clusterMap,
            teknisiMap,
            workloadMap,
            actorId,
            i + idx,
          ),
        );

        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);

        const currentChunk = Math.min(i + MAX_CONCURRENT, totalChunks);
        const assignedSum = results.reduce((sum, r) => sum + r.assigned, 0);
        const failedSum = results.reduce((sum, r) => sum + r.failed, 0);

        this.emitProgress({
          type: 'progress',
          current: currentChunk * CHUNK_SIZE,
          total,
          assigned: assignedSum,
          failed: failedSum,
          chunk: currentChunk,
          totalChunks,
        });
      }

      return results;
    };

    const chunkResults = await processWithConcurrency();
    totalAssigned = chunkResults.reduce((sum, r) => sum + r.assigned, 0);
    totalFailed = chunkResults.reduce((sum, r) => sum + r.failed, 0);

    await invalidateTicketsCache();
    broadcastTicketInvalidate('assign');

    const duration = Date.now() - startTime;
    if (isDev) {
      logger.info('[AUTO-ASSIGN] ===== RESULT =====');
      logger.info('[AUTO-ASSIGN] Total tickets processed:', { total });
      logger.info('[AUTO-ASSIGN] Successfully assigned:', { totalAssigned });
      logger.info('[AUTO-ASSIGN] Failed:', { totalFailed });
      logger.info('[AUTO-ASSIGN] Skipped:', { skipped: total - totalAssigned - totalFailed });
      logger.info('[AUTO-ASSIGN] Duration:', { duration });
      logger.info('[AUTO-ASSIGN] ===== END =====');
    }

    autoAssignLogger.batchComplete(
      total,
      totalAssigned,
      0,
      totalFailed,
      duration,
    );

    this.emitProgress({
      type: 'completed',
      current: total,
      total,
      assigned: totalAssigned,
      failed: totalFailed,
      chunk: totalChunks,
      totalChunks,
    });

    return {
      total,
      assigned: totalAssigned,
      skipped: total - totalAssigned - totalFailed,
      failed: totalFailed,
      results: [],
    };
  }
}
