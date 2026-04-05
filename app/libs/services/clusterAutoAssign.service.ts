// app/libs/services/clusterAutoAssign.service.ts

import prisma from '@/app/libs/prisma';
import { ActivityType } from '@prisma/client';
import { invalidateTicketsCache } from '@/lib/cache';
import { broadcastTicketInvalidate } from '@/app/libs/sseBroadcast';
import { logActivity } from '@/app/helpers/ticket.helpers';
import { fastTrackingUpdate } from '@/app/helpers/tracking.helpers';
import { AttendanceService } from '@/app/libs/services/attendance.service';
import { createTechEvent } from '@/app/libs/createTechEvent';
import { buildTechEventEvidence } from '@/app/libs/buildTechEventEvidence';
import type { AutoAssignResult } from '@/app/types/cluster';

// SYSTEM ACTOR — dipakai saat auto-assign oleh sistem (bukan manual admin)
// id_user = 0 menandakan sistem, bukan user riil
export const SYSTEM_ACTOR = { id_user: 0, role: 'admin' } as const;

export interface BatchAutoAssignResult {
  total: number;
  assigned: number;
  skipped: number;
  failed: number;
  results: AutoAssignResult[];
}

export class ClusterAutoAssignService {
  /**
   * Cari cluster berdasarkan RK_INFORMATION ticket
   * Case-insensitive exact match — checks both original and uppercase
   */
  static async findClusterByOdc(rkValue: string | null) {
    if (!rkValue?.trim()) return null;

    const trimmed = rkValue.trim();
    const upper = trimmed.toUpperCase();

    // Try exact match first, then uppercase match
    const nodes = await prisma.cluster_node.findMany({
      where: {
        is_active: true,
        odc_value: { in: [trimmed, upper] },
      },
      include: {
        cluster: true,
      },
    });

    const matched = nodes.find(
      (n) =>
        (n.odc_value.toUpperCase() === upper) && n.cluster?.is_active,
    );

    return matched?.cluster ?? null;
  }

  /**
   * Hitung workload aktif tiap teknisi hari ini
   * (jumlah tiket dengan status assigned/on_progress/pending)
   */
  static async getWorkloadMap(teknisiIds: number[]): Promise<Map<number, number>> {
    if (!teknisiIds.length) return new Map();
    const loads = await prisma.ticket.groupBy({
      by: ['teknisi_user_id'],
      where: {
        teknisi_user_id: { in: teknisiIds },
        STATUS_UPDATE: { in: ['assigned', 'on_progress', 'pending'] },
      },
      _count: { id_ticket: true },
    });
    return new Map(loads.map((l) => [l.teknisi_user_id!, l._count.id_ticket]));
  }

