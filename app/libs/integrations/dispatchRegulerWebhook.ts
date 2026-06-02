import crypto from 'crypto';
import { prisma } from '@/app/libs/prisma';
import { isRedisReady, redis } from '@/lib/redis';
import { RegulerBranchReportPayload, RegulerWebhookConfig } from './regulerWebhookTypes';
import { logger } from '@/lib/observability/logger';
import { quarantine } from '@/lib/dlq';

const MAX_RETRY = 5;
const BASE_BACKOFF_MS = 60 * 1000;
const MAX_BACKOFF_MS = 15 * 60 * 1000;

function computeBackoff(attempt: number) {
  const ms = BASE_BACKOFF_MS * Math.pow(2, attempt - 1);
  return Math.min(ms, MAX_BACKOFF_MS);
}

interface RawRegulerTicket {
  incident: string;
  reported_date: string | null;
  service_area: string | null;
  service_no: string | null;
  service_type: string | null;
  booking_date: string | null;
  jenis_tiket_1: string | null;
  jenis_tiket_2: string | null;
  guarantee_status: string | null;
  area: string | null;
  teknisi: string | null;
  status: string | null;
  status_update: string | null;
  branch_id: number | null;
  branch_name: string | null;
  kode_branch: string | null;
}

export async function buildRegulerBranchReport(): Promise<RegulerBranchReportPayload> {
  const rows = await prisma.$queryRaw<RawRegulerTicket[]>`
    SELECT
      t.incident,
      t.reported_date,
      t.workzone AS service_area,
      t.service_no,
      t.service_type,
      t.booking_date,
      t.jenis_tiket_1,
      t.jenis_tiket_2,
      t.guarantee_status,
      t.status,
      a.nama_area AS area,
      u.nama AS teknisi,
      t.status_update,
      b.id_branch AS branch_id,
      b.nama_branch AS branch_name,
      b.kode_branch
    FROM ticket t
    LEFT JOIN users u ON u.id_user = t.teknisi_user_id
    LEFT JOIN service_area sa ON sa.nama_sa = t.workzone
    LEFT JOIN area a ON a.id_area = sa.area_id
    LEFT JOIN branch b ON b.id_branch = a.branch_id
    WHERE t.jenis_tiket_1 IN ('reguler', 'datin', 'indibiz', 'reseller', 'top olo', 'vpn ip', 'wifi-id', 'ccan')
      AND (t.status_update IS NULL OR t.status_update NOT IN ('close', 'closed'))
      AND (t.status IS NULL OR t.status != 'closed')
    ORDER BY b.nama_branch, t.workzone
  `;

  const branchMap = new Map<number, {
    branch_id: number;
    branch_name: string;
    kode_branch: string;
    tickets: RawRegulerTicket[];
  }>();

  for (const row of rows) {
    if (row.branch_id == null) continue;
    let group = branchMap.get(row.branch_id);
    if (!group) {
      group = {
        branch_id: row.branch_id,
        branch_name: row.branch_name ?? '',
        kode_branch: row.kode_branch ?? '',
        tickets: [],
      };
      branchMap.set(row.branch_id, group);
    }
    group.tickets.push(row);
  }

  const branches = Array.from(branchMap.values()).map((g) => ({
    branch_id: g.branch_id,
    branch_name: g.branch_name,
    kode_branch: g.kode_branch,
    total_tickets: g.tickets.length,
      tickets: g.tickets.map((t) => ({
        incident: t.incident,
        reported_date: t.reported_date,
        service_area: t.service_area,
        service_no: t.service_no,
        service_type: t.service_type,
        booking_date: t.booking_date,
        jenis_tiket_1: t.jenis_tiket_1,
        jenis_tiket_2: t.jenis_tiket_2,
        guarantee_status: t.guarantee_status,
        area: t.area,
        teknisi: t.teknisi,
        status_update: t.status_update,
      })),
  }));

  const totalTickets = branches.reduce((sum, b) => sum + b.total_tickets, 0);
  const now = new Date();
  const occurredAt = now.toISOString().replace('Z', '+07:00');

  return {
    event_id: crypto.randomUUID(),
    event_type: 'REGULER_BRANCH_REPORT',
    event_label: `REGULER_BRANCH_REPORT_${now.getTime()}`,
    occurred_at: occurredAt,
    total_tickets: totalTickets,
    total_branches: branches.length,
    generated_at: occurredAt,
    branches,
  };
}

function signPayload(secret: string, ts: string, rawBody: string) {
  return crypto
    .createHmac('sha256', secret)
    .update(`${ts}.${rawBody}`)
    .digest('hex');
}

