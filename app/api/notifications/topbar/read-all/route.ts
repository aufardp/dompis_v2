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
      namespace: 'notifications-topbar-read-all',
      limit: 60,
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
          scope?: Scope | 'all';
          items?: Array<{
            scope: Scope;
            ticketCode: string;
          }>;
        }
      | null;

    const scope = body?.scope ?? 'all';
    const items = Array.isArray(body?.items) ? body.items : [];

    const normalized = items
      .map((item) => {
        const ticketCode = String(item?.ticketCode ?? '').trim();
        const itemScope = item?.scope;
        if (!ticketCode || !itemScope) return null;
        if (scope !== 'all' && itemScope !== scope) return null;
        return {
          scope: itemScope,
          ticketCode,
          notificationKey: buildNotificationKey(itemScope, ticketCode),
        };
      })
      .filter(
        (
          item,
        ): item is {
          scope: Scope;
          ticketCode: string;
          notificationKey: string;
        } => item !== null,
      );

    if (normalized.length === 0) {
      return NextResponse.json({ success: true });
    }

    await prisma.$transaction(
      normalized.map((item) =>
        prisma.topbar_notification_state.upsert({
          where: {
            user_id_scope_notification_key: {
              user_id: user.id_user,
              scope: item.scope,
              notification_key: item.notificationKey,
            },
          },
          create: {
            user_id: user.id_user,
            scope: item.scope,
            notification_key: item.notificationKey,
            ticket_code: item.ticketCode,
            bucket_label: 'Customer',
            is_read: true,
            read_at: new Date(),
          },
          update: {
            is_read: true,
            read_at: new Date(),
            ticket_code: item.ticketCode,
            bucket_label: 'Customer',
          },
        }),
      ),
    );

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        success: false,
        message: getErrorMessage(error, 'Error marking notifications as read'),
      },
      { status: getErrorStatus(error, 500) },
    );
  }
}
