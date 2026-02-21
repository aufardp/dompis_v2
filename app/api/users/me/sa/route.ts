import { NextResponse } from 'next/server';
import prisma from '@/app/libs/prisma';
import { protectApi } from '@/app/libs/protectApi';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';

export async function GET() {
  try {
    const decoded = await protectApi();

    const userSa = await prisma.user_sa.findMany({
      where: { user_id: decoded.id_user },
      include: {
        service_area: {
          select: {
            id_sa: true,
            nama_sa: true,
          },
        },
      },
    });

    const serviceAreas = userSa
      .filter((us) => us.service_area)
      .map((us) => ({
        id_sa: us.service_area!.id_sa,
        nama_sa: us.service_area!.nama_sa,
      }));

    return NextResponse.json({
      success: true,
      data: serviceAreas,
    });
  } catch (error: unknown) {
    console.error('GET /users/me/sa error:', error);
    return NextResponse.json(
      {
        success: false,
        message: getErrorMessage(error, 'Error fetching service areas'),
      },
      { status: getErrorStatus(error, 500) },
    );
  }
}
