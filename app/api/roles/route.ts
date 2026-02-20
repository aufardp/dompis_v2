import { NextResponse } from 'next/server';
import prisma from '@/app/libs/prisma';

export async function GET() {
  try {
    const roles = await prisma.roles.findMany();

    const options = roles.map((role) => ({
      id: role.id_role,
      label: role.name,
      key: role.key,
      created_at: role.created_at,
      updated_at: role.updated_at,
    }));

    return NextResponse.json({
      success: true,
      data: options,
    });
  } catch (error: any) {
    console.error('Roles fetch error:', error);
    return NextResponse.json(
      { success: false, message: error.message },
      { status: 500 },
    );
  }
}
