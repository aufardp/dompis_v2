// app/libs/services/cluster.service.ts

import prisma from '@/app/libs/prisma';
import { ApiError } from '@/app/libs/apiError';
import type {
  Cluster,
  ClusterWithStats,
  ClusterArea,
  ClusterNode,
  ClusterAssignment,
  AssignmentWithTeknisi,
  CreateClusterInput,
  UpdateClusterInput,
  BulkImportResult,
  CopyResult,
} from '@/app/types/cluster';
import { AttendanceService } from './attendance.service';

export class ClusterService {
  // ───────────────────────────────────────────────────────────────────────────
  // Cluster CRUD
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Ambil semua cluster milik SA yang di-manage admin ini
   * Filter berdasarkan user_sa admin → sa_id → cluster
   */
  static async getAll(saId: number): Promise<ClusterWithStats[]> {
    const clusters = await prisma.cluster.findMany({
      where: { sa_id: saId },
      orderBy: [{ sort_order: 'asc' }, { nama_cluster: 'asc' }],
      include: {
        areas: {
          orderBy: { sort_order: 'asc' },
        },
        nodes: {
          where: { is_active: true },
          select: { id: true },
        },
        assignments: {
          where: {
            is_active: true,
            assigned_date: AttendanceService.getTodayDateString(),
          },
          include: {
            teknisi: {
              select: {
                id_user: true,
                nama: true,
                nik: true,
              },
            },
          },
        },
      },
    });

    return clusters.map((c: {
      id: number;
      sa_id: number;
      nama_cluster: string;
      is_active: boolean;
      sort_order: number;
      created_by: number;
      created_at: Date;
      updated_at: Date;
      nodes: Array<{ id: number }>;
      areas: Array<{ nama_area: string }>;
      assignments: Array<{ teknisi: { id_user: number; nama: string | null; nik: string | null } }>;
    }) => ({
      id: c.id,
      sa_id: c.sa_id,
      nama_cluster: c.nama_cluster,
      is_active: c.is_active,
      sort_order: c.sort_order,
      created_by: c.created_by,
      created_at: c.created_at.toISOString(),
      updated_at: c.updated_at.toISOString(),
      node_count: c.nodes.length,
      area_names: c.areas.map((a: { nama_area: string }) => a.nama_area),
      teknisi_today: c.assignments.map((a: { teknisi: { id_user: number; nama: string | null; nik: string | null } }) => ({
        id_user: a.teknisi.id_user,
        nama: a.teknisi.nama,
        nik: a.teknisi.nik,
      })),
    }));
  }

  /**
   * Ambil detail cluster dengan nodes dan areas
   */
  static async getDetail(clusterId: number): Promise<{
    cluster: Cluster;
    areas: ClusterArea[];
    nodes: ClusterNode[];
  } | null> {
    const cluster = await prisma.cluster.findUnique({
      where: { id: clusterId },
      include: {
        areas: {
          orderBy: { sort_order: 'asc' },
        },
        nodes: {
          include: {
            cluster_area: {
              select: { nama_area: true },
            },
          },
          orderBy: [{ sort_order: 'asc' }, { odc_value: 'asc' }],
        },
      },
    });

    if (!cluster) return null;

    return {
      cluster: {
        id: cluster.id,
        sa_id: cluster.sa_id,
        nama_cluster: cluster.nama_cluster,
        is_active: cluster.is_active,
        sort_order: cluster.sort_order,
        created_by: cluster.created_by,
        created_at: cluster.created_at.toISOString(),
        updated_at: cluster.updated_at.toISOString(),
      },
      areas: cluster.areas.map((a: { id: number; cluster_id: number; nama_area: string; sort_order: number }) => ({
        id: a.id,
        cluster_id: a.cluster_id,
        nama_area: a.nama_area,
        sort_order: a.sort_order,
      })),
      nodes: cluster.nodes.map((n: {
        id: number;
        cluster_id: number;
        cluster_area_id: number | null;
        odc_value: string | null;
        is_active: boolean;
        sort_order: number;
        created_at: Date;
        cluster_area?: { nama_area: string } | null;
      }) => ({
        id: n.id,
        cluster_id: n.cluster_id,
        cluster_area_id: n.cluster_area_id,
        odc_value: n.odc_value,
        is_active: n.is_active,
        sort_order: n.sort_order,
        created_at: n.created_at.toISOString(),
        area_name: n.cluster_area?.nama_area,
      })),
    };
  }

