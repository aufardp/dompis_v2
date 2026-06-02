export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { protectApi } from '@/app/libs/protectApi';
import { getAllUsers, createUser } from '@/app/libs/services/users.service';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';
import { createUserSchema } from '@/app/libs/validations/users.schema';
import { enforceApiRateLimit } from '@/lib/api-rate-limit';

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
      {
        success: false,
        message: getErrorMessage(error, 'Failed to load users'),
      },
      { status: getErrorStatus(error, 500) },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    await protectApi(['admin', 'helpdesk', 'superadmin']);

    const rateLimited = await enforceApiRateLimit(req, {
      namespace: 'users-create',
      limit: 30,
      windowSeconds: 60,
    });
    if (rateLimited) return rateLimited;

    const body = await req.json();

    const parsed = createUserSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          message: parsed.error.issues.map((i) => i.message).join(', '),
        },
        { status: 400 },
      );
    }

    const userId = await createUser(parsed.data);

    return NextResponse.json({
      success: true,
      id: userId,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        success: false,
        message: getErrorMessage(error, 'Failed to create user'),
      },
      { status: getErrorStatus(error, 400) },
    );
  }
}
