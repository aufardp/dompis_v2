import { NextResponse } from 'next/server';
import { getUsersByAreaId } from '@/app/libs/services/users.service';
import { protectApi } from '@/app/libs/protectApi';

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await protectApi(['admin', 'helpdesk', 'superadmin']);

    const { id } = await context.params;

    if (!id) {
      return NextResponse.json(
        { success: false, message: 'Area ID is required' },
        { status: 400 },
      );
    }

    const areaId = Number(id);

    if (isNaN(areaId)) {
      return NextResponse.json(
        { success: false, message: 'Area ID must be a number' },
        { status: 400 },
      );
    }

    const data = await getUsersByAreaId(areaId);

    return NextResponse.json({
      success: true,
      total: data.length,
      data,
    });
  } catch (error: any) {
    console.error('GET USERS BY AREA ERROR:', error);
    return NextResponse.json(
      { success: false, message: error.message },
      { status: 500 },
    );
  }
}