  /**
   * Auto-assign satu tiket ke teknisi di cluster yang tepat.
   *
   * PENTING: Method ini TIDAK menggunakan TicketWorkflowService.assignToUser()
   * karena service tersebut melakukan cek user_sa (teknisi harus terdaftar di SA)
   * yang tidak relevan untuk auto-assign berbasis cluster.
   *
   * Method ini melakukan assign langsung dengan transaction yang sama amannya.
   */
  static async autoAssign(
    ticketId: number,
    actorId: number = SYSTEM_ACTOR.id_user,
  ): Promise<AutoAssignResult> {
    try {
      // 1. Ambil data tiket
      const ticket = await prisma.ticket.findUnique({
        where: { id_ticket: ticketId },
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
        },
      });

      if (!ticket) {
        console.log(`[AutoAssign] Ticket #${ticketId}: NOT FOUND`);
        return { assigned: false, ticketId, reason: 'no_cluster' };
      }

      console.log(
        `[AutoAssign] Ticket ${ticket.INCIDENT} (#${ticketId}): RK_INFO="${ticket.RK_INFORMATION}", status="${ticket.STATUS_UPDATE}", assigned_to=${ticket.teknisi_user_id}`,
      );

      if (ticket.teknisi_user_id) {
        console.log(`[AutoAssign] SKIP ${ticket.INCIDENT}: already assigned to user #${ticket.teknisi_user_id}`);
        return { assigned: false, ticketId, reason: 'already_assigned' };
      }

      if (!ticket.RK_INFORMATION?.trim()) {
        console.log(`[AutoAssign] SKIP ${ticket.INCIDENT}: no RK_INFORMATION`);
        return { assigned: false, ticketId, reason: 'no_cluster' };
      }

      // 2. Cari cluster berdasarkan RK_INFORMATION (case-insensitive)
      const cluster = await this.findClusterByOdc(ticket.RK_INFORMATION);
      console.log(
        `[AutoAssign] Cluster match for "${ticket.RK_INFORMATION}": ${cluster ? cluster.nama_cluster : 'NOT FOUND'}`,
      );

      if (!cluster) {
        return { assigned: false, ticketId, reason: 'no_cluster' };
      }

      // 3. Ambil teknisi aktif di cluster hari ini (WIB date!)
      const today = AttendanceService.getTodayDateString();
      const assignments = await prisma.cluster_assignment.findMany({
        where: {
          cluster_id: cluster.id,
          assigned_date: today,
          is_active: true,
        },
        include: {
          teknisi: { select: { id_user: true, nama: true } },
        },
      });

      console.log(
        `[AutoAssign] Teknisi di cluster "${cluster.nama_cluster}" tanggal ${today}: ${assignments.length} orang`,
      );

      if (!assignments.length) {
        return {
          assigned: false,
          ticketId,
          reason: 'no_teknisi_today',
          clusterId: cluster.id,
          clusterName: cluster.nama_cluster,
        };
      }

      const teknisiIds = assignments.map((a) => a.teknisi_id);

      // 4. Round-robin: pilih teknisi dengan beban paling ringan
      const loadMap = await this.getWorkloadMap(teknisiIds);
      const sorted = assignments
        .map((a) => ({ ...a, load: loadMap.get(a.teknisi_id) ?? 0 }))
        .sort((a, b) => a.load - b.load);

      const chosen = sorted[0];
      const now = new Date();
      const roleId = 2; // admin role_id

      console.log(
        `[AutoAssign] Assigning ${ticket.INCIDENT} → ${chosen.teknisi.nama} (load: ${chosen.load})`,
      );

      // 5. Assign dalam transaction
      await prisma.$transaction(async (tx) => {
        await tx.ticket.update({
          where: { id_ticket: ticketId },
          data: {
            teknisi_user_id: chosen.teknisi_id,
            STATUS_UPDATE: 'assigned',
          },
        });

        await fastTrackingUpdate(tx, ticketId, chosen.teknisi_id, now);

        // Deactivate assignment history lama
        await tx.ticket_assignment_history.updateMany({
          where: { ticket_id: ticketId, is_active: true },
          data: { is_active: false, unassigned_at: now },
        });

        await tx.ticket_assignment_history.create({
          data: {
            ticket_id: ticketId,
            assigned_by: actorId || chosen.teknisi_id,
            assigned_to: chosen.teknisi_id,
            assigned_at: now,
            is_active: true,
          },
        });

        await logActivity(tx, {
          ticketId,
          userId: actorId || chosen.teknisi_id,
          roleId,
          type: ActivityType.AUTO_ASSIGN,
          description: `Auto-assigned ke ${chosen.teknisi.nama} via cluster "${cluster.nama_cluster}" (ODC: ${ticket.RK_INFORMATION})`,
        });

        // Create tech event for webhook dispatch
        const evidence = await buildTechEventEvidence(ticket.INCIDENT, tx);

        await createTechEvent(
          {
            event_type: 'TICKET_ASSIGNED',
            ticket: {
              id: ticketId,
              incident: ticket.INCIDENT,
              workzone: ticket.WORKZONE ?? '',
              service_no: ticket.SERVICE_NO ?? '',
              customer_name: ticket.CONTACT_NAME ?? '',
              owner_group: ticket.OWNER_GROUP ?? null,
              customer_type: ticket.CUSTOMER_TYPE ?? null,
            },
            status: {
              old_hasil_visit: (ticket.STATUS_UPDATE?.toUpperCase() as any) ?? 'OPEN',
              new_hasil_visit: 'ASSIGNED',
              pending_reason: null,
              evidence,
              rca: null,
              sub_rca: null,
            },
            old_technician: null,
            new_technician: {
              id_user: chosen.teknisi_id,
              nik: null,
              nama: chosen.teknisi.nama ?? null,
            },
            actor: {
              id_user: actorId || 0,
              role: 'system',
            },
            admin: {
              nama: `AUTO-ASSIGN via cluster "${cluster.nama_cluster}"`,
              action: 'ASSIGNED',
            },
          },
          tx,
        );
      });

      await invalidateTicketsCache();
      broadcastTicketInvalidate('assign');

      return {
        assigned: true,
        ticketId,
        teknisiId: chosen.teknisi_id,
        teknisiNama: chosen.teknisi.nama ?? undefined,
        clusterId: cluster.id,
        clusterName: cluster.nama_cluster,
      };
    } catch (err) {
      console.error('[AutoAssign] Error:', err);
      return { assigned: false, ticketId, reason: 'error' };
    }
  }

  /**
   * Batch auto-assign: proses semua tiket unassigned yang punya RK_INFORMATION
   * Dipanggil oleh:
   * - CRON setelah syncSpreadsheet() di server.ts
   * - Manual trigger POST /api/clustering/auto-assign (admin)
   *
   * @param saId - filter hanya tiket di SA tertentu (optional)
   */
  static async runBatch(
    saId?: number,
    actorId: number = SYSTEM_ACTOR.id_user,
  ): Promise<BatchAutoAssignResult> {
    // Ambil semua cluster_node yang aktif (untuk filter tiket yang relevan)
    const activeNodes = await prisma.cluster_node.findMany({
      where: {
        is_active: true,
        ...(saId ? { cluster: { sa_id: saId } } : {}),
      },
      select: { odc_value: true },
    });

    const activeOdcValues = activeNodes.map((n) => n.odc_value);

    console.log(
      `[AutoAssign Batch] Active ODC values: ${activeOdcValues.length} nodes`,
    );

    if (!activeOdcValues.length) {
      return { total: 0, assigned: 0, skipped: 0, failed: 0, results: [] };
    }

    // Cari tiket unassigned yang RK_INFORMATION-nya ada di cluster yang aktif
    const tickets = await prisma.ticket.findMany({
      where: {
        teknisi_user_id: null,
        RK_INFORMATION: { in: activeOdcValues },
        OR: [
          { STATUS_UPDATE: null },
          { STATUS_UPDATE: 'open' },
          { STATUS_UPDATE: 'assigned' },
        ],
      },
      select: { id_ticket: true, INCIDENT: true, RK_INFORMATION: true },
    });

    console.log(
      `[AutoAssign Batch] Found ${tickets.length} unassigned tickets with matching ODC values`,
    );

    // Process sequentially to avoid transaction deadlocks on ticket_tracking upsert
    // Parallel transactions on the same ticket_tracking rows cause MySQL P2034 errors
    const results: AutoAssignResult[] = [];
    let assigned = 0;
    let skipped = 0;
    let failed = 0;

    for (const ticket of tickets) {
      try {
        const result = await this.autoAssign(ticket.id_ticket, actorId);
        results.push(result);
        if (result.assigned) {
          assigned++;
        } else if (result.reason === 'already_assigned') {
          skipped++;
        } else {
          failed++;
        }
      } catch (err) {
        console.error(
          `[AutoAssign Batch] Error on ticket ${ticket.id_ticket} (${ticket.INCIDENT}):`,
          err,
        );
        failed++;
        results.push({
          assigned: false,
          ticketId: ticket.id_ticket,
          reason: 'error',
        });
      }
    }

    console.log(
      `[AutoAssign Batch] Done: ${assigned} assigned, ${skipped} skipped, ${failed} failed out of ${tickets.length} tickets`,
    );

    if (failed > 0) {
      const noTeknisiTickets = results.filter(
        (r) => r.reason === 'no_teknisi_today',
      );

      if (noTeknisiTickets.length > 0) {
        console.warn(
          `[AutoAssign] ${noTeknisiTickets.length} tiket TIDAK ter-assign: tidak ada teknisi hari ini.`,
        );
      }
    }

    return {
      total: tickets.length,
      assigned,
      skipped,
      failed,
      results,
    };
  }
}
