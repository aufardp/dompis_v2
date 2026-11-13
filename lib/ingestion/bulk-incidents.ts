import { createHash } from 'node:crypto';
import { ApiError } from '@/app/libs/apiError';
import { enqueueSingleIncident, readIncidentJobStatus, singleIncidentQueue } from './single-incident-queue';
import { parseIncidentInput, type BulkIncidentReport, type IncidentJobStatus } from './incident-input';

const RETENTION_SECONDS = 86400;
const STORE_FIELD = `if redis.call('EXISTS', KEYS[1]) == 1 then return redis.call('HSETNX', KEYS[1], ARGV[1], ARGV[2]) end return 0`;
const CLAIM_BATCH = `
local existing = redis.call('HGET', KEYS[1], 'meta')
if existing then return existing end
redis.call('HSET', KEYS[1], 'meta', ARGV[1])
redis.call('EXPIRE', KEYS[1], ARGV[2])
return ARGV[1]`;
const registeredClients = new WeakSet<object>();

async function batchClient() {
  const client = await singleIncidentQueue.client;
  if (!registeredClients.has(client)) {
    client.defineCommand('dompisBulkClaim', { numberOfKeys: 1, lua: CLAIM_BATCH });
    client.defineCommand('dompisBulkStore', { numberOfKeys: 1, lua: STORE_FIELD });
    registeredClients.add(client);
  }
  return client;
}

function batchKey(userId: number, requestId: string): string {
  if (!Number.isSafeInteger(userId) || userId < 1) throw new ApiError(401, 'Identitas pengguna tidak valid.');
  if (!/^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i.test(requestId)) throw new ApiError(400, 'ID permintaan tidak valid.');
  return `ingestion:bulk:${userId}:${requestId.toLowerCase()}`;
}

interface BatchMeta { requestId: string; incidents: string[]; hash: string; createdAt: string; expiresAt: string }

export async function enqueueBulkIncidents(userId: number, requestId: string, input: unknown): Promise<BulkIncidentReport> {
  const key = batchKey(userId, requestId);
  let parsed: ReturnType<typeof parseIncidentInput>;
  try { parsed = parseIncidentInput(input); }
  catch (error) { throw new ApiError(400, error instanceof Error ? error.message : 'Daftar incident tidak valid.'); }
  if (!parsed.incidents.length || parsed.invalid.length) throw new ApiError(400, 'Daftar harus berisi ID incident yang valid, misalnya INC52661271.');
  const client = await batchClient();
  const hash = createHash('sha256').update(JSON.stringify(parsed.incidents)).digest('hex');
  const meta: BatchMeta = {
    requestId: requestId.toLowerCase(), incidents: parsed.incidents, hash,
    createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + RETENTION_SECONDS * 1000).toISOString(),
  };
  const claimed = JSON.parse(String(await client.runCommand('dompisBulkClaim', [key, JSON.stringify(meta), RETENTION_SECONDS]))) as BatchMeta;
  if (claimed.hash !== hash) throw new ApiError(409, 'ID permintaan sudah digunakan untuk daftar incident yang berbeda.');
  const existing = await client.hgetall(key);
  for (let offset = 0; offset < claimed.incidents.length; offset += 20) {
    const outcomes = await Promise.allSettled(claimed.incidents.slice(offset, offset + 20).map(async incident => {
      if (existing[`job:${incident}`]) return;
      const jobId = await enqueueSingleIncident(incident, `bulk-${userId}-${claimed.requestId}`);
      await client.runCommand('dompisBulkStore', [key, `job:${incident}`, jobId]);
    }));
    const failed = outcomes.find(outcome => outcome.status === 'rejected');
    if (failed?.status === 'rejected') throw failed.reason;
  }
  return getBulkIncidentReport(userId, requestId);
}

export async function getBulkIncidentReport(userId: number, requestId: string): Promise<BulkIncidentReport> {
  const key = batchKey(userId, requestId);
  const client = await batchClient();
  const stored = await client.hgetall(key);
  if (!stored.meta) throw new ApiError(404, 'Permintaan tidak ditemukan atau sudah kedaluwarsa.');
  const meta = JSON.parse(stored.meta) as BatchMeta;
  const items: IncidentJobStatus[] = [];
  for (let offset = 0; offset < meta.incidents.length; offset += 20) {
    items.push(...await Promise.all(meta.incidents.slice(offset, offset + 20).map(async incident => {
      const snapshot = stored[`result:${incident}`];
      if (snapshot) return JSON.parse(snapshot) as IncidentJobStatus;
      const jobId = stored[`job:${incident}`];
      if (!jobId) return { incident, jobId: null, state: 'pending_enqueue', terminal: false, success: false, attemptsMade: 0, message: 'Belum masuk antrean. Lanjutkan pengantrean dengan ID permintaan yang sama.' };
      const status = await readIncidentJobStatus(incident, await singleIncidentQueue.getJob(jobId));
      if (status.terminal) await client.runCommand('dompisBulkStore', [key, `result:${incident}`, JSON.stringify(status)]);
      return status;
    })));
  }
  const completed = items.filter(item => item.terminal).length;
  const succeeded = items.filter(item => item.success).length;
  return {
    requestId: meta.requestId, createdAt: meta.createdAt, expiresAt: meta.expiresAt, items,
    total: items.length, completed, succeeded, failed: completed - succeeded,
    pendingEnqueue: items.filter(item => item.state === 'pending_enqueue').length,
    terminal: completed === items.length,
  };
}
