export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { protectApi } from '@/app/libs/protectApi';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';
import { getUserById, updateUser, getBranchScope, targetUserInScope } from '@/app/libs/services/users.service';
import { enforceApiRateLimit } from '@/lib/api-rate-limit';
import { normalizeRoleKey } from '@/app/libs/roles';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await protectApi(['admin', 'helpdesk', 'superadmin']);

    const rateLimited = await enforceApiRateLimit(req, {
      namespace: 'users-reset-password',
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
    if (!targetUser) {
      return NextResponse.json(
        { success: false, message: 'User tidak ditemukan' },
        { status: 404 },
      );
    }

    if (
      targetUser.role_id === 1 &&
      normalizeRoleKey(actor.role) !== 'superadmin'
    ) {
      return NextResponse.json(
        { success: false, message: 'Hanya superadmin yang dapat mereset password user ber-role superadmin' },
        { status: 403 },
      );
    }

    if (
      targetUser.role_id === 6 &&
      normalizeRoleKey(actor.role) !== 'superadmin'
    ) {
      return NextResponse.json(
        { success: false, message: 'Hanya superadmin yang dapat mereset password user ber-role admin branch' },
        { status: 403 },
      );
    }

    const scope = await getBranchScope(actor);
    if (!targetUserInScope(scope, targetUser.area_id)) {
      return NextResponse.json(
        { success: false, message: 'User berada di luar branch Anda' },
        { status: 403 },
      );
    }

    const username = targetUser.username;
    if (!username) {
      return NextResponse.json(
        { success: false, message: 'User tidak memiliki username' },
        { status: 400 },
      );
    }

    await updateUser(id, { password: username });

    return NextResponse.json({
      success: true,
      message: 'Password berhasil direset ke default (sama dengan username)',
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { success: false, message: getErrorMessage(error, 'Unexpected error') },
      { status: getErrorStatus(error, 400) },
    );
  }
}
