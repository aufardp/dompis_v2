export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { protectApi } from '@/app/libs/protectApi';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';
import {
  getUserById,
  updateUser,
  deleteUser,
  canAssignRole,
  getBranchScope,
  targetUserInScope,
  validateUserInScope,
} from '@/app/libs/services/users.service';
import { enforceApiRateLimit } from '@/lib/api-rate-limit';
import { updateUserSchema } from '@/app/libs/validations/users.schema';
import { normalizeRoleKey } from '@/app/libs/roles';

function canManageTarget(actorRole: string, targetRoleId: number | null | undefined): boolean {
  if (targetRoleId === 1 || targetRoleId === 6) {
    return normalizeRoleKey(actorRole) === 'superadmin';
  }
  return true;
}

function protectedUserMessage(targetRoleId: number | null | undefined): string {
  if (targetRoleId === 1) {
    return 'Hanya superadmin yang dapat mengubah user ber-role superadmin';
  }
  return 'Hanya superadmin yang dapat mengubah user ber-role admin branch';
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await protectApi(['admin', 'helpdesk', 'superadmin']);

    const { id: idParam } = await params;
    const id = Number(idParam);
    if (Number.isNaN(id)) {
      return NextResponse.json(
        { success: false, message: 'Invalid user id' },
        { status: 400 },
      );
    }

    const user = await getUserById(id);

    if (!user) {
      return NextResponse.json(
        { success: false, message: 'User tidak ditemukan' },
        { status: 404 },
      );
    }

    const scope = await getBranchScope(actor);
    if (!targetUserInScope(scope, user.area_id)) {
      return NextResponse.json(
        { success: false, message: 'User berada di luar branch Anda' },
        { status: 403 },
      );
    }

    return NextResponse.json({ success: true, data: user });
  } catch (error: unknown) {
    return NextResponse.json(
      { success: false, message: getErrorMessage(error, 'Unexpected error') },
      { status: getErrorStatus(error, 500) },
    );
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await protectApi(['admin', 'helpdesk', 'superadmin']);

    const rateLimited = await enforceApiRateLimit(req, {
      namespace: 'users-update',
      limit: 30,
      windowSeconds: 60,
    });
    if (rateLimited) return rateLimited;

    const { id: idParam } = await params;
    const id = Number(idParam);
    if (Number.isNaN(id)) {
      return NextResponse.json(
        { success: false, message: 'Invalid user id' },
        { status: 400 },
      );
    }

    const body = await req.json();

    const targetUser = await getUserById(id);
    if (targetUser && !canManageTarget(actor.role, targetUser.role_id)) {
      return NextResponse.json(
        {
          success: false,
          message: protectedUserMessage(targetUser.role_id),
        },
        { status: 403 },
      );
    }

    if (
      body.role_id !== undefined &&
      !canAssignRole(actor.role, Number(body.role_id))
    ) {
      const msg =
        Number(body.role_id) === 1
          ? 'Hanya superadmin yang dapat mengubah role menjadi superadmin'
          : Number(body.role_id) === 6
            ? 'Role admin branch hanya dapat diatur oleh superadmin'
            : 'Role senior leader hanya dapat diatur oleh superadmin / admin branch';
      return NextResponse.json(
        { success: false, message: msg },
        { status: 403 },
      );
    }

    const parsed = updateUserSchema.passthrough().safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          message: parsed.error.issues.map((i) => i.message).join(', '),
        },
        { status: 400 },
      );
    }

    const scope = await getBranchScope(actor);
    if (!targetUserInScope(scope, targetUser?.area_id)) {
      return NextResponse.json(
        { success: false, message: 'User berada di luar branch Anda' },
        { status: 403 },
      );
    }

    const scopeError = await validateUserInScope(scope, parsed.data);
    if (scopeError) {
      return NextResponse.json(
        { success: false, message: scopeError },
        { status: 403 },
      );
    }

    await updateUser(id, parsed.data);

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    return NextResponse.json(
      { success: false, message: getErrorMessage(error, 'Unexpected error') },
      { status: getErrorStatus(error, 400) },
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await protectApi(['admin', 'helpdesk', 'superadmin']);

    const rateLimited = await enforceApiRateLimit(req, {
      namespace: 'users-update',
      limit: 30,
      windowSeconds: 60,
    });
    if (rateLimited) return rateLimited;

    const { id: idParam } = await params;
    const id = Number(idParam);
    if (Number.isNaN(id)) {
      return NextResponse.json(
        { success: false, message: 'Invalid user id' },
        { status: 400 },
      );
    }

    const targetUser = await getUserById(id);
    if (targetUser && !canManageTarget(actor.role, targetUser.role_id)) {
      return NextResponse.json(
        {
          success: false,
          message: protectedUserMessage(targetUser.role_id),
        },
        { status: 403 },
      );
    }

    const scope = await getBranchScope(actor);
    if (!targetUserInScope(scope, targetUser?.area_id)) {
      return NextResponse.json(
        { success: false, message: 'User berada di luar branch Anda' },
        { status: 403 },
      );
    }

    await deleteUser(id);

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    return NextResponse.json(
      { success: false, message: getErrorMessage(error, 'Unexpected error') },
      { status: getErrorStatus(error, 400) },
    );
  }
}
