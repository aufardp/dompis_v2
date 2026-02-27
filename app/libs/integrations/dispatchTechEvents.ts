import prisma from '@/app/libs/prisma';
import { postTechEvents } from './techEvents';

const MAX_RETRY = 5;
const BASE_BACKOFF_MS = 60 * 1000; // 1 menit
const MAX_BACKOFF_MS = 15 * 60 * 1000; // 15 menit

function computeBackoff(attempt: number) {
  const ms = BASE_BACKOFF_MS * Math.pow(2, attempt - 1);
  return Math.min(ms, MAX_BACKOFF_MS);
}

export async function dispatchTechEvents() {
  const enabled = process.env.TECH_EVENTS_WEBHOOK_ENABLED === 'true';

  if (!enabled) {
    return { skipped: true };
  }

  const url = process.env.TECH_EVENTS_WEBHOOK_URL;
  const secret = process.env.TECH_EVENTS_WEBHOOK_SECRET;

  if (!url || !secret) {
    throw new Error(
      'TECH_EVENTS_WEBHOOK_URL or TECH_EVENTS_WEBHOOK_SECRET not set',
    );
  }

  const now = new Date();

  // Ambil event yang boleh dikirim
  const events = await prisma.tech_event_outbox.findMany({
    where: {
      status: 'PENDING',
      OR: [{ next_attempt_at: null }, { next_attempt_at: { lte: now } }],
    },
    orderBy: { created_at: 'asc' },
    take: 10,
  });

  if (events.length === 0) {
    return { message: 'No pending events' };
  }

  const ids = events.map((e) => e.id);

  // Mark sebagai SENDING dulu (hindari double send)
  await prisma.tech_event_outbox.updateMany({
    where: { id: { in: ids }, status: 'PENDING' },
    data: { status: 'SENDING' },
  });

  let successCount = 0;

  for (const event of events) {
    try {
      const res = await postTechEvents({ url, secret }, event.payload as any);

      if (res.ok) {
        await prisma.tech_event_outbox.update({
          where: { id: event.id },
          data: {
            status: 'SENT',
            sent_at: new Date(),
            last_error: null,
          },
        });

        successCount++;
      } else {
        throw new Error(res.text || `HTTP ${res.status}`);
      }
    } catch (err: any) {
      const newAttempt = event.attempt_count + 1;
      const isFinal = newAttempt >= MAX_RETRY;

      await prisma.tech_event_outbox.update({
        where: { id: event.id },
        data: {
          attempt_count: newAttempt,
          last_error: err?.message || String(err),
          next_attempt_at: isFinal
            ? null
            : new Date(Date.now() + computeBackoff(newAttempt)),
          status: isFinal ? 'FAILED' : 'PENDING',
        },
      });
    }
  }

  return {
    processed: events.length,
    success: successCount,
    failed: events.length - successCount,
  };
}
