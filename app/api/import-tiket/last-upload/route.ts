export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import prisma from '@/app/libs/prisma';
import { protectApi } from '@/app/libs/protectApi';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';

export async function GET() {
  try {
    await protectApi(['admin', 'superadmin', 'super_admin']);

    let latestProjection: {
      syncBatchId: string | null;
      createdAt: Date;
      uploaded_by?: string | null;
    } | null = null;

    try {
      const rows = await prisma.$queryRaw<
        Array<{
          syncBatchId: string | null;
          createdAt: Date;
          uploaded_by: string | null;
        }>
      >(Prisma.sql`
        SELECT
          sync_batch_id AS syncBatchId,
          created_at AS createdAt,
          uploaded_by
        FROM projection_request
        WHERE source = 'import-tiket'
          AND sync_batch_id IS NOT NULL
        ORDER BY created_at DESC
        LIMIT 1
      `);
      latestProjection = rows[0] ?? null;
    } catch {
      const rows = await prisma.$queryRaw<
        Array<{
          syncBatchId: string | null;
          createdAt: Date;
        }>
      >(Prisma.sql`
        SELECT
          sync_batch_id AS syncBatchId,
          created_at AS createdAt
        FROM projection_request
        WHERE source = 'import-tiket'
          AND sync_batch_id IS NOT NULL
        ORDER BY created_at DESC
        LIMIT 1
      `);
      latestProjection = rows[0] ?? null;
    }

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
        uploaded_by: latestProjection.uploaded_by,
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
