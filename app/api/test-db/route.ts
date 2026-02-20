import { NextResponse } from 'next/server';
import prisma from '@/app/libs/prisma';

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;

    return NextResponse.json({
      success: true,
      data: { result: 2 },
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { success: false, error: 'Database connection failed' },
      { status: 500 },
    );
  }
}
