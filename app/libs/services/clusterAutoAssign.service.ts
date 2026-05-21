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
import { todayWibDate } from '@/lib/timezone';

export const SYSTEM_ACTOR = { id_user: 0, role: 'admin' } as const;

const CHUNK_SIZE = 50;
const isDev = process.env.NODE_ENV !== 'production';
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
        ticketTracking: {
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

    console.log('[DEBUG-GATEC] Input clusterIds:', clusterIds);
    console.log('[DEBUG-GATEC] Input today:', today);

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

    console.log('[DEBUG-GATEC] cluster_assignment found:', assignments.length);
    console.log('[DEBUG-GATEC] Assignments:', assignments.map(a => ({ 
      cluster_id: a.cluster_id, 
      teknisi_id: a.teknisi_id,
      assigned_date: a.assigned_date 
    })));

    const teknisiIds = [...new Set(assignments.map((a) => a.teknisi_id))];
    console.log('[DEBUG-GATEC] Unique teknisi IDs:', teknisiIds);

    const checkedInTeknisi = await this.getCheckedInTeknisiIds(teknisiIds, today);
    console.log('[DEBUG-GATEC] Checked in teknisi:', Array.from(checkedInTeknisi));

    const workloadMap = await this.getWorkloadsForTeknisi(teknisiIds, today);
    console.log('[DEBUG-GATEC] Workload map:', Array.from(workloadMap.entries()));

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
      console.log(`[AUTO-ASSIGN] Ticket ${ticket.id_ticket} (RK: ${rkValue}) -> Cluster ${cluster.id} (${cluster.nama_cluster}) -> Teknisi:`, teknisiList?.length || 0);
      
      if (!teknisiList?.length) {
        console.log(`[AUTO-ASSIGN] SKIP: No teknisi in cluster ${cluster.id} for date ${new Date().toISOString().split('T')[0]}`);
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
      console.log(`[AUTO-ASSIGN] Round-robin: chosen teknisi ${chosen.teknisi_id} (${chosen.nama}), current batch load: ${workloadMap.get(chosen.teknisi_id) ?? 0}`);

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
      console.log(`[AUTO-ASSIGN] ASSIGNED: Ticket ${ticket.id_ticket} to Teknisi ${chosen.teknisi_id} (load: ${chosen.load})`);
    }

    for (const a of assignments) {
      try {
        await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
          await tx.ticket.update({
            where: { id_ticket: a.ticketId },
            data: {
              teknisi_user_id: a.teknisiId,
              status_update: 'assigned',
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

    const dispatchPromises = assignments.map(async (a) => {
      const ticket = ticketMap.get(a.ticketId);
      if (!ticket) return;

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
    });

    Promise.allSettled(dispatchPromises);
  }

  static async runBatchV2(
    saIds?: number[],
    actorId: number = SYSTEM_ACTOR.id_user,
  ): Promise<BatchAutoAssignResult> {
    const startTime = Date.now();
    if (isDev) {
      console.log('[AUTO-ASSIGN] ===== START =====');
      console.log('[AUTO-ASSIGN] saIds:', saIds);
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
        console.log('[AUTO-ASSIGN] Filtering by workzones:', workzoneFilter);
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

    if (isDev) { console.log('[AUTO-ASSIGN] Active ODC values count:', activeOdcValues.length); }
    if (isDev && activeOdcValues.length > 0) {
      console.log('[AUTO-ASSIGN] Active ODC values sample:', activeOdcValues.slice(0, 5));
    }

    if (!activeOdcValues.length) {
      if (isDev) { console.log('[AUTO-ASSIGN] No active ODC values found - returning 0'); }
      autoAssignLogger.batchStart(0);
      autoAssignLogger.batchComplete(0, 0, 0, 0, 0);
      return { total: 0, assigned: 0, skipped: 0, failed: 0, results: [] };
    }

    const today = AttendanceService.getTodayDateString();
    if (isDev) { console.log('[AUTO-ASSIGN] Today date:', today); }

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
    });

    if (isDev) {
      console.log('[AUTO-ASSIGN] Found tickets to process:', allTickets.length);
      if (allTickets.length > 0) {
        console.log('[AUTO-ASSIGN] Sample tickets:', allTickets.slice(0, 3).map(t => ({
          id: t.id_ticket,
          incident: t.incident,
          rk: t.rk_information,
          status: t.status_update
        })));
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
      if (isDev) { console.log('[AUTO-ASSIGN] No tickets found - returning 0'); }
      autoAssignLogger.batchComplete(0, 0, 0, 0, Date.now() - startTime);
      return { total: 0, assigned: 0, skipped: 0, failed: 0, results: [] };
    }

    if (isDev) { console.log('[AUTO-ASSIGN] Finding clusters by ODC...'); }
    const clusterMap = await this.findClustersByOdc(activeOdcValues);
    if (isDev) { console.log('[AUTO-ASSIGN] Clusters found:', clusterMap.size); }
    
    const clusterIds = Array.from(clusterMap.values()).map((c) => c.id);
    if (isDev) { console.log('[AUTO-ASSIGN] Cluster IDs (unique):', [...new Set(clusterIds)].slice(0, 10)); }

    // Debug: Show cluster mapping
    if (isDev) {
      const clusterIdToName = new Map<number, string>();
      for (const [rk, cluster] of clusterMap.entries()) {
        clusterIdToName.set(cluster.id, cluster.nama_cluster);
      }
      console.log('[AUTO-ASSIGN] Cluster ID -> Name:', Object.fromEntries(clusterIdToName));
    }

    if (isDev) { console.log('[AUTO-ASSIGN] Getting active teknisi for clusters...'); }
    const teknisiMap = await this.getActiveTeknisiForClusters(
      clusterIds,
      today,
    );
    if (isDev) { console.log('[AUTO-ASSIGN] Clusters with teknisi:', teknisiMap.size); }
    
    if (isDev) {
      for (const [clusterId, teknisis] of teknisiMap.entries()) {
        console.log(`[AUTO-ASSIGN] Cluster ${clusterId} has ${teknisis.length} teknisi:`, teknisis.map(t => t.teknisi_id));
      }
    }

    const allTeknisiIds = Array.from(teknisiMap.values())
      .flat()
      .map((t) => t.teknisi_id);
    if (isDev) { console.log('[AUTO-ASSIGN] All teknisi IDs:', allTeknisiIds); }
    
    const workloadMap = await this.getWorkloadsForTeknisi(allTeknisiIds, today);
    if (isDev) { console.log('[AUTO-ASSIGN] Workload map size:', workloadMap.size); }

    const chunks: TicketWithRk[][] = [];
    for (let i = 0; i < allTickets.length; i += CHUNK_SIZE) {
      chunks.push(allTickets.slice(i, i + CHUNK_SIZE));
    }

    const totalChunks = chunks.length;
    let totalAssigned = 0;
    let totalFailed = 0;

    if (isDev) { console.log('[AUTO-ASSIGN] Starting to process', totalChunks, 'chunks...'); }

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
    if (isDev) {
      console.log('[AUTO-ASSIGN] ===== RESULT =====');
      console.log('[AUTO-ASSIGN] Total tickets processed:', total);
      console.log('[AUTO-ASSIGN] Successfully assigned:', totalAssigned);
      console.log('[AUTO-ASSIGN] Failed:', totalFailed);
      console.log('[AUTO-ASSIGN] Skipped:', total - totalAssigned - totalFailed);
      console.log('[AUTO-ASSIGN] Duration:', duration, 'ms');
      console.log('[AUTO-ASSIGN] ===== END =====');
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
