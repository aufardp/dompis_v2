import { NextResponse } from 'next/server';
import { protectApi } from '@/app/libs/protectApi';
import prisma from '@/app/libs/prisma';

export async function GET() {
  try {
    await protectApi(['superadmin', 'admin', 'helpdesk']);
    
    const regions = await prisma.region.findMany({
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
    console.error('Region API error:', error);
    
    if (error.status === 401 || error.status === 403) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}