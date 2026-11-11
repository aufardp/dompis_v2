import { Queue } from 'bullmq';

const connection = {
  host: process.env.REDIS_HOST ?? 'localhost',
  port: Number(process.env.REDIS_PORT ?? 6379),
  maxRetriesPerRequest: null,
  enableOfflineQueue: true,
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
    removeOnComplete: { age: 24 * 60 * 60, count: 1000 },
    removeOnFail: { age: 7 * 24 * 60 * 60, count: 1000 },
  },
});

export function singleIncidentJobId(incident: string): string {
  return `incident-${encodeURIComponent(incident)}`;
}
