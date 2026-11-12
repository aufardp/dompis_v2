import { randomUUID } from 'node:crypto';
import { parsePositiveInt, withTaskLock } from '@/lib/workers/task-runner';
import { isRedisReady, redis } from '@/lib/redis';
import { logger } from '@/lib/observability/logger';

const LOCK_KEY = 'ticket_raw_writer';
const LOCK_TTL_SECONDS = parsePositiveInt(
  process.env.TICKET_RAW_WRITER_LOCK_TTL,
  300,
);
const MAX_WAIT_MS = parsePositiveInt(
  process.env.TICKET_RAW_WRITER_WAIT_MS,
  120_000,
);
const NEVER_ABORTED = new AbortController().signal;
const QUEUE_KEY = `lock:${LOCK_KEY}:queue`;
const POLL_MS = Math.max(
  25,
  Math.min(1000, parsePositiveInt(process.env.TICKET_RAW_WRITER_POLL_MS, 100)),
);
const LEASE_MS = Math.max(
  POLL_MS * 3,
  parsePositiveInt(process.env.TICKET_RAW_WRITER_QUEUE_LEASE_MS, 10_000),
);
const QUEUE_TURN_SCRIPT = `
  local time = redis.call('TIME')
  local now = tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000)
  local expired = redis.call('ZRANGEBYSCORE', KEYS[2], '-inf', now, 'LIMIT', 0, 100)
  for _, waiter in ipairs(expired) do
    redis.call('ZREM', KEYS[1], waiter)
    redis.call('ZREM', KEYS[2], waiter)
  end
  if not redis.call('ZSCORE', KEYS[1], ARGV[1]) then
    redis.call('ZADD', KEYS[1], redis.call('INCR', KEYS[3]), ARGV[1])
  end
  redis.call('ZADD', KEYS[2], now + tonumber(ARGV[2]), ARGV[1])
  redis.call('PEXPIRE', KEYS[1], ARGV[3])
  redis.call('PEXPIRE', KEYS[2], ARGV[3])
  local position = redis.call('ZRANK', KEYS[1], ARGV[1])
  local owner = redis.call('GET', KEYS[4])
  local ready = 0
  if position == 0 and not owner then ready = 1 end
  return {ready, owner or '', position}
`;

export class TicketRawWriterLockTimeoutError extends Error {
  readonly code = 'TICKET_RAW_WRITER_LOCK_TIMEOUT';
  readonly lockKey = LOCK_KEY;

  constructor(
    readonly waitMs: number,
    readonly blockingOwner: string | null,
    readonly queuePosition: number | null,
  ) {
    super(`Timed out waiting for ${LOCK_KEY} after ${waitMs}ms`);
    this.name = 'TicketRawWriterLockTimeoutError';
  }
}

function wait(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(signal.reason);

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort);
      resolve();
    }, ms);
    const abort = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      reject(signal.reason ?? new Error('ticket_raw write aborted'));
    };
    signal.addEventListener('abort', abort, { once: true });
  });
}

export async function withTicketRawWriterLock<T>(
  write: (signal: AbortSignal) => Promise<T>,
  parentSignal?: AbortSignal,
): Promise<T> {
  const started = Date.now();
  const deadline = started + MAX_WAIT_MS;
  const waiter = `${process.pid}:${randomUUID()}`;
  let blockingOwner: string | null = null;
  let queuePosition: number | null = null;

  try {
    while (Date.now() < deadline) {
      if (parentSignal?.aborted) {
        throw parentSignal.reason ?? new Error('ticket_raw write aborted');
      }
      if (!isRedisReady()) {
        throw new Error(
          'Redis unavailable; refusing uncoordinated ticket_raw write',
        );
      }

      const [ready, owner, position] = (await redis.eval(
        QUEUE_TURN_SCRIPT,
        4,
        QUEUE_KEY,
        `${QUEUE_KEY}:leases`,
        `${QUEUE_KEY}:sequence`,
        `lock:${LOCK_KEY}`,
        waiter,
        LEASE_MS,
        MAX_WAIT_MS + LEASE_MS,
      )) as [number, string, number];
      blockingOwner = owner || null;
      queuePosition = position;
      if (!ready) {
        await wait(
          Math.min(POLL_MS, Math.max(1, deadline - Date.now())),
          parentSignal ?? NEVER_ABORTED,
        );
        continue;
      }

      const controller = new AbortController();
      const abortFromParent = () => controller.abort(parentSignal?.reason);
      parentSignal?.addEventListener('abort', abortFromParent, { once: true });
      if (parentSignal?.aborted) abortFromParent();

      let value!: T;
      let wrote = false;
      try {
        const result = await withTaskLock(
          LOCK_KEY,
          LOCK_TTL_SECONDS,
          async () => {
            controller.signal.throwIfAborted();
            const waitMs = Date.now() - started;
            if (waitMs >= 2000)
              logger.warn('Ticket raw writer acquired after waiting', {
                component: 'ingestion',
                lockKey: LOCK_KEY,
                waitMs,
              });
            wrote = true;
            value = await write(controller.signal);
          },
          { abortController: controller },
        );
        if (result === 'acquired' && wrote) return value;
      } finally {
        parentSignal?.removeEventListener('abort', abortFromParent);
      }

      await wait(POLL_MS, parentSignal ?? NEVER_ABORTED);
    }

    throw new TicketRawWriterLockTimeoutError(
      Date.now() - started,
      blockingOwner,
      queuePosition,
    );
  } finally {
    if (isRedisReady()) {
      await redis
        .multi()
        .zrem(QUEUE_KEY, waiter)
        .zrem(`${QUEUE_KEY}:leases`, waiter)
        .exec()
        .catch((error) =>
          logger.warn('Failed to remove ticket raw writer waiter', {
            component: 'ingestion',
            lockKey: LOCK_KEY,
            error: String(error),
          }),
        );
    }
  }
}
