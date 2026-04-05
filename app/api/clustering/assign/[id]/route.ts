export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { protectApi } from '@/app/libs/protectApi';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';
import { ClusterService } from '@/app/libs/services/cluster.service';
import prisma from '@/app/libs/prisma';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function DELETE(req: Request, { params }: RouteParams) {
  try {
    const user = await protectApi(['admin', 'superadmin']);
    const { id } = await params;
    const assignmentId = Number(id);

    const assignment = await prisma.cluster_assignment.findUnique({
      where: { id: assignmentId },
      include: {
        cluster: {
          select: { sa_id: true },
        },
      },
    });

    if (!assignment) {
      return NextResponse.json(
        {
          success: false,
          message: 'Assignment not found',
        },
        { status: 404 },
      );
    }

    // Verify admin has access
    const userSa = await prisma.user_sa.findFirst({
      where: {
        user_id: user.id_user,
        sa_id: assignment.cluster.sa_id,
      },
    });

    if (!userSa) {
      return NextResponse.json(
        {
          success: false,
          message: 'Unauthorized - Access denied',
        },
        { status: 403 },
      );
    }

    await ClusterService.removePlot(assignmentId);

    return NextResponse.json({
      success: true,
      message: 'Assignment deleted successfully',
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        success: false,
        message: getErrorMessage(error, 'Failed to delete assignment'),
      },
      { status: getErrorStatus(error, 400) },
    );
  }
}
