import { logger } from '@/lib/observability/logger';
import { isRedisReady, redis } from '@/lib/redis';

const DEBOUNCE_TTL_SECONDS = 900; // 15 menit
const DEBOUNCE_PREFIX = 'alert:debounce:';

function getAlertKey(type: string, key: string): string {
  return `${DEBOUNCE_PREFIX}${type}:${key}`;
}

async function isDebounced(type: string, key: string): Promise<boolean> {
  if (!isRedisReady()) return false;
  const exists = await redis.get(getAlertKey(type, key)).catch(() => null);
  return exists !== null;
}

async function markDebounced(type: string, key: string): Promise<void> {
  if (!isRedisReady()) return;
  await redis.setex(getAlertKey(type, key), DEBOUNCE_TTL_SECONDS, '1').catch((error) => { logger.warn('[Notifier] Send failed:', { error: String(error) }); });
}

function formatTime(): string {
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).format(new Date());
}

interface AlertPayload {
  type: string;
  key: string;
  title: string;
  message: string;
  severity: 'critical' | 'warning' | 'info';
  fields?: Record<string, unknown>;
}

async function sendTelegram(payload: AlertPayload): Promise<void> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!botToken || !chatId) return;

  const emoji = payload.severity === 'critical' ? '🚨' : payload.severity === 'warning' ? '⚠️' : 'ℹ️';
  const text = [
    `${emoji} *${payload.title}*`,
    '',
    payload.message,
    '',
    `_Time: ${formatTime()}_`,
    ...(payload.fields
      ? ['', ...Object.entries(payload.fields).map(([k, v]) => `• ${k}: \`${v}\``)]
      : []),
  ].join('\n');

  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'Markdown',
      disable_web_page_preview: true,
    }),
    signal: AbortSignal.timeout(10_000),
  }).catch((error) => { logger.warn('[Notifier] Send failed:', { error: String(error) }); });
}

async function sendSlack(payload: AlertPayload): Promise<void> {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) return;

  const emoji = payload.severity === 'critical' ? ':red_circle:' : payload.severity === 'warning' ? ':warning:' : ':information_source:';
  const fields = payload.fields
    ? Object.entries(payload.fields).map(([title, value]) => ({
        type: 'mrkdwn',
        text: `*${title}:* ${value}`,
      }))
    : [];

  await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: `${emoji} *${payload.title}*`,
      attachments: [{
        color: payload.severity === 'critical' ? '#dc3545' : payload.severity === 'warning' ? '#ffc107' : '#17a2b8',
        blocks: [
          { type: 'section', text: { type: 'mrkdwn', text: `*${payload.title}*\n${payload.message}` } },
          ...(fields.length > 0 ? [{ type: 'section', fields }] : []),
          { type: 'context', elements: [{ type: 'mrkdwn', text: `🕐 ${formatTime()}` }] },
        ],
      }],
    }),
    signal: AbortSignal.timeout(10_000),
  }).catch((error) => { logger.warn('[Notifier] Send failed:', { error: String(error) }); });
}

export async function sendAlert(payload: AlertPayload): Promise<void> {
  if (await isDebounced(payload.type, payload.key)) return;
  await markDebounced(payload.type, payload.key);

  await Promise.allSettled([
    sendTelegram(payload),
    sendSlack(payload),
  ]);
}

export async function sendCriticalAlert(
  title: string,
  message: string,
  fields?: Record<string, unknown>,
): Promise<void> {
  await sendAlert({
    type: 'critical',
    key: title,
    title,
    message,
    severity: 'critical',
    fields,
  });
}

export async function sendWarningAlert(
  title: string,
  message: string,
  fields?: Record<string, unknown>,
): Promise<void> {
  await sendAlert({
    type: 'warning',
    key: title,
    title,
    message,
    severity: 'warning',
    fields,
  });
}
