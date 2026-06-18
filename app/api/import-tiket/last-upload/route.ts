export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import prisma from '@/app/libs/prisma';
import { protectApi } from '@/app/libs/protectApi';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';

export async function GET() {
  try {
    await protectApi(['admin', 'superadmin', 'super_admin']);

    const latestProjection = await prisma.projection_request.findFirst({
      where: { source: 'import-tiket', syncBatchId: { not: null } },
      orderBy: { createdAt: 'desc' },
      select: {
        syncBatchId: true,
        createdAt: true,
      },
    });

    if (!latestProjection?.syncBatchId) {
      return NextResponse.json({
        success: true,
        data: null,
      });
    }

    const rowCount = await prisma.ticket_raw.count({
      where: { syncBatchId: latestProjection.syncBatchId },
    });

    return NextResponse.json({
      success: true,
      data: {
        import_batch: latestProjection.syncBatchId,
        imported_at: latestProjection.createdAt,
        row_count: rowCount,
      },
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        success: false,
        message: getErrorMessage(error, 'Gagal mengambil data upload terakhir'),
      },
      { status: getErrorStatus(error, 500) },
    );
  }
}
