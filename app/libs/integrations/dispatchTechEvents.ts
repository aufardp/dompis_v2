import prisma from '@/app/libs/prisma';
import { postTechEvents } from './techEvents';

const MAX_RETRY = 5;

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

  let successCount = 0;

  for (const event of events) {
    const res = await postTechEvents({ url, secret }, event.payload);

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
      const newAttempt = event.attempt_count + 1;

      await prisma.tech_event_outbox.update({
        where: { id: event.id },
        data: {
          attempt_count: newAttempt,
          last_error: res.text,
          next_attempt_at:
            newAttempt >= MAX_RETRY ? null : new Date(Date.now() + 60 * 1000), // retry 1 menit
          status: newAttempt >= MAX_RETRY ? 'FAILED' : 'PENDING',
        },
      });
    }
  }

  return {
    processed: events.length,
    success: successCount,
  };
}
