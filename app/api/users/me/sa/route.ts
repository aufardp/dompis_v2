import { NextResponse } from 'next/server';
import prisma from '@/app/libs/prisma';
import { protectApi } from '@/app/libs/protectApi';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';
import { getOrSetCache } from '@/lib/cache';
import { logger } from '@/lib/observability/logger';

const USER_SA_CACHE_TTL = 300;

export async function GET() {
  try {
    const decoded = await protectApi();
    const cacheKey = `users:me:sa:${decoded.id_user}`;
    const serviceAreas = await getOrSetCache(cacheKey, async () => {
      const userSa = await prisma.user_sa.findMany({
        where: { user_id: decoded.id_user },
        take: 100,
        include: {
          service_area: {
            select: {
              id_sa: true,
              nama_sa: true,
            },
          },
        },
      });

      return userSa
        .filter((us) => us.service_area)
        .map((us) => ({
          id_sa: us.service_area!.id_sa,
          nama_sa: us.service_area!.nama_sa,
        }));
    }, USER_SA_CACHE_TTL);

    return NextResponse.json({
      success: true,
      data: serviceAreas,
    });
  } catch (error: unknown) {
    logger.error('GET /users/me/sa error:', error);
    return NextResponse.json(
      {
        success: false,
        message: getErrorMessage(error, 'Error fetching service areas'),
      },
      { status: getErrorStatus(error, 500) },
    );
  }
}
