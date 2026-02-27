export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/app/libs/prisma';
import { acquireLock, releaseLock } from '@/lib/ratelimit';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';
import { postTechEvents } from '@/app/libs/integrations/techEvents';
import {
  TechEventWebhookBatch,
  WebhookEvent,
} from '@/app/libs/integrations/techEventTypes';

function requireCronSecret(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  const got = req.headers.get('x-cron-secret') || '';

  if (!expected) throw new Error('CRON_SECRET is not configured');
  if (got !== expected) throw new Error('Forbidden');
}

function computeBackoffMs(attempt: number) {
  const base = 30_000;
  const max = 15 * 60_000;
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
      return NextResponse.json({ success: true, message: 'Webhook disabled' });
    }

    if (!url || !secret) {
      return NextResponse.json(
        { success: false, message: 'TECH_EVENTS_WEBHOOK_URL/SECRET not set' },
        { status: 500 },
      );
    }

    lockAcquired = await acquireLock(lockKey, ownerId, 55);

    if (!lockAcquired) {
      return NextResponse.json({
        success: true,
        message: 'Dispatcher already running',
      });
    }

    const now = new Date();
    const limit = 25;

    // STEP 1: Ambil ID saja dulu (lebih aman)
    const pendingIds = await prisma.tech_event_outbox.findMany({
      where: {
        status: 'PENDING',
        OR: [{ next_attempt_at: null }, { next_attempt_at: { lte: now } }],
      },
      orderBy: { created_at: 'asc' },
      take: limit,
      select: { id: true },
    });

    if (pendingIds.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No pending events',
      });
    }

    const ids = pendingIds.map((e) => e.id);

    // STEP 2: Mark SENDING hanya yang masih PENDING
    const updateResult = await prisma.tech_event_outbox.updateMany({
      where: { id: { in: ids }, status: 'PENDING' },
      data: { status: 'SENDING' },
    });

    if (updateResult.count === 0) {
      return NextResponse.json({
        success: true,
        message: 'Nothing to process',
      });
    }

    // STEP 3: Ambil ulang hanya yang berhasil di-mark SENDING
    const events = await prisma.tech_event_outbox.findMany({
      where: { id: { in: ids }, status: 'SENDING' },
      orderBy: { created_at: 'asc' },
    });

    const payload: TechEventWebhookBatch = {
      events: events.map((e) => e.payload as WebhookEvent),
    };

    try {
      const res = await postTechEvents({ url, secret }, payload);

      if (res.ok) {
        await prisma.tech_event_outbox.updateMany({
          where: { id: { in: events.map((e) => e.id) } },
          data: {
            status: 'SENT',
            sent_at: new Date(),
            last_error: null,
          },
        });

        return NextResponse.json({
          success: true,
          message: 'Dispatched',
          count: events.length,
        });
      }

      throw new Error(`Webhook ${res.status}: ${res.text}`);
    } catch (err: any) {
      const msg = String(err?.message || err).slice(0, 2000);

      for (const e of events) {
        const attempt = e.attempt_count + 1;
        const isFinal = attempt >= 10;

        await prisma.tech_event_outbox.update({
          where: { id: e.id },
          data: {
            status: isFinal ? 'FAILED' : 'PENDING',
            attempt_count: attempt,
            next_attempt_at: isFinal
              ? null
              : new Date(Date.now() + computeBackoffMs(attempt)),
            last_error: msg,
          },
        });
      }

      return NextResponse.json(
        {
          success: false,
          message: 'Webhook failed',
          count: events.length,
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
