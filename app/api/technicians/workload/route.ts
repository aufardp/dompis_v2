import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/app/libs/prisma';
import { protectApi } from '@/app/libs/protectApi';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';
import { logger } from '@/lib/observability/logger';
import { resolveBranchScope } from '@/app/helpers/ticket.helpers';
import {
  computeTechnicianWorkload,
  markRecommendedTechnician,
  summarizeWorkload,
} from '@/app/libs/services/technicianWorkload.service';

export const dynamic = 'force-dynamic';

const TECHNICIAN_ROLE_ID = 4;

export async function GET(request: NextRequest) {
  try {
    const decoded = await protectApi(['admin', 'helpdesk', 'superadmin']);
    const currentUserId = decoded.id_user;

    const { searchParams } = new URL(request.url);
    const workzone = searchParams.get('workzone') || undefined;
    const branchParam =
      searchParams.get('branchId') ?? searchParams.get('branch');

    const branchSas = await resolveBranchScope(
      decoded.role,
      currentUserId,
      branchParam,
    );

    if (branchSas && branchSas.length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          generatedAt: new Date().toISOString(),
          summary: { total_teknisi: 0, available: 0, overloaded: 0 },
          technicians: [],
        },
      });
    }

    // Resolve workzones this user can see
    const userSas = await prisma.user_sa.findMany({
      take: 500,
      where: { user_id: currentUserId },
      include: { service_area: { select: { id_sa: true, nama_sa: true } } },
    });

    const branchSaNames = branchSas ? new Set(branchSas) : null;

    const saIds = new Set<number>();
    const workzoneNames = new Set<string>();

    for (const usa of userSas) {
      const namaSa = usa.service_area?.nama_sa;
      if (branchSaNames && (!namaSa || !branchSaNames.has(namaSa))) continue;
      if (usa.sa_id !== null && usa.sa_id !== undefined) saIds.add(usa.sa_id);
      if (namaSa) workzoneNames.add(namaSa);
    }

    if (saIds.size === 0) {
      return NextResponse.json({
        success: true,
        data: {
          generatedAt: new Date().toISOString(),
          summary: { total_teknisi: 0, available: 0, overloaded: 0 },
          technicians: [],
        },
      });
    }

    // Direct workzone filter: only show SAs matching the requested workzone
    if (workzone && workzone.trim()) {
      const matchSaIds = new Set<number>();
      for (const usa of userSas) {
        if (usa.service_area?.nama_sa === workzone && usa.sa_id !== null) {
          matchSaIds.add(usa.sa_id);
        }
      }
      // If the user explicitly narrows to a workzone, respect it strictly
      for (const id of [...saIds]) {
        if (!matchSaIds.has(id)) saIds.delete(id);
      }
    }

    if (saIds.size === 0) {
      return NextResponse.json({
        success: true,
        data: {
          generatedAt: new Date().toISOString(),
          summary: { total_teknisi: 0, available: 0, overloaded: 0 },
          technicians: [],
        },
      });
    }

    // Find technicians linked to those SAs
    const techRows = await prisma.user_sa.findMany({
      take: 1000,
      where: { sa_id: { in: [...saIds] } },
      select: { user_id: true },
    });

    const techIds = [
      ...new Set(
        techRows
          .map((r) => r.user_id)
          .filter((id): id is number => id !== null && id !== undefined),
      ),
    ];

    if (techIds.length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          generatedAt: new Date().toISOString(),
          summary: { total_teknisi: 0, available: 0, overloaded: 0 },
          technicians: [],
        },
      });
    }

    const [technicians, workload] = await Promise.all([
      prisma.users.findMany({
        take: 1000,
        where: { id_user: { in: techIds }, role_id: TECHNICIAN_ROLE_ID },
        select: { id_user: true, nama: true, nik: true },
        orderBy: { nama: 'asc' },
      }),
      computeTechnicianWorkload(techIds),
    ]);

    markRecommendedTechnician(workload);

    const summary = summarizeWorkload(workload);

    const rows = technicians.map((tech) => {
      const load = workload.get(tech.id_user) ?? {
        active_tickets: 0,
        assigned_count: 0,
        on_progress_count: 0,
        pending_count: 0,
        avg_ttr_hours: null,
        overloaded: false,
        load_score: 0,
        recommended: false,
      };
      return {
        id_user: tech.id_user,
        nama: tech.nama,
        nik: tech.nik,
        ...load,
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        generatedAt: new Date().toISOString(),
        summary,
        technicians: rows,
      },
    });
  } catch (error: unknown) {
    logger.error('GET /technicians/workload error:', error);
    return NextResponse.json(
      { success: false, message: getErrorMessage(error, 'Error loading workload') },
      { status: getErrorStatus(error, 500) },
    );
  }
}