export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { protectApi } from '@/app/libs/protectApi';
import { getAllUsers, createUser } from '@/app/libs/services/users.service';

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return 'Unexpected error';
}

export async function GET(req: NextRequest) {
  try {
    await protectApi(['admin', 'helpdesk', 'superadmin']);

    const { searchParams } = new URL(req.url);

    const roleIdParam = searchParams.get('role_id');
    const role_id = roleIdParam ? Number(roleIdParam) : undefined;
    const search = searchParams.get('search') || undefined;

    if (roleIdParam && (role_id === undefined || Number.isNaN(role_id))) {
      return NextResponse.json(
        { success: false, message: 'role_id must be a number' },
        { status: 400 },
      );
    }

    const users = await getAllUsers({ role_id, search });

    return NextResponse.json({ success: true, data: users });
  } catch (error: unknown) {
    return NextResponse.json(
      { success: false, message: getErrorMessage(error) },
      { status: 401 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    await protectApi(['admin', 'helpdesk', 'superadmin']);

    const body = await req.json();

    const userId = await createUser(body);

    return NextResponse.json({
      success: true,
      id: userId,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { success: false, message: getErrorMessage(error) },
      { status: 400 },
    );
  }
}
