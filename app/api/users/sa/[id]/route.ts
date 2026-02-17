import { NextRequest, NextResponse } from 'next/server';
import { getUsersBySaId } from '@/app/libs/services/users.service';
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
        { success: false, message: 'SA ID is required' },
        { status: 400 },
      );
    }

    const saId = Number(id);

    if (isNaN(saId)) {
      return NextResponse.json(
        { success: false, message: 'SA ID must be a number' },
        { status: 400 },
      );
    }

    const data = await getUsersBySaId(saId, search);

    return NextResponse.json({
      success: true,
      total: data.length,
      data,
    });
  } catch (error: unknown) {
    console.error('GET USERS BY SA ERROR:', error);
    const message = error instanceof Error ? error.message : 'Unexpected error';
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
