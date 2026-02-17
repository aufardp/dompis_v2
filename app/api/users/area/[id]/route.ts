import { NextRequest, NextResponse } from 'next/server';
import { getUsersByAreaId } from '@/app/libs/services/users.service';
import { protectApi } from '@/app/libs/protectApi';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await protectApi(['admin', 'helpdesk', 'superadmin']);

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || undefined;

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

    const data = await getUsersByAreaId(areaId, search);

    return NextResponse.json({
      success: true,
      total: data.length,
      data,
    });
  } catch (error: unknown) {
    console.error('GET USERS BY AREA ERROR:', error);
    const message = error instanceof Error ? error.message : 'Unexpected error';
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
