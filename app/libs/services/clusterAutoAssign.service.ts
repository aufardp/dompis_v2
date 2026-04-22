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

export const SYSTEM_ACTOR = { id_user: 0, role: 'admin' } as const;

const CHUNK_SIZE = 50;
const MAX_CONCURRENT = 5;
const MAX_RETRIES = 3;

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
  INCIDENT: string;
  RK_INFORMATION: string | null;
  STATUS_UPDATE: string | null;
  teknisi_user_id: number | null;
  WORKZONE: string | null;
  SERVICE_NO: string | null;
  CONTACT_NAME: string | null;
  OWNER_GROUP: string | null;
  CUSTOMER_TYPE: string | null;
  JAM_EXPIRED: string | null;
}

interface TicketForTechEvent {
  id_ticket: number;
  INCIDENT: string;
  WORKZONE: string | null;
  SERVICE_NO: string | null;
  CONTACT_NAME: string | null;
  OWNER_GROUP: string | null;
  CUSTOMER_TYPE: string | null;
  STATUS_UPDATE: string | null;
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
  ): Promise<Map<number, number>> {
    if (!teknisiIds.length) return new Map();

    const loads = await prisma.ticket.groupBy({
      by: ['teknisi_user_id'],
      where: {
        teknisi_user_id: { in: teknisiIds },
        STATUS_UPDATE: { in: ['assigned', 'on_progress', 'pending'] },
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

    const teknisiIds = [...new Set(assignments.map((a) => a.teknisi_id))];
    const checkedInTeknisi = await this.getCheckedInTeknisiIds(teknisiIds, today);
    const workloadMap = await this.getWorkloadsForTeknisi(teknisiIds);

    const MAX_LOAD_PER_TEKNISI = 15;
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

    for (const ticket of tickets) {
      if (ticket.teknisi_user_id) {
        autoAssignLogger.ticketSkipped(
          ticket.id_ticket,
          ticket.INCIDENT,
          'already_assigned',
        );
        continue;
      }

      const rkValue = ticket.RK_INFORMATION?.trim();
      if (!rkValue) {
        autoAssignLogger.ticketSkipped(
          ticket.id_ticket,
          ticket.INCIDENT,
          'no_rk_information',
        );
        continue;
      }

      const cluster = clusterMap.get(rkValue.toUpperCase());
      if (!cluster) {
        autoAssignLogger.ticketSkipped(
          ticket.id_ticket,
          ticket.INCIDENT,
          `no_cluster_matched_rk_${rkValue}`,
        );
        continue;
      }

      const teknisiList = teknisiMap.get(cluster.id);
      if (!teknisiList?.length) {
        autoAssignLogger.ticketSkipped(
          ticket.id_ticket,
          ticket.INCIDENT,
          `no_teknisi_available_cluster_${cluster.nama_cluster}`,
        );
        continue;
      }

      const sorted = [...teknisiList].sort((a, b) => a.load - b.load);
      const chosen = sorted[0];

      assignments.push({
        ticketId: ticket.id_ticket,
        incident: ticket.INCIDENT,
        teknisiId: chosen.teknisi_id,
        teknisiNama: chosen.nama,
        teknisiNik: chosen.nik,
        clusterName: cluster.nama_cluster,
        oldStatus: ticket.STATUS_UPDATE,
      });

      workloadMap.set(
        chosen.teknisi_id,
        (workloadMap.get(chosen.teknisi_id) ?? 0) + 1,
      );
    }

    for (const a of assignments) {
      try {
        await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
          await tx.ticket.update({
            where: { id_ticket: a.ticketId },
            data: {
              teknisi_user_id: a.teknisiId,
              STATUS_UPDATE: 'assigned',
            },
          });

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
        });

        assigned++;

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

    if (assignments.length > 0) {
      this.dispatchTechEventsAsync(assignments, actorId);
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
        INCIDENT: true,
        WORKZONE: true,
        SERVICE_NO: true,
        CONTACT_NAME: true,
        OWNER_GROUP: true,
        CUSTOMER_TYPE: true,
        STATUS_UPDATE: true,
      },
    });

    const ticketMap = new Map(
      (ticketData as unknown as TicketForTechEvent[]).map(
        (t: TicketForTechEvent) => [t.id_ticket, t],
      ),
    );

    const dispatchPromises = assignments.map(async (a) => {
      const ticket = ticketMap.get(a.ticketId);
      if (!ticket) return;

      try {
        const evidence = await buildTechEventEvidence(ticket.INCIDENT);

        await createTechEvent({
          event_type: 'TICKET_ASSIGNED',
          ticket: {
            id: a.ticketId,
            incident: ticket.INCIDENT,
            workzone: ticket.WORKZONE ?? '',
            service_no: ticket.SERVICE_NO ?? '',
            customer_name: ticket.CONTACT_NAME ?? '',
            owner_group: ticket.OWNER_GROUP ?? null,
            customer_type: ticket.CUSTOMER_TYPE ?? null,
          },
          status: {
            old_hasil_visit:
              (ticket.STATUS_UPDATE?.toUpperCase() as any) ?? 'OPEN',
            new_hasil_visit: 'ASSIGNED',
            pending_reason: null,
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
    });

    Promise.allSettled(dispatchPromises);
  }

  static async runBatchV2(
    saId?: number,
    actorId: number = SYSTEM_ACTOR.id_user,
  ): Promise<BatchAutoAssignResult> {
    const startTime = Date.now();

    const activeNodes = await prisma.cluster_node.findMany({
      where: {
        is_active: true,
        ...(saId ? { cluster: { sa_id: saId } } : {}),
      },
      select: { odc_value: true },
    });

    const activeOdcValues = activeNodes.map(
      (n: { odc_value: string }) => n.odc_value,
    );

    if (!activeOdcValues.length) {
      autoAssignLogger.batchStart(0);
      autoAssignLogger.batchComplete(0, 0, 0, 0, 0);
      return { total: 0, assigned: 0, skipped: 0, failed: 0, results: [] };
    }

    const allTickets: TicketWithRk[] = await prisma.ticket.findMany({
      where: {
        teknisi_user_id: null,
        RK_INFORMATION: { in: activeOdcValues },
        OR: [
          { STATUS_UPDATE: null },
          { STATUS_UPDATE: 'open' },
          { STATUS_UPDATE: 'assigned' },
        ],
      },
      select: {
        id_ticket: true,
        INCIDENT: true,
        RK_INFORMATION: true,
        STATUS_UPDATE: true,
        teknisi_user_id: true,
        WORKZONE: true,
        SERVICE_NO: true,
        CONTACT_NAME: true,
        OWNER_GROUP: true,
        CUSTOMER_TYPE: true,
        JAM_EXPIRED: true,
      },
      orderBy: { JAM_EXPIRED: 'asc' },
    });

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
      autoAssignLogger.batchComplete(0, 0, 0, 0, Date.now() - startTime);
      return { total: 0, assigned: 0, skipped: 0, failed: 0, results: [] };
    }

    const clusterMap = await this.findClustersByOdc(activeOdcValues);
    const clusterIds = Array.from(clusterMap.values()).map((c) => c.id);
    const today = AttendanceService.getTodayDateString();
    const teknisiMap = await this.getActiveTeknisiForClusters(
      clusterIds,
      today,
    );

    const allTeknisiIds = Array.from(teknisiMap.values())
      .flat()
      .map((t) => t.teknisi_id);
    const workloadMap = await this.getWorkloadsForTeknisi(allTeknisiIds);

    const chunks: TicketWithRk[][] = [];
    for (let i = 0; i < allTickets.length; i += CHUNK_SIZE) {
      chunks.push(allTickets.slice(i, i + CHUNK_SIZE));
    }

    const totalChunks = chunks.length;
    let totalAssigned = 0;
    let totalFailed = 0;

    const processWithConcurrency = async () => {
      const results: Array<{ assigned: number; failed: number }> = [];

      for (let i = 0; i < chunks.length; i += MAX_CONCURRENT) {
        const batch = chunks.slice(i, i + MAX_CONCURRENT);
        const batchPromises = batch.map((chunk, idx) =>
          this.processChunkWithRetry(
            chunk,
            clusterMap,
            teknisiMap,
            new Map(workloadMap),
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
