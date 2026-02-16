import { NextResponse } from 'next/server';
import { getUsersByRoleId } from '@/app/libs/services/users.service';
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
        { success: false, message: 'Role ID is required' },
        { status: 400 },
      );
    }

    const roleId = Number(id);

    if (isNaN(roleId)) {
      return NextResponse.json(
        { success: false, message: 'Role ID must be a number' },
        { status: 400 },
      );
    }

    const data = await getUsersByRoleId(roleId);

    return NextResponse.json({
      success: true,
      total: data.length,
      data,
    });
  } catch (error: any) {
    console.error('GET USERS BY ROLE ERROR:', error);
    return NextResponse.json(
      { success: false, message: error.message },
      { status: 500 },
    );
  }
}
