import { logger } from '@/lib/observability/logger';

interface EnvVarSpec {
  name: string;
  optional?: boolean;
  type?: 'int' | 'float' | 'boolean' | 'string';
  min?: number;
  max?: number;
  expected?: string[];
}

const WORKER_CONFIG: Record<string, EnvVarSpec[]> = {
  'ingestion-worker': [
    { name: 'INGESTION_INTERVAL_MINUTES', type: 'int', min: 1, max: 60 },
    { name: 'INGESTION_TIMEOUT_MINUTES', type: 'int', min: 1, max: 60 },
    { name: 'INGESTION_LOCK_TTL_SECONDS', type: 'int', min: 60, max: 3600 },
    { name: 'INGESTION_CIRCUIT_RESET_MINUTES', type: 'int', min: 1, max: 60 },
    { name: 'INGESTION_BATCH_SIZE', type: 'int', min: 100, max: 5000 },
    { name: 'INGESTION_CURSOR_STALE_HOURS', type: 'int', min: 1, max: 168 },
    { name: 'TICKET_RAW_WRITER_LOCK_TTL', type: 'int', min: 30, max: 600 },
    { name: 'SCHEDULE_OFFSET', type: 'int', min: 0, max: 59 },
    { name: 'RUN_ON_START', type: 'boolean' },
    { name: 'PRISMA_CONNECTION_LIMIT', type: 'int', min: 1, max: 20 },
  ],
  'projection-worker': [
    { name: 'PROJECTION_INTERVAL_MINUTES', type: 'int', min: 1, max: 60 },
    { name: 'PROJECTION_TIMEOUT_MINUTES', type: 'int', min: 1, max: 60 },
    { name: 'PROJECTION_LOCK_TTL_SECONDS', type: 'int', min: 60, max: 3600 },
    { name: 'PROJECTION_CIRCUIT_RESET_MINUTES', type: 'int', min: 1, max: 60 },
    { name: 'PROJECTION_BATCH_SIZE', type: 'int', min: 100, max: 5000 },
    { name: 'PROJECTION_TRANSACTION_TIMEOUT_MS', type: 'int', min: 5000, max: 120000 },
    { name: 'PROJECTION_FULL_SCAN_ENABLED', type: 'boolean' },
    { name: 'FULL_SCAN_CRON', type: 'string' },
    { name: 'SCHEDULE_OFFSET', type: 'int', min: 0, max: 59 },
    { name: 'RUN_ON_START', type: 'boolean' },
    { name: 'PRISMA_CONNECTION_LIMIT', type: 'int', min: 1, max: 20 },
  ],
  'status-refresh-worker': [
    { name: 'STATUS_REFRESH_INTERVAL_MINUTES', type: 'int', min: 1, max: 60 },
    { name: 'STATUS_REFRESH_TIMEOUT_MINUTES', type: 'int', min: 1, max: 30 },
    { name: 'STATUS_REFRESH_LOCK_TTL_SECONDS', type: 'int', min: 60, max: 1800 },
    { name: 'STATUS_REFRESH_CIRCUIT_RESET_MINUTES', type: 'int', min: 1, max: 60 },
    { name: 'STATUS_REFRESH_BATCH_SIZE', type: 'int', min: 10, max: 1000 },
    { name: 'STATUS_REFRESH_SEED_BATCH_SIZE', type: 'int', min: 10, max: 10000 },
    { name: 'STATUS_REFRESH_SEED_TIMEOUT_MS', type: 'int', min: 5000, max: 60000 },
    { name: 'SCHEDULE_OFFSET', type: 'int', min: 0, max: 59 },
    { name: 'RUN_ON_START', type: 'boolean' },
    { name: 'PRISMA_CONNECTION_LIMIT', type: 'int', min: 1, max: 10 },
    { name: 'TICKETS_CACHE_TTL', type: 'int', min: 5, max: 300 },
  ],
  'active-refresh-worker': [
    { name: 'ACTIVE_REFRESH_INTERVAL_MINUTES', type: 'int', min: 1, max: 60 },
    { name: 'ACTIVE_REFRESH_TIMEOUT_MINUTES', type: 'int', min: 1, max: 30 },
    { name: 'ACTIVE_REFRESH_LOCK_TTL_SECONDS', type: 'int', min: 60, max: 1800 },
    { name: 'ACTIVE_REFRESH_CIRCUIT_RESET_MINUTES', type: 'int', min: 1, max: 60 },
    { name: 'ACTIVE_REFRESH_BATCH_SIZE', type: 'int', min: 10, max: 1000 },
    { name: 'SCHEDULE_OFFSET', type: 'int', min: 0, max: 59 },
    { name: 'RUN_ON_START', type: 'boolean' },
    { name: 'PRISMA_CONNECTION_LIMIT', type: 'int', min: 1, max: 10 },
    { name: 'TICKETS_CACHE_TTL', type: 'int', min: 5, max: 300 },
  ],
  'ops-worker': [
    { name: 'CRON_ENABLED', type: 'boolean' },
    { name: 'WORKER_STARTUP_DELAY_MS', type: 'int', min: 0, max: 120000 },
    { name: 'PRISMA_CONNECTION_LIMIT', type: 'int', min: 1, max: 10 },
  ],
};

