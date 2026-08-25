import { NextRequest, NextResponse } from 'next/server';
import { protectApi } from '@/app/libs/protectApi';
import { prisma } from '@/app/libs/prisma';
import { logger } from '@/lib/observability/logger';

export async function GET() {
  try {
    await protectApi(['superadmin']);
    const targets = await prisma.kpiTarget.findMany({
      orderBy: { metricKey: 'asc' },
    });
    return NextResponse.json({
      success: true,
      data: targets.map((t) => ({
        metricKey: t.metricKey,
        targetValue: Number(t.targetValue),
        updatedAt: t.updatedAt,
      })),
    });
  } catch (error: unknown) {
    logger.error('KPI targets GET error:', error);
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 },
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const decoded = await protectApi(['superadmin']);
    const body = await request.json().catch(() => null);
    const metricKey = String(body?.metricKey ?? '').trim();
    const targetValue = Number(body?.targetValue);

    if (!metricKey || !Number.isFinite(targetValue)) {
      return NextResponse.json(
        { success: false, message: 'metricKey dan targetValue wajib diisi.' },
        { status: 400 },
      );
    }

    const updated = await prisma.kpiTarget.upsert({
      where: { metricKey },
      update: { targetValue, updatedBy: decoded.id_user },
      create: { metricKey, targetValue, updatedBy: decoded.id_user },
    });

    return NextResponse.json({
      success: true,
      data: {
        metricKey: updated.metricKey,
        targetValue: Number(updated.targetValue),
        updatedAt: updated.updatedAt,
      },
    });
  } catch (error: unknown) {
    logger.error('KPI targets PUT error:', error);
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 },
    );
  }
}
