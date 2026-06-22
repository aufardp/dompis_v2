import { NextResponse } from 'next/server';
import prisma from '@/app/libs/prisma';
import { protectApi } from '@/app/libs/protectApi';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';

export async function GET() {
  try {
    await protectApi(['admin', 'helpdesk', 'superadmin', 'super_admin']);

    const roles = await prisma.roles.findMany({
      select: {
        id_role: true,
        name: true,
        key: true,
      },
      orderBy: { name: 'asc' },
      take: 100,
    });

    const options = roles.map((role) => ({
      id: role.id_role,
      label: role.name,
      key: role.key,
    }));

    return NextResponse.json(
      { success: true, data: options },
      { headers: { 'Cache-Control': 'private, max-age=300, stale-while-revalidate=600' } },
    );
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: getErrorMessage(error, 'Server Error') },
      { status: getErrorStatus(error, 500) },
    );
  }
}
