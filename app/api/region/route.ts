import { NextResponse } from 'next/server';
import { protectApi } from '@/app/libs/protectApi';
import prisma from '@/app/libs/prisma';
import { logger } from '@/lib/observability/logger';
import { getErrorMessage } from '@/app/libs/apiError';

export async function GET() {
  try {
    await protectApi(['superadmin', 'admin', 'helpdesk']);
    
    const regions = await prisma.region.findMany({
      take: 50,
      where: { is_active: true },
      orderBy: { nama_region: 'asc' },
      include: {
        branches: {
          include: {
            areas: {
              select: { id_area: true, nama_area: true },
              orderBy: { nama_area: 'asc' },
            },
          },
          orderBy: { nama_branch: 'asc' },
        },
      },
    });
    
    return NextResponse.json(regions);
  } catch (error: any) {
    logger.error('Region API error:', error);
    
    if (error.status === 401 || error.status === 403) {
      return NextResponse.json({ error: getErrorMessage(error, 'Unauthorized') }, { status: error.status });
    }
    
    return NextResponse.json(
      { error: getErrorMessage(error, 'Internal server error') },
      { status: 500 }
    );
  }
}