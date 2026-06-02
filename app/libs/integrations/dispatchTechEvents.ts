import prisma from '@/app/libs/prisma';
import { postTechEvents } from './techEvents';
import { TechEventWebhookBatch, TechEventPayload } from './techEventTypes';
import { logger } from '@/lib/observability/logger';

const MAX_RETRY = 5;
const BASE_BACKOFF_MS = 60 * 1000;
const MAX_BACKOFF_MS = 15 * 60 * 1000;
const DEFAULT_BATCH_SIZE = 10;
const MAX_BATCH_SIZE = 100;

function computeBackoff(attempt: number) {
  const ms = BASE_BACKOFF_MS * Math.pow(2, attempt - 1);
  return Math.min(ms, MAX_BACKOFF_MS);
}

async function withP1017Retry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err: any) {
    if (err?.code === 'P1017') {
      logger.warn('[TechEvents] P1017 error, retrying in 500ms...');
      await new Promise((r) => setTimeout(r, 500));
      return await fn();
    }
    throw err;
  }
}

function getBatchSize(): number {
  const configured = Number(process.env.TECH_EVENTS_DISPATCH_BATCH_SIZE);
  if (!Number.isFinite(configured) || configured <= 0) return DEFAULT_BATCH_SIZE;
  return Math.min(MAX_BATCH_SIZE, Math.floor(configured));
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
  const batchSize = getBatchSize();

  // Reset SENDING yang stuck lebih dari 5 menit
  // (Artinya proses crash sebelum update status ke SENT/FAILED/PENDING)
  const stuckCutoff = new Date(now.getTime() - 5 * 60 * 1000);
  await withP1017Retry(() =>
    prisma.tech_event_outbox.updateMany({
      where: {
        status: 'SENDING',
        updated_at: { lte: stuckCutoff },
      },
      data: {
        status: 'PENDING',
        last_error: 'Reset from stuck SENDING state',
        next_attempt_at: null,
      },
    }),
  );

  const events = await withP1017Retry(() =>
    prisma.tech_event_outbox.findMany({
      where: {
        status: 'PENDING',
        event_type: {
          notIn: [
            'TICKET_RAW_CREATED',
            'TICKET_RAW_UPDATED',
            'TICKET_RAW_STATUS_CHANGED',
            'TICKET_RAW_DELETED',
            'INGESTION_COMPLETE',
            'INGESTION_FAILED',
          ],
        },
        OR: [{ next_attempt_at: null }, { next_attempt_at: { lte: now } }],
      },
      orderBy: { created_at: 'asc' },
      take: batchSize,
    }),
  );

  if (events.length === 0) {
    return { message: 'No pending events' };
  }

  const ids = events.map((e: { id: number }) => e.id);

  // Mark sebagai SENDING dulu (hindari double send)
  await withP1017Retry(() =>
    prisma.tech_event_outbox.updateMany({
      where: { id: { in: ids }, status: 'PENDING' },
      data: { status: 'SENDING' },
    }),
  );

  let successCount = 0;

  try {
    const batch: TechEventWebhookBatch = {
      events: events.map((e) => e.payload as TechEventPayload),
    };

    const res = await postTechEvents({ url, secret }, batch);

    if (res.ok) {
      await withP1017Retry(() =>
        prisma.tech_event_outbox.updateMany({
          where: { id: { in: ids }, status: 'SENDING' },
          data: {
            status: 'SENT',
            sent_at: new Date(),
            last_error: null,
          },
        }),
      );
      successCount = events.length;
    } else {
      throw new Error(res.text || `HTTP ${res.status}`);
    }

    return {
      processed: events.length,
      success: successCount,
      failed: events.length - successCount,
    };
  } catch (err: any) {
    const batchErrorMsg = err?.message || String(err);
    const maxAttempt = Math.max(...events.map((e) => e.attempt_count));
    const newAttempt = maxAttempt + 1;
    await withP1017Retry(() =>
      prisma.tech_event_outbox.updateMany({
        where: { id: { in: ids } },
        data: {
          attempt_count: { increment: 1 },
          last_error: batchErrorMsg,
          status: newAttempt >= MAX_RETRY ? 'FAILED' : 'PENDING',
          next_attempt_at:
            newAttempt >= MAX_RETRY
              ? null
              : new Date(Date.now() + computeBackoff(newAttempt)),
        },
      }),
    );

    const dispatchError = new Error(
      `Failed to dispatch ${events.length} tech event(s): ${batchErrorMsg}`,
    ) as Error & {
      processed?: number;
      success?: number;
      failed?: number;
    };
    dispatchError.processed = events.length;
    dispatchError.success = 0;
    dispatchError.failed = events.length;
    throw dispatchError;
  }
}
