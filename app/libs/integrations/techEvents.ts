import crypto from 'crypto';

export type TechEventWebhookConfig = {
  url: string;
  secret: string;
};

export function signTechEventsPayload(
  secret: string,
  ts: string,
  rawBody: string,
) {
  const base = `${ts}.${rawBody}`;
  return crypto.createHmac('sha256', secret).update(base).digest('hex');
}

export function buildTechEventsWebhookUrl(
  baseUrl: string,
  ts: string,
  sig: string,
) {
  const u = new URL(baseUrl);
  u.searchParams.set('ts', ts);
  u.searchParams.set('sig', sig);
  u.searchParams.set('source', 'dompis');
  return u.toString();
}

export async function postTechEvents(
  cfg: TechEventWebhookConfig,
  body: unknown,
): Promise<{ ok: boolean; status: number; text: string }> {
  const ts = String(Date.now());
  const rawBody = JSON.stringify(body);
  const sig = signTechEventsPayload(cfg.secret, ts, rawBody);
  const url = buildTechEventsWebhookUrl(cfg.url, ts, sig);

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: rawBody,
  });

  const text = await res.text().catch(() => '');
  return { ok: res.ok, status: res.status, text };
}
