import { getLockStatus } from '@/lib/distributed-lock';
import { parsePositiveInt, withTaskLock } from '@/lib/workers/task-runner';
import { isRedisReady } from '@/lib/redis';

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
  const deadline = Date.now() + MAX_WAIT_MS;

  while (Date.now() < deadline) {
    if (parentSignal?.aborted) {
      throw parentSignal.reason ?? new Error('ticket_raw write aborted');
    }
    if (!isRedisReady()) {
      throw new Error('Redis unavailable; refusing uncoordinated ticket_raw write');
    }

    const status = await getLockStatus(LOCK_KEY);
    if (status.held) {
      await wait(Math.min(Math.max(status.ttlMs ?? 250, 100), 1000), parentSignal ?? NEVER_ABORTED);
      continue;
    }

    const controller = new AbortController();
    const abortFromParent = () => controller.abort(parentSignal?.reason);
    parentSignal?.addEventListener('abort', abortFromParent, { once: true });

    let value!: T;
    let wrote = false;
    try {
      const result = await withTaskLock(
        LOCK_KEY,
        LOCK_TTL_SECONDS,
        async () => {
          wrote = true;
          value = await write(controller.signal);
        },
        { abortController: controller },
      );
      if (result === 'acquired' && wrote) return value;
    } finally {
      parentSignal?.removeEventListener('abort', abortFromParent);
    }

    await wait(200, parentSignal ?? NEVER_ABORTED);
  }

  throw new Error(`Timed out waiting for ${LOCK_KEY} after ${MAX_WAIT_MS}ms`);
}