  /**
   * Buat cluster baru — cek duplikat nama dalam SA yang sama
   */
  static async create(
    data: CreateClusterInput,
    actorId: number,
  ): Promise<Cluster> {
    // Cek duplikat nama dalam SA yang sama
    const existing = await prisma.cluster.findFirst({
      where: {
        sa_id: data.sa_id,
        nama_cluster: data.nama_cluster,
      },
    });

    if (existing) {
      throw new ApiError(
        409,
        'Cluster dengan nama ini sudah ada di SA tersebut',
      );
    }

    const cluster = await prisma.cluster.create({
      data: {
        sa_id: data.sa_id,
        nama_cluster: data.nama_cluster,
        sort_order: data.sort_order ?? 0,
        created_by: actorId,
      },
    });

    return {
      id: cluster.id,
      sa_id: cluster.sa_id,
      nama_cluster: cluster.nama_cluster,
      is_active: cluster.is_active,
      sort_order: cluster.sort_order,
      created_by: cluster.created_by,
      created_at: cluster.created_at.toISOString(),
      updated_at: cluster.updated_at.toISOString(),
    };
  }

  /**
   * Update nama atau sort_order cluster — soft delete via is_active
   */
  static async update(
    clusterId: number,
    data: UpdateClusterInput,
    actorId: number,
  ): Promise<Cluster> {
    const cluster = await prisma.cluster.findUnique({
      where: { id: clusterId },
    });

    if (!cluster) {
      throw new ApiError(404, 'Cluster tidak ditemukan');
    }

    // Cek duplikat nama jika nama_cluster diubah
    if (data.nama_cluster) {
      const existing = await prisma.cluster.findFirst({
        where: {
          sa_id: cluster.sa_id,
          nama_cluster: data.nama_cluster,
          id: { not: clusterId },
        },
      });

      if (existing) {
        throw new ApiError(
          409,
          'Cluster dengan nama ini sudah ada di SA tersebut',
        );
      }
    }

    const updated = await prisma.cluster.update({
      where: { id: clusterId },
      data: {
        ...(data.nama_cluster !== undefined && {
          nama_cluster: data.nama_cluster,
        }),
        ...(data.sort_order !== undefined && { sort_order: data.sort_order }),
        ...(data.is_active !== undefined && { is_active: data.is_active }),
        updated_at: new Date(),
      },
    });

    return {
      id: updated.id,
      sa_id: updated.sa_id,
      nama_cluster: updated.nama_cluster,
      is_active: updated.is_active,
      sort_order: updated.sort_order,
      created_by: updated.created_by,
      created_at: updated.created_at.toISOString(),
      updated_at: updated.updated_at.toISOString(),
    };
  }

