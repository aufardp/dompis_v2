// app/api/dev/dispatch-tech-events/route.ts
// ⚠️ DEVELOPMENT ONLY — Hapus file ini sebelum production

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import prisma from '@/app/libs/prisma';
import { postTechEvents } from '@/app/libs/integrations/techEvents';

function computeBackoffMs(attempt: number) {
  const base = 30_000;
  const max = 15 * 60_000;
  const ms = base * Math.pow(2, Math.max(0, attempt - 1));
  return Math.min(max, ms);
}

export async function POST() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      { success: false, message: 'Not available in production' },
      { status: 403 },
    );
  }

  const url = process.env.TECH_EVENTS_WEBHOOK_URL;
  const secret = process.env.TECH_EVENTS_WEBHOOK_SECRET ?? '';

  if (!url) {
    return NextResponse.json(
      { success: false, message: 'TECH_EVENTS_WEBHOOK_URL not configured' },
      { status: 500 },
    );
  }

  const now = new Date();

  const events = await prisma.tech_event_outbox.findMany({
    where: {
      status: 'PENDING',
      OR: [{ next_attempt_at: null }, { next_attempt_at: { lte: now } }],
    },
    orderBy: { created_at: 'asc' },
    take: 25,
  });

  if (events.length === 0) {
    return NextResponse.json({ success: true, message: 'No pending events' });
  }

  const ids = events.map((e) => e.id);

  await prisma.tech_event_outbox.updateMany({
    where: { id: { in: ids }, status: 'PENDING' },
    data: { status: 'SENDING' },
  });

  const payload = { events: events.map((e) => e.payload) as any };

  const res = await postTechEvents({ url, secret }, payload);

  if (res.ok) {
    await prisma.tech_event_outbox.updateMany({
      where: { id: { in: ids } },
      data: { status: 'SENT', sent_at: new Date(), last_error: null },
    });

    return NextResponse.json({
      success: true,
      message: 'Dispatched',
      count: ids.length,
      webhook: { status: res.status, body: res.text },
    });
  }

  const msg = `Webhook error ${res.status}: ${res.text}`.slice(0, 2000);

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

  return NextResponse.json(
    {
      success: false,
      message: 'Webhook failed',
      count: ids.length,
      webhook: { status: res.status, body: res.text },
    },
    { status: 502 },
  );
}
