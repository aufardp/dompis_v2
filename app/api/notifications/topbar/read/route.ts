import { NextResponse } from 'next/server';
import prisma from '@/app/libs/prisma';
import { protectApi } from '@/app/libs/protectApi';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';
import { enforceApiRateLimit } from '@/lib/api-rate-limit';

export const dynamic = 'force-dynamic';

type Scope = 'inbox' | 'diamond';

function buildNotificationKey(scope: Scope, ticketCode: string) {
  return `${scope}:${ticketCode}`;
}

export async function POST(request: Request) {
  try {
    const rateLimited = await enforceApiRateLimit(request, {
      namespace: 'notifications-topbar-read',
      limit: 120,
      windowSeconds: 60,
    });
    if (rateLimited) return rateLimited;

    const user = await protectApi([
      'admin',
      'superadmin',
      'super_admin',
      'helpdesk',
    ]);

    const body = (await request.json().catch(() => null)) as
      | {
          scope?: Scope;
          ticketCode?: string;
        }
      | null;

    const scope = body?.scope;
    const ticketCode = String(body?.ticketCode ?? '').trim();
    if (!scope || !ticketCode) {
      return NextResponse.json(
        { success: false, message: 'scope and ticketCode are required' },
        { status: 400 },
      );
    }

    const notificationKey = buildNotificationKey(scope, ticketCode);

    await prisma.topbar_notification_state.upsert({
      where: {
        user_id_scope_notification_key: {
          user_id: user.id_user,
          scope,
          notification_key: notificationKey,
        },
      },
      create: {
        user_id: user.id_user,
        scope,
        notification_key: notificationKey,
        ticket_code: ticketCode,
        bucket_label: 'Customer',
        is_read: true,
        read_at: new Date(),
      },
      update: {
        is_read: true,
        read_at: new Date(),
        ticket_code: ticketCode,
        bucket_label: 'Customer',
      },
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        success: false,
        message: getErrorMessage(error, 'Error marking notification as read'),
      },
      { status: getErrorStatus(error, 500) },
    );
  }
}
