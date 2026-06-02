import { Prisma, PrismaClient } from '@prisma/client';
import { logger } from '@/lib/observability/logger';

/**
 * Configuration for prisma transaction
 */
export interface TransactionConfig {
  maxRetries?: number;
  retryDelayMs?: number;
  timeoutMs?: number;
}

const DEFAULT_CONFIG: Required<TransactionConfig> = {
  maxRetries: 3,
  retryDelayMs: 1000,
  timeoutMs: 30000,
};

/**
 * Retryable transaction error codes
 */
const RETRYABLE_ERRORS = [
  'P2034', // Transaction failed due to contention
  'P2037', // Too many connections
];

/**
 * Check if error is retryable
 */
function isRetryableError(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return RETRYABLE_ERRORS.includes(error.code);
  }
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes('connection') ||
      message.includes('timeout') ||
      message.includes('contention')
    );
  }
  return false;
}

/**
 * Execute a Prisma transaction with retry logic
 */
export async function prismaTransaction<T>(
  client: PrismaClient | Prisma.TransactionClient,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  config: TransactionConfig = {}
): Promise<T> {
  const { maxRetries, retryDelayMs, timeoutMs } = {
    ...DEFAULT_CONFIG,
    ...config,
  };

  let lastError: unknown;
  let attempt = 0;

  while (attempt < maxRetries) {
    attempt++;

    try {
      const result = await (client as any).$transaction(async (tx: any) => {
        // Wrap with timeout
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(
            () => reject(new Error('Transaction timeout')),
            timeoutMs
          );
        });

        return Promise.race([fn(tx), timeoutPromise]);
      });

      return result;
    } catch (error) {
      lastError = error;

      // Don't retry if not a retryable error
      if (!isRetryableError(error)) {
        logger.error('[prismaTransaction] Non-retryable error', {
          attempt,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }

      logger.warn('[prismaTransaction] Retryable error, retrying...', {
        attempt,
        maxRetries,
        error: error instanceof Error ? error.message : String(error),
      });

      if (attempt < maxRetries) {
        const delay = retryDelayMs * Math.pow(2, attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  logger.error('[prismaTransaction] All retries exhausted', {
    attempts: attempt,
    error: lastError instanceof Error ? lastError.message : String(lastError),
  });

  throw lastError;
}

/**
 * Execute multiple operations in a single transaction
 * Useful for batch operations that need atomicity
 */
export async function prismaBatchTransaction<T>(
  client: PrismaClient,
  operations: Array<() => Promise<T>>,
  config: TransactionConfig = {}
): Promise<T[]> {
  return prismaTransaction(
    client,
    async (tx) => {
      const results: T[] = [];
      for (const op of operations) {
        results.push(await op());
      }
      return results;
    },
    config
  );
}