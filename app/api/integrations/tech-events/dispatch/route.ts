export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/app/libs/prisma';
import { acquireLock, releaseLock } from '@/lib/ratelimit';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';
import { postTechEvents } from '@/app/libs/integrations/techEvents';

function requireCronSecret(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  const got = req.headers.get('x-cron-secret') || '';

  if (!expected) {
    throw new Error('CRON_SECRET is not configured');
  }

  if (got !== expected) {
    throw new Error('Forbidden');
  }
}

function computeBackoffMs(attempt: number) {
  const base = 30_000; // 30 detik
  const max = 15 * 60_000; // 15 menit
  const ms = base * Math.pow(2, Math.max(0, attempt - 1));
  return Math.min(max, ms);
}

export async function POST(req: NextRequest) {
  const lockKey = 'tech-events-dispatch-lock';
  const ownerId = `dispatch-${Date.now()}-${Math.random()}`;
  let lockAcquired = false;

  try {
    requireCronSecret(req);

    const enabled = process.env.TECH_EVENTS_WEBHOOK_ENABLED === 'true';
    const url = process.env.TECH_EVENTS_WEBHOOK_URL;
    const secret = process.env.TECH_EVENTS_WEBHOOK_SECRET;

    if (!enabled) {
      return NextResponse.json({
        success: true,
        message: 'Webhook disabled',
      });
    }

    if (!url || !secret) {
      return NextResponse.json(
        {
          success: false,
          message: 'TECH_EVENTS_WEBHOOK_URL/SECRET is not configured',
        },
        { status: 500 },
      );
    }

    lockAcquired = await acquireLock(lockKey, ownerId, 55);

    if (!lockAcquired) {
      return NextResponse.json(
        {
          success: true,
          message: 'Dispatcher is already running',
        },
        { status: 200 },
      );
    }

    const now = new Date();
    const limit = 25;

    const events = await prisma.tech_event_outbox.findMany({
      where: {
        status: 'PENDING',
        OR: [{ next_attempt_at: null }, { next_attempt_at: { lte: now } }],
      },
      orderBy: { created_at: 'asc' },
      take: limit,
    });

    if (events.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No pending events',
      });
    }

    const ids = events.map((e) => e.id);

    // Mark as SENDING
    await prisma.tech_event_outbox.updateMany({
      where: { id: { in: ids }, status: 'PENDING' },
      data: { status: 'SENDING' },
    });

    const payload = {
      events: events.map((e) => e.payload),
    };

    const failBatch = async (errorText: string) => {
      const msg = errorText.slice(0, 2000);

      for (const e of events) {
        const attempt = e.attempt_count + 1;
        const next = new Date(Date.now() + computeBackoffMs(attempt));

        const finalStatus = attempt >= 10 ? 'FAILED' : 'PENDING';

        await prisma.tech_event_outbox.update({
          where: { id: e.id },
          data: {
            status: finalStatus,
            attempt_count: attempt,
            next_attempt_at: finalStatus === 'FAILED' ? null : next,
            last_error: msg,
          },
        });
      }
    };

    try {
      const res = await postTechEvents({ url, secret }, payload);

      if (res.ok) {
        await prisma.tech_event_outbox.updateMany({
          where: { id: { in: ids } },
          data: {
            status: 'SENT',
            sent_at: new Date(),
            last_error: null,
          },
        });

        return NextResponse.json({
          success: true,
          message: 'Dispatched',
          count: ids.length,
          webhook: { status: res.status },
        });
      }

      await failBatch(`Webhook error ${res.status}: ${res.text}`);

      return NextResponse.json(
        {
          success: false,
          message: 'Webhook failed',
          count: ids.length,
        },
        { status: 502 },
      );
    } catch (e: any) {
      await failBatch(`Webhook request failed: ${String(e?.message || e)}`);

      return NextResponse.json(
        {
          success: false,
          message: 'Webhook request failed',
          count: ids.length,
        },
        { status: 502 },
      );
    }
  } catch (error: unknown) {
    const message = getErrorMessage(error, 'Dispatch failed');

    const status = message === 'Forbidden' ? 403 : getErrorStatus(error, 500);

    return NextResponse.json({ success: false, message }, { status });
  } finally {
    if (lockAcquired) {
      await releaseLock(lockKey, ownerId);
    }
  }
}
