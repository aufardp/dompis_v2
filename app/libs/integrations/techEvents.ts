import crypto from 'crypto';
import { TechEventWebhookBatch } from './techEventTypes';

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

  // ✅ Gunakan URL object biar aman
  const url = new URL(cfg.url);
  url.searchParams.set('timestamp', ts);
  url.searchParams.set('signature', signature);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const res = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-source': 'dompis',
        'x-event-id': body.events[0]?.event_id ?? '',  // idempotency untuk GAS
        'x-idempotency-key': body.events[0]?.event_id ?? '',  // alias untuk GAS
      },
      body: rawBody,
      signal: controller.signal,
    });

    const text = await res.text().catch(() => '');

    // GAS Web App kadang return 302 redirect atau 200 dengan body "Success"
    // Anggap sukses jika status 2xx ATAU 302 ATAU body mengandung "success"
    const isSuccess =
      res.ok ||
      res.status === 302 ||
      text.toLowerCase().includes('"success"') ||
      text.toLowerCase().includes('success');

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
  } finally {
    clearTimeout(timeout);
  }
}