const SHARED_CONFIG: EnvVarSpec[] = [
  { name: 'DATABASE_URL', type: 'string' },
  { name: 'REDIS_URL', type: 'string' },
  { name: 'JWT_ACCESS_SECRET', type: 'string' },
  { name: 'JWT_REFRESH_SECRET', type: 'string' },
  { name: 'EXTERNAL_DB_HOST', type: 'string', optional: true },
  { name: 'EXTERNAL_DB_PORT', type: 'int', min: 1, max: 65535, optional: true },
  { name: 'EXTERNAL_DB_USER', type: 'string', optional: true },
  { name: 'EXTERNAL_DB_PASSWORD', type: 'string' },
  { name: 'EXTERNAL_DB_NAME', type: 'string' },
  { name: 'EXTERNAL_TABLE_NAMES', type: 'string' },
  { name: 'EXTERNAL_DB_CONNECTION_LIMIT', type: 'int', min: 1, max: 10, optional: true },
  { name: 'EXTERNAL_DB_CONNECT_TIMEOUT_MS', type: 'int', min: 1000, max: 60000, optional: true },
  { name: 'CACHE_MAX_BYTES', type: 'int', min: 65536, max: 10485760, optional: true },
  { name: 'DASHBOARD_CACHE_TTL', type: 'int', min: 5, max: 300, optional: true },
  { name: 'STATS_CACHE_TTL', type: 'int', min: 5, max: 300, optional: true },
  { name: 'PRISMA_SLOW_QUERY_MS', type: 'int', min: 100, max: 30000, optional: true },
  { name: 'TELEGRAM_BOT_TOKEN', type: 'string', optional: true },
  { name: 'TELEGRAM_CHAT_ID', type: 'string', optional: true },
  { name: 'SLACK_WEBHOOK_URL', type: 'string', optional: true },
];

export function validateWorkerConfig(workerName: string): { valid: boolean; warnings: string[] } {
  const warnings: string[] = [];
  const specs = WORKER_CONFIG[workerName];
  if (!specs) {
    warnings.push(`Unknown worker name: ${workerName}`);
    return { valid: true, warnings };
  }

  for (const spec of specs) {
    const value = process.env[spec.name];
    if (value === undefined || value === '') {
      if (!spec.optional) {
        warnings.push(`${spec.name}: MISSING (required)`);
      }
      continue;
    }

    if (spec.type === 'int') {
      const parsed = parseInt(value, 10);
      if (!Number.isFinite(parsed)) {
        warnings.push(`${spec.name}=${value}: not a valid integer`);
        continue;
      }
      if (spec.min !== undefined && parsed < spec.min) {
        warnings.push(`${spec.name}=${parsed}: below minimum ${spec.min}`);
      }
      if (spec.max !== undefined && parsed > spec.max) {
        warnings.push(`${spec.name}=${parsed}: above maximum ${spec.max}`);
      }
    }

    if (spec.expected && !spec.expected.includes(value)) {
      warnings.push(`${spec.name}=${value}: expected one of ${spec.expected.join(', ')}`);
    }
  }

  for (const spec of SHARED_CONFIG) {
    const value = process.env[spec.name];
    if (value === undefined || value === '') {
      if (!spec.optional) {
        warnings.push(`${spec.name}: MISSING (shared, required)`);
      }
    }
  }

  return { valid: warnings.length === 0, warnings };
}

export function logConfigWarnings(workerName: string): void {
  const { warnings } = validateWorkerConfig(workerName);
  if (warnings.length === 0) {
    logger.info('Config validation passed', { worker: workerName });
    return;
  }
  for (const w of warnings) {
    logger.warn(`Config: ${w}`, { worker: workerName });
  }
}
