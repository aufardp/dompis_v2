export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';
import { protectApi } from '@/app/libs/protectApi';
import { prisma } from '@/app/libs/prisma';
import { enforceApiRateLimit } from '@/lib/api-rate-limit';
import { sendAlert } from '@/lib/observability/notifier';

export async function POST(request: NextRequest) {
  try {
    const user = await protectApi(['superadmin', 'super_admin', 'admin']);

    const rateLimited = await enforceApiRateLimit(request, {
      namespace: 'test-alert',
      limit: 5,
      windowSeconds: 60,
    });
    if (rateLimited) return rateLimited;

    const telegramConfigured = Boolean(
      process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID,
    );
    const slackConfigured = Boolean(process.env.SLACK_WEBHOOK_URL);

    if (!telegramConfigured && !slackConfigured) {
      return NextResponse.json({
        success: true,
        delivered: false,
        telegramConfigured,
        slackConfigured,
        message:
          'Belum ada kanal alert yang dikonfigurasi. Set TELEGRAM_BOT_TOKEN & TELEGRAM_CHAT_ID (atau SLACK_WEBHOOK_URL) di .env lalu ulangi.',
      });
    }

    let actorName: string | null = null;
    try {
      const actor = await prisma.users.findUnique({
        where: { id_user: user.id_user },
        select: { nama: true },
      });
      actorName = actor?.nama ?? null;
    } catch {
      actorName = null;
    }

    await sendAlert({
      type: 'warning',
      key: `test-alert:${Date.now()}`,
      title: 'Test Alert Infrastructure Monitor',
      message:
        'Pesan uji coba dari dashboard. Jika Anda menerima ini, pipeline alert Telegram/Slack berfungsi dengan benar.',
      severity: 'warning',
      bypassDebounce: true,
      fields: {
        'Dipicu oleh': actorName || `User #${user.id_user}`,
        'Role': user?.role || '-',
      },
    });

    return NextResponse.json({
      success: true,
      delivered: true,
      telegramConfigured,
      slackConfigured,
      message: 'Alert uji terkirim.',
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        success: false,
        message: getErrorMessage(error, 'Test alert failed'),
      },
      { status: getErrorStatus(error, 500) },
    );
  }
}