  /**
   * Soft delete cluster — set is_active=false, bukan DELETE
   */
  static async delete(clusterId: number): Promise<void> {
    const cluster = await prisma.cluster.findUnique({
      where: { id: clusterId },
    });

    if (!cluster) {
      throw new ApiError(404, 'Cluster tidak ditemukan');
    }

    await prisma.cluster.update({
      where: { id: clusterId },
      data: { is_active: false },
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Cluster Area Management
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Tambah area ke cluster
   */
  static async addArea(
    clusterId: number,
    namaArea: string,
    sortOrder: number = 0,
  ): Promise<ClusterArea> {
    const cluster = await prisma.cluster.findUnique({
      where: { id: clusterId },
    });

    if (!cluster) {
      throw new ApiError(404, 'Cluster tidak ditemukan');
    }

    const area = await prisma.cluster_area.create({
      data: {
        cluster_id: clusterId,
        nama_area: namaArea,
        sort_order: sortOrder,
      },
    });

    return {
      id: area.id,
      cluster_id: area.cluster_id,
      nama_area: area.nama_area,
      sort_order: area.sort_order,
    };
  }

  /**
   * Update area
   */
  static async updateArea(
    areaId: number,
    namaArea: string,
    sortOrder?: number,
  ): Promise<ClusterArea> {
    const area = await prisma.cluster_area.findUnique({
      where: { id: areaId },
    });

    if (!area) {
      throw new ApiError(404, 'Area tidak ditemukan');
    }

    const updated = await prisma.cluster_area.update({
      where: { id: areaId },
      data: {
        nama_area: namaArea,
        ...(sortOrder !== undefined && { sort_order: sortOrder }),
      },
    });

    return {
      id: updated.id,
      cluster_id: updated.cluster_id,
      nama_area: updated.nama_area,
      sort_order: updated.sort_order,
    };
  }

  /**
   * Hapus area
   */
  static async deleteArea(areaId: number): Promise<void> {
    const area = await prisma.cluster_area.findUnique({
      where: { id: areaId },
    });

    if (!area) {
      throw new ApiError(404, 'Area tidak ditemukan');
    }

    await prisma.cluster_area.delete({
      where: { id: areaId },
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Cluster Node (ODC) Management
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Tambah ODC node — cek unique constraint odc_value
   */
  static async addNode(
    clusterId: number,
    odcValue: string,
    clusterAreaId?: number,
    sortOrder: number = 0,
  ): Promise<ClusterNode> {
    const cluster = await prisma.cluster.findUnique({
      where: { id: clusterId },
    });

    if (!cluster) {
      throw new ApiError(404, 'Cluster tidak ditemukan');
    }

    // Cek apakah odc_value sudah ada di cluster lain
    const existing = await prisma.cluster_node.findUnique({
      where: { odc_value: odcValue },
    });

    if (existing) {
      throw new ApiError(
        409,
        `ODC "${odcValue}" sudah terdaftar di cluster lain`,
      );
    }

    try {
      const node = await prisma.cluster_node.create({
        data: {
          cluster_id: clusterId,
          odc_value: odcValue,
          cluster_area_id: clusterAreaId,
          sort_order: sortOrder,
        },
      });

      return {
        id: node.id,
        cluster_id: node.cluster_id,
        cluster_area_id: node.cluster_area_id,
        odc_value: node.odc_value,
        is_active: node.is_active,
        sort_order: node.sort_order,
        created_at: node.created_at.toISOString(),
      };
    } catch (error: unknown) {
      // Handle Prisma unique constraint violation (P2002)
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 'P2002'
      ) {
        throw new ApiError(
          409,
          `ODC "${odcValue}" sudah terdaftar di cluster lain`,
        );
      }
      // Re-throw other errors
      throw error;
    }
  }

  /**
   * Bulk import ODC — parse array, insert yang belum ada, skip/error yang sudah ada
   */
  static async bulkImportNodes(
    clusterId: number,
    odcValues: string[],
    clusterAreaId?: number,
  ): Promise<BulkImportResult> {
    const cluster = await prisma.cluster.findUnique({
      where: { id: clusterId },
    });

    if (!cluster) {
      throw new ApiError(404, 'Cluster tidak ditemukan');
    }

    const result: BulkImportResult = {
      inserted: 0,
      skipped: 0,
      errors: [],
    };

    // Cek ODC yang sudah ada di database (global unique)
    const existingNodes = await prisma.cluster_node.findMany({
      where: {
        odc_value: { in: odcValues },
      },
      select: { odc_value: true, cluster_id: true },
    });

    const existingMap = new Map(
      existingNodes.map((n: { odc_value: string | null; cluster_id: number }) => [n.odc_value, n.cluster_id]),
    );

    // Insert yang belum ada
    const nodesToCreate = odcValues
      .map((odc) => odc.trim())
      .filter((odc) => odc.length > 0 && !existingMap.has(odc));

    if (nodesToCreate.length > 0) {
      await prisma.cluster_node.createMany({
        data: nodesToCreate.map((odc_value) => ({
          cluster_id: clusterId,
          odc_value,
          cluster_area_id: clusterAreaId,
          sort_order: 0,
        })),
      });
      result.inserted = nodesToCreate.length;
    }

    // Catat yang sudah ada
    odcValues.forEach((odc) => {
      const trimmed = odc.trim();
      if (trimmed && existingMap.has(trimmed)) {
        result.skipped++;
        const existingClusterId = existingMap.get(trimmed);
        result.errors.push({
          odc_value: trimmed,
          reason:
            existingClusterId === clusterId
              ? 'Sudah ada di cluster ini'
              : `Sudah terdaftar di cluster lain (ID: ${existingClusterId})`,
        });
      }
    });

    return result;
  }

  /**
   * Hapus ODC node dari cluster
   */
  static async removeNode(nodeId: number): Promise<void> {
    const node = await prisma.cluster_node.findUnique({
      where: { id: nodeId },
    });

    if (!node) {
      throw new ApiError(404, 'Node tidak ditemukan');
    }

    await prisma.cluster_node.delete({
      where: { id: nodeId },
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Cluster Assignment (Plotting Teknisi)
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Ambil jadwal teknisi per cluster per tanggal
   */
  static async getAssignments(
    clusterId: number,
    date: string,
  ): Promise<AssignmentWithTeknisi[]> {
    const assignments = await prisma.cluster_assignment.findMany({
      where: {
        cluster_id: clusterId,
        assigned_date: date,
        is_active: true,
      },
      include: {
        teknisi: {
          select: {
            id_user: true,
            nama: true,
            nik: true,
          },
        },
        assigner: {
          select: {
            nama: true,
          },
        },
      },
      orderBy: { teknisi: { nama: 'asc' } },
    });

    return assignments.map((a: {
      id: number;
      cluster_id: number;
      teknisi_id: number;
      assigned_date: string;
      is_active: boolean;
      created_at: Date;
      updated_at: Date;
      assigned_by: number;
      note: string | null;
      teknisi: { id_user: number; nama: string | null; nik: string | null };
      assigner: { nama: string | null };
    }) => ({
      id: a.id,
      cluster_id: a.cluster_id,
      teknisi_id: a.teknisi_id,
      assigned_date: a.assigned_date,
      is_active: a.is_active,
      assigned_by: a.assigned_by,
      note: a.note,
      created_at: a.created_at.toISOString(),
      updated_at: a.updated_at.toISOString(),
      teknisi_nama: a.teknisi.nama,
      teknisi_nik: a.teknisi.nik,
      assigner_nama: a.assigner.nama,
    }));
  }

  /**
   * Plot teknisi ke cluster untuk tanggal tertentu
   */
  static async plotTeknisi(
    clusterId: number,
    teknisiId: number,
    assignedDate: string,
    actorId: number,
    note?: string,
  ): Promise<ClusterAssignment> {
    const cluster = await prisma.cluster.findUnique({
      where: { id: clusterId },
    });

    if (!cluster) {
      throw new ApiError(404, 'Cluster tidak ditemukan');
    }

    // Cek apakah sudah ada assignment untuk teknisi ini di tanggal ini
    const existing = await prisma.cluster_assignment.findFirst({
      where: {
        cluster_id: clusterId,
        teknisi_id: teknisiId,
        assigned_date: assignedDate,
      },
    });

    if (existing) {
      throw new ApiError(
        409,
        'Teknisi sudah diplot di cluster ini pada tanggal tersebut',
      );
    }

    const assignment = await prisma.cluster_assignment.create({
      data: {
        cluster_id: clusterId,
        teknisi_id: teknisiId,
        assigned_date: assignedDate,
        assigned_by: actorId,
        note: note,
      },
    });

    return {
      id: assignment.id,
      cluster_id: assignment.cluster_id,
      teknisi_id: assignment.teknisi_id,
      assigned_date: assignment.assigned_date,
      is_active: assignment.is_active,
      assigned_by: assignment.assigned_by,
      note: assignment.note,
      created_at: assignment.created_at.toISOString(),
      updated_at: assignment.updated_at.toISOString(),
    };
  }

  /**
   * Hapus plot teknisi
   */
  static async removePlot(assignmentId: number): Promise<void> {
    const assignment = await prisma.cluster_assignment.findUnique({
      where: { id: assignmentId },
    });

    if (!assignment) {
      throw new ApiError(404, 'Assignment tidak ditemukan');
    }

    await prisma.cluster_assignment.delete({
      where: { id: assignmentId },
    });
  }

  /**
   * Salin plotting dari tanggal sebelumnya ke tanggal target
   * Skip jika sudah ada plotting di tanggal target (tidak overwrite)
   */
  static async copyFromDate(
    fromDate: string,
    toDate: string,
    saId: number,
    actorId: number,
  ): Promise<CopyResult> {
    // Ambil semua assignment di fromDate untuk cluster milik SA ini
    const clusters = await prisma.cluster.findMany({
      where: { sa_id: saId, is_active: true },
      select: { id: true },
    });

    const clusterIds = clusters.map((c: { id: number }) => c.id);

    const sourceAssignments = await prisma.cluster_assignment.findMany({
      where: {
        cluster_id: { in: clusterIds },
        assigned_date: fromDate,
        is_active: true,
      },
    });

    const result: CopyResult = {
      copied: 0,
      skipped: 0,
    };

    for (const assignment of sourceAssignments) {
      // Cek apakah sudah ada di toDate
      const existing = await prisma.cluster_assignment.findFirst({
        where: {
          cluster_id: assignment.cluster_id,
          teknisi_id: assignment.teknisi_id,
          assigned_date: toDate,
        },
      });

      if (existing) {
        result.skipped++;
        continue;
      }

      // Buat assignment baru
      await prisma.cluster_assignment.create({
        data: {
          cluster_id: assignment.cluster_id,
          teknisi_id: assignment.teknisi_id,
          assigned_date: toDate,
          assigned_by: actorId,
          note: assignment.note,
        },
      });

      result.copied++;
    }

    return result;
  }

  /**
   * Ambil jadwal seminggu ke depan per cluster
   */
  static async getWeeklySchedule(
    saId: number,
    startDate: string,
  ): Promise<{ [date: string]: AssignmentWithTeknisi[] }> {
    const clusters = await prisma.cluster.findMany({
      where: { sa_id: saId, is_active: true },
      select: { id: true },
    });

    const clusterIds = clusters.map((c: { id: number }) => c.id);

    // Generate 7 hari dari startDate
    const dates: string[] = [];
    const start = new Date(startDate);
    for (let i = 0; i < 7; i++) {
      const date = new Date(start);
      date.setDate(start.getDate() + i);
      dates.push(date.toISOString().split('T')[0]);
    }

    const assignments = await prisma.cluster_assignment.findMany({
      where: {
        cluster_id: { in: clusterIds },
        assigned_date: { in: dates },
        is_active: true,
      },
      include: {
        teknisi: {
          select: {
            id_user: true,
            nama: true,
            nik: true,
          },
        },
        cluster: {
          select: { nama_cluster: true },
        },
      },
      orderBy: [{ assigned_date: 'asc' }, { cluster: { nama_cluster: 'asc' } }],
    });

    // Group by date
    const schedule: { [date: string]: AssignmentWithTeknisi[] } = {};
    dates.forEach((date) => {
      schedule[date] = [];
    });

    assignments.forEach((a: {
      id: number;
      cluster_id: number;
      teknisi_id: number;
      assigned_date: string;
      is_active: boolean;
      created_at: Date;
      updated_at: Date;
      assigned_by: number;
      note: string | null;
      teknisi: { id_user: number; nama: string | null; nik: string | null };
    }) => {
      schedule[a.assigned_date].push({
        id: a.id,
        cluster_id: a.cluster_id,
        teknisi_id: a.teknisi_id,
        assigned_date: a.assigned_date,
        is_active: a.is_active,
        assigned_by: a.assigned_by,
        note: a.note,
        created_at: a.created_at.toISOString(),
        updated_at: a.updated_at.toISOString(),
        teknisi_nama: a.teknisi.nama,
        teknisi_nik: a.teknisi.nik,
      });
    });

    return schedule;
  }
}