async function postRegulerWebhook(
  cfg: RegulerWebhookConfig,
  body: RegulerBranchReportPayload,
): Promise<{ ok: boolean; status: number; text: string }> {
  const ts = Date.now().toString();
  const rawBody = JSON.stringify(body);
  const signature = signPayload(cfg.secret, ts, rawBody);

  const url = new URL(cfg.url);
  url.searchParams.set('timestamp', ts);
  url.searchParams.set('signature', signature);

  logger.info('[RegulerWebhook] Posting:', {
    url: url.origin + url.pathname,
    totalTickets: body.total_tickets,
    totalBranches: body.total_branches,
  });

  try {
    const res = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-source': 'dompis',
        'x-cron-secret': cfg.secret,
        'x-event-id': body.event_id,
        'x-idempotency-key': body.event_id,
      },
      body: rawBody,
      signal: AbortSignal.timeout(30_000),
    });

    const text = await res.text().catch(() => '');
    const isSuccess =
      res.ok ||
      res.status === 302 ||
      text.toLowerCase().includes('"success"') ||
      text.toLowerCase().includes('success');

    logger.info('[RegulerWebhook] Response:', {
      status: res.status,
      ok: isSuccess,
      bodyPreview: text.slice(0, 200),
    });

    return { ok: isSuccess, status: res.status, text };
  } catch (err) {
    return {
      ok: false,
      status: 500,
      text: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function dispatchRegulerWebhook() {
  const enabled = process.env.REGULER_WEBHOOK_ENABLED === 'true';

  if (!enabled) {
    return { skipped: true };
  }

  const url = process.env.REGULER_WEBHOOK_URL;
  const secret = process.env.REGULER_WEBHOOK_SECRET;

  if (!url || !secret) {
    throw new Error('REGULER_WEBHOOK_URL or REGULER_WEBHOOK_SECRET not set');
  }

  const now = new Date();

  // Build fresh report
  const payload = await buildRegulerBranchReport();

  if (payload.total_tickets === 0) {
    logger.info('[RegulerWebhook] No reguler tickets found — skipping dispatch');
    return { skipped: true, message: 'No reguler tickets' };
  }

  // Content-hash dedup: skip if same ticket set was sent within last hour
  const allIncidents = payload.branches
    .flatMap((b) => b.tickets.map((t) => t.incident))
    .sort()
    .join(',');
  const contentHash = crypto.createHash('sha256').update(allIncidents).digest('hex');
  const dedupKey = `reguler-webhook:dedup:${contentHash}`;
  if (isRedisReady()) {
    const dedupSet = await redis.set(dedupKey, '1', 'PX', 3_600_000, 'NX');
    if (!dedupSet) {
      logger.info('[RegulerWebhook] Skipped — duplicate content (same ticket set within 1h)');
      return { skipped: true, message: 'Duplicate content hash' };
    }
  }

  // Create outbox record
  const outbox = await prisma.reguler_webhook_outbox.create({
    data: {
      event_id: payload.event_id,
      total_tickets: payload.total_tickets,
      total_branches: payload.total_branches,
      payload: payload as any,
      status: 'PENDING',
      attempt_count: 0,
      next_attempt_at: null,
    },
  });

  // Mark as SENDING
  await prisma.reguler_webhook_outbox.update({
    where: { id: outbox.id },
    data: { status: 'SENDING' },
  });

  // Send
  try {
    const res = await postRegulerWebhook({ url, secret }, payload);

    if (res.ok) {
      await prisma.reguler_webhook_outbox.update({
        where: { id: outbox.id },
        data: {
          status: 'SENT',
          sent_at: new Date(),
          last_error: null,
        },
      });

      logger.info('[RegulerWebhook] Sent:', { totalTickets: payload.total_tickets, totalBranches: payload.total_branches });
      return { success: 1, failed: 0, event_id: payload.event_id };
    } else {
      throw new Error(res.text || `HTTP ${res.status}`);
    }
  } catch (err: any) {
    const newAttempt = outbox.attempt_count + 1;
    const isFinal = newAttempt >= MAX_RETRY;

    await prisma.reguler_webhook_outbox.update({
      where: { id: outbox.id },
      data: {
        attempt_count: newAttempt,
        last_error: err?.message || String(err),
        next_attempt_at: isFinal
          ? null
          : new Date(Date.now() + computeBackoff(newAttempt)),
        status: isFinal ? 'FAILED' : 'PENDING',
      },
    });

    logger.error('[RegulerWebhook] Failed:', { error: err?.message || String(err) });
    await quarantine('reguler-webhook', { url, payloadSize: payload?.total_tickets }, err).catch(() => {});
    return { success: 0, failed: 1, event_id: payload.event_id };
  }
}
