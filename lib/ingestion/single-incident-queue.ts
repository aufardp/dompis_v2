import { Queue, type Job } from 'bullmq';
import { randomUUID } from 'node:crypto';
import type { IncidentJobStatus } from './incident-input';

const connection = {
  host: process.env.REDIS_HOST ?? 'localhost',
  port: Number(process.env.REDIS_PORT ?? 6379),
  maxRetriesPerRequest: 1,
  enableOfflineQueue: false,
  connectTimeout: Number(process.env.REDIS_CONNECT_TIMEOUT_MS ?? 10_000),
  retryStrategy: (times: number) => times > 10 ? null : Math.min(times * 500, 5000),
  keepAlive: 10_000,
};

export const SINGLE_INCIDENT_QUEUE_NAME = 'single-incident-ingestion';

export const singleIncidentQueue = new Queue(SINGLE_INCIDENT_QUEUE_NAME, {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { age: 24 * 60 * 60, count: 10000 },
    removeOnFail: { age: 7 * 24 * 60 * 60, count: 1000 },
  },
});

export function singleIncidentJobId(incident: string): string {
  return `incident-${encodeURIComponent(incident)}`;
}

export async function enqueueSingleIncident(incident: string, requestId: string = randomUUID()): Promise<string> {
  const deduplicationId = singleIncidentJobId(incident);
  const jobId = `${deduplicationId}-${requestId}`;
  const prior = await singleIncidentQueue.getJob(jobId);
  if (prior) return String(prior.id);
  const legacy = await singleIncidentQueue.getJob(deduplicationId);
  if (legacy && !['completed', 'failed', 'unknown'].includes(await legacy.getState())) return String(legacy.id);
  const job = await singleIncidentQueue.add('ingest-incident', { incident }, {
    jobId, deduplication: { id: deduplicationId },
  });
  const actualId = String(job.id);
  const client = await singleIncidentQueue.client;
  await client.set(`ingestion:incident:latest:${incident}`, actualId, { EX: 86400 });
  return actualId;
}

export async function findSingleIncidentJob(incident: string, jobId?: string): Promise<Job | undefined> {
  const client = await singleIncidentQueue.client;
  const id = jobId ?? await singleIncidentQueue.getDeduplicationJobId(singleIncidentJobId(incident))
    ?? await client.get(`ingestion:incident:latest:${incident}`) ?? singleIncidentJobId(incident);
  const job = await singleIncidentQueue.getJob(id);
  return job?.data.incident === incident ? job : undefined;
}

export async function readIncidentJobStatus(incident: string, job: Job | undefined): Promise<IncidentJobStatus> {
  if (!job) return { incident, jobId: null, state: 'unavailable', terminal: true, success: false, attemptsMade: 0, message: 'Status permintaan tidak tersedia atau sudah kedaluwarsa.' };
  const state = await job.getState();
  const terminal = state === 'completed' || state === 'failed' || state === 'unknown';
  const success = state === 'completed' && job.returnvalue?.success === true;
  const progress = job.progress && typeof job.progress === 'object' ? job.progress as { message?: string } : undefined;
  return {
    incident, jobId: String(job.id), state, terminal, success, attemptsMade: job.attemptsMade,
    message: state === 'completed'
      ? job.returnvalue?.message ?? (success ? 'Insiden selesai diproses.' : 'Pemrosesan insiden tidak berhasil.')
      : state === 'failed' ? progress?.message ?? 'Pemrosesan gagal setelah percobaan ulang. Anda dapat mengantrekan incident ini kembali.'
        : state === 'unknown' ? 'Status permintaan sudah kedaluwarsa.'
          : state === 'delayed' ? 'Menunggu percobaan ulang.'
            : state === 'active' ? 'Sedang mengambil dan menerapkan data insiden.' : 'Menunggu giliran.',
  };
}
