export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { protectApi } from '@/app/libs/protectApi';
import { changePassword } from '@/app/libs/services/users.service';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';
import { enforceApiRateLimit } from '@/lib/api-rate-limit';

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'currentPassword is required'),
  newPassword: z.string().min(6, 'Password minimal 6 karakter'),
});

export async function PATCH(req: NextRequest) {
  try {
    const decoded = await protectApi();

    const rateLimited = await enforceApiRateLimit(req, {
      namespace: 'users-change-password',
      limit: 10,
      windowSeconds: 60,
    });
    if (rateLimited) return rateLimited;

    const body = await req.json();

    const parsed = changePasswordSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          message: parsed.error.issues.map((i) => i.message).join(', '),
        },
        { status: 400 },
      );
    }
    const { currentPassword, newPassword } = parsed.data;

    await changePassword(decoded.id_user, currentPassword, newPassword);

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        success: false,
        message: getErrorMessage(error, 'Failed to change password'),
      },
      { status: getErrorStatus(error, 400) },
    );
  }
}
