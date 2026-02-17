export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { protectApi } from '@/app/libs/protectApi';
import { changePassword } from '@/app/libs/services/users.service';

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return 'Unexpected error';
}

export async function PATCH(req: NextRequest) {
  try {
    const decoded = await protectApi();

    const body = await req.json();

    const currentPassword = body?.currentPassword;
    const newPassword = body?.newPassword;

    if (
      typeof currentPassword !== 'string' ||
      typeof newPassword !== 'string'
    ) {
      return NextResponse.json(
        {
          success: false,
          message: 'currentPassword and newPassword are required',
        },
        { status: 400 },
      );
    }

    await changePassword(decoded.id_user, currentPassword, newPassword);

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    return NextResponse.json(
      { success: false, message: getErrorMessage(error) },
      { status: 400 },
    );
  }
}
