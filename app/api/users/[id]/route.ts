export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { protectApi } from '@/app/libs/protectApi';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';
import {
  getUserById,
  updateUser,
  deleteUser,
  canAssignRole,
} from '@/app/libs/services/users.service';
import { enforceApiRateLimit } from '@/lib/api-rate-limit';
import { updateUserSchema } from '@/app/libs/validations/users.schema';
import { normalizeRoleKey } from '@/app/libs/roles';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await protectApi(['admin', 'helpdesk', 'superadmin']);

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
    if (
      targetUser &&
      targetUser.role_id === 1 &&
      normalizeRoleKey(actor.role) !== 'superadmin'
    ) {
      return NextResponse.json(
        { success: false, message: 'Hanya superadmin yang dapat mengubah user ber-role superadmin' },
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
    if (
      targetUser &&
      targetUser.role_id === 1 &&
      normalizeRoleKey(actor.role) !== 'superadmin'
    ) {
      return NextResponse.json(
        { success: false, message: 'Hanya superadmin yang dapat menghapus user ber-role superadmin' },
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
