// ==========================================
// QOSMIC Metabase Bridge — low-level HTTP client
// ==========================================
// Replaces direct MySQL access (EXTERNAL_DB_*) to `nossa` / `nossa_closed`.
// Enforces the bridge's documented contract:
//   - Bearer token auth
//   - 20 req/menit PER API KEY (shared across ALL processes: web, workers, scripts)
//   - limit maks 1000 baris/hit
//   - offset maks 5000 (paging dalam SATU query/window)
//   - nossa_closed WAJIB date_from/date_to (maks 31 hari) kecuali filter `incident`
//
// Karena limit 20/menit berlaku per API key (bukan per proses), rate limiting
// TIDAK BOLEH in-memory per-worker — harus lewat Redis (cross-process), pakai
// checkRateLimit yang sudah ada di lib/ratelimit.ts.

import { checkRateLimit } from '@/lib/ratelimit';
import { logger } from '@/lib/observability/logger';

const BASE_URL = process.env.QOSMIC_BRIDGE_BASE_URL; // e.g. https://qosmic.solusee.id/api/metabase-bridge
const TOKEN = process.env.QOSMIC_BRIDGE_TOKEN;
const RATE_LIMIT_PER_MIN = parsePositiveIntEnv(
  'QOSMIC_BRIDGE_RATE_LIMIT_PER_MIN',
  20,
);
const REQUEST_TIMEOUT_MS = parsePositiveIntEnv(
  'QOSMIC_BRIDGE_TIMEOUT_MS',
  15_000,
);
const MAX_RETRIES = parsePositiveIntEnv('QOSMIC_BRIDGE_RETRY_MAX', 4);
const RETRY_BASE_MS = parsePositiveIntEnv('QOSMIC_BRIDGE_RETRY_BASE_MS', 800);

// Global limiter key — SATU key untuk semua endpoint karena limit dokumentasinya
// per API key, bukan per endpoint.
const RATE_LIMIT_KEY = 'qosmic-bridge:global';

function parsePositiveIntEnv(name: string, fallback: number): number {
  const value = Number.parseInt(process.env[name] || '', 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function isQosmicBridgeConfigured(): boolean {
  return Boolean(BASE_URL && TOKEN);
}

export class QosmicBridgeError extends Error {
  constructor(
    message: string,
    public readonly status: number | null,
    public readonly code: string | null,
    public readonly retryable: boolean,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = 'QosmicBridgeError';
  }
}

export class QosmicBridgeRateLimitedError extends QosmicBridgeError {
  constructor(public readonly resetAt: number) {
    super(
      'QOSMIC Bridge rate limit reached (client-side guard)',
      429,
      'RATE_LIMITED',
      true,
    );
    this.name = 'QosmicBridgeRateLimitedError';
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Menunggu slot rate-limit yang tersedia (Redis sliding window, cross-process).
 * Dipanggil SEBELUM setiap HTTP request ke bridge — termasuk oleh ingestion,
 * status-refresh, active-refresh, dan pencarian tiket real-time di UI.
 *
 * `priority: 'interactive'` (pencarian user di UI) tetap antre normal di
 * limiter yang sama — budget dibagi rata secara FIFO. Prioritas antar-jenis
 * pemakai (worker vs UI) diatur di level queue (lihat queue.ts), bukan di sini.
 */
async function waitForRateLimitSlot(label: string): Promise<void> {
  const maxWaitMs = 90_000;
  const waitStart = Date.now();

  for (;;) {
    const result = await checkRateLimit(
      RATE_LIMIT_KEY,
      RATE_LIMIT_PER_MIN,
      60,
      {
        failOpen: false,
      },
    );
    if (result.allowed) return;

    if (Date.now() - waitStart > maxWaitMs) {
      throw new QosmicBridgeRateLimitedError(result.resetAt);
    }

    const waitMs = Math.max(250, result.resetAt * 1000 - Date.now());
    logger.info('[QosmicBridge] Menunggu slot rate-limit', {
      label,
      waitMs,
      limitPerMin: RATE_LIMIT_PER_MIN,
    });
    await sleep(Math.min(waitMs, 5_000));
  }
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status === 502 || status === 503 || status === 504;
}

export interface QosmicBridgeRequestOptions {
  query?: Record<string, string | number | undefined>;
  label: string; // untuk logging/observability, mis. 'nossa.list', 'nossa_closed.by_incident'
}

/**
 * Request generik ke QOSMIC Bridge. TIDAK memvalidasi bentuk response —
 * itu tanggung jawab layer di atasnya (nossa.ts), yang butuh kontrak field
 * pasti dari OpenAPI/contoh response (lihat catatan blocking di rencana).
 */
export async function qosmicBridgeGet<T = unknown>(
  path: string,
  options: QosmicBridgeRequestOptions,
): Promise<T> {
  if (!isQosmicBridgeConfigured()) {
    throw new QosmicBridgeError(
      'QOSMIC_BRIDGE_BASE_URL / QOSMIC_BRIDGE_TOKEN belum di-set',
      null,
      'NOT_CONFIGURED',
      false,
    );
  }

  const url = new URL(`${BASE_URL}${path}`);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  }

  let attempt = 0;
  while (true) {
    await waitForRateLimitSlot(options.label);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const startedAt = Date.now();

    try {
      const res = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          Accept: 'application/json',
        },
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const durationMs = Date.now() - startedAt;

      if (!res.ok) {
        const bodyText = await res.text().catch(() => '');
        let parsedBody: unknown = bodyText;
        try {
          parsedBody = bodyText ? JSON.parse(bodyText) : null;
        } catch {
          // biarkan sebagai raw text
        }

        const retryable = isRetryableStatus(res.status);
        logger.warn('[QosmicBridge] Request gagal', {
          label: options.label,
          path,
          status: res.status,
          durationMs,
          attempt,
          retryable,
        });

        if (retryable && attempt < MAX_RETRIES) {
          attempt++;
          const retryAfterHeader = res.headers.get('retry-after');
          const retryAfterMs = retryAfterHeader
            ? Number.parseInt(retryAfterHeader, 10) * 1000
            : RETRY_BASE_MS * 2 ** (attempt - 1);
          await sleep(
            Math.min(retryAfterMs, 30_000) + Math.floor(Math.random() * 250),
          );
          continue;
        }

        throw new QosmicBridgeError(
          `QOSMIC Bridge error ${res.status} pada ${path}`,
          res.status,
          null,
          retryable,
          parsedBody,
        );
      }

      logger.info('[QosmicBridge] Request sukses', {
        label: options.label,
        path,
        durationMs,
      });
      return (await res.json()) as T;
    } catch (error) {
      clearTimeout(timeout);
      const isAbort = error instanceof Error && error.name === 'AbortError';
      if (isAbort && attempt < MAX_RETRIES) {
        attempt++;
        logger.warn('[QosmicBridge] Timeout, retry', {
          label: options.label,
          path,
          attempt,
        });
        await sleep(RETRY_BASE_MS * 2 ** (attempt - 1));
        continue;
      }
      if (error instanceof QosmicBridgeError) throw error;
      throw new QosmicBridgeError(
        error instanceof Error ? error.message : String(error),
        null,
        isAbort ? 'TIMEOUT' : 'NETWORK_ERROR',
        true,
      );
    }
  }
}
