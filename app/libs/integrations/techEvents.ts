import crypto from 'crypto';

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
  body: unknown,
): Promise<{ ok: boolean; status: number; text: string }> {
  const ts = String(Date.now());
  const rawBody = JSON.stringify(body);
  const sig = signPayload(cfg.secret, ts, rawBody);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(cfg.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-signature': sig,
        'x-timestamp': ts,
        'x-source': 'dompis',
      },
      body: rawBody,
      signal: controller.signal,
    });

    const text = await res.text().catch(() => '');

    return {
      ok: res.ok,
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
