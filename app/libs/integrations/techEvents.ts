import crypto from 'crypto';
import { TechEventWebhookBatch } from './techEventTypes';
import { logger } from '@/lib/observability/logger';

export type TechEventWebhookConfig = {
  url: string;
  secret: string;
};

function signPayload(secret: string, ts: string, rawBody: string) {
  return crypto
    .createHmac('sha256', secret)
    .update(`${ts}.${rawBody}`)
    .digest('hex');
}

export async function postTechEvents(
  cfg: TechEventWebhookConfig,
  body: TechEventWebhookBatch,
): Promise<{ ok: boolean; status: number; text: string }> {
  const ts = Date.now().toString();
  const rawBody = JSON.stringify(body);
  const signature = signPayload(cfg.secret, ts, rawBody);

  // Batch-level idempotency key: hash of all event IDs in the batch
  const idempotencyKey = body.events.length > 0
    ? crypto.createHash('sha256').update(body.events.map(e => e.event_id).join(',')).digest('hex')
    : crypto.randomUUID();

  const url = new URL(cfg.url);
  url.searchParams.set('timestamp', ts);
  url.searchParams.set('signature', signature);

  logger.info('[TechEvents] Posting webhook:', {
    url: url.origin + url.pathname,
    eventCount: body.events.length,
    secretPrefix: cfg.secret.slice(0, 3) + '***',
    ts,
    idempotencyKey: idempotencyKey.slice(0, 12) + '...',
  });

  try {
    const res = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-source': 'dompis',
        'x-cron-secret': cfg.secret,
        'x-event-id': idempotencyKey,
        'x-idempotency-key': idempotencyKey,
      },
      body: rawBody,
      signal: AbortSignal.timeout(60_000),
    });

    const text = await res.text().catch(() => '');

    const isSuccess =
      res.ok ||
      res.status === 302 ||
      text.toLowerCase().includes('"success"') ||
      text.toLowerCase().includes('success');

    logger.info('[TechEvents] Webhook response:', {
      status: res.status,
      ok: isSuccess,
      bodyPreview: text.slice(0, 200),
    });

    return {
      ok: isSuccess,
      status: res.status,
      text,
    };
  } catch (err) {
    return {
      ok: false,
      status: 500,
      text: err instanceof Error ? err.message : String(err),
    };
  }
}
