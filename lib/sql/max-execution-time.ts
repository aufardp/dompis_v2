import { logger } from '@/lib/observability/logger';

const DEFAULT_MAX_EXECUTION_MS = 30_000;

function parseMaxExecutionMs(): number {
  const v = parseInt(process.env.DASHBOARD_QUERY_MAX_EXECUTION_MS ?? '', 10);
  return Number.isFinite(v) && v > 0 ? v : DEFAULT_MAX_EXECUTION_MS;
}

/**
 * Sisipkan optimizer hint MAX_EXECUTION_TIME setelah SELECT pertama agar query
 * dashboard yang mahal tidak berjalan tanpa batas sambil memegang koneksi pool
 * (pemicu P2024). MySQL membatalkan query yang melebihi batas dengan error
 * 3024 — ditangani handler route sebagai 503 graceful.
 */
export function withMaxExecutionTime(
  sql: string,
  maxExecutionMs: number = parseMaxExecutionMs(),
): string {
  if (!Number.isFinite(maxExecutionMs) || maxExecutionMs <= 0) return sql;

  const hint = `/*+ MAX_EXECUTION_TIME(${Math.round(maxExecutionMs)}) */`;
  if (sql.includes('MAX_EXECUTION_TIME')) return sql;

  const match = sql.match(/(\s*)(SELECT)(\s)/i);
  if (!match || match.index === undefined) {
    logger.warn('[SQL] withMaxExecutionTime: SELECT tidak ditemukan, hint dilewati');
    return sql;
  }

  const insertAt = match.index + match[0].length;
  return `${sql.slice(0, insertAt)}${hint} ${sql.slice(insertAt).trimStart()}`;
}

/**
 * Deteksi query yang dibatalkan karena overload: MySQL error 3024 (melebihi
 * MAX_EXECUTION_TIME) atau Prisma P2024 (pool timeout). Handler dashboard
 * memakai ini untuk membalas 503 retryable alih-alih 500 generik.
 */
export function isQueryOverloadError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const err = error as { code?: unknown; message?: unknown };
  if (err.code === 'P2024') return true;

  const message = typeof err.message === 'string' ? err.message : '';
  return (
    /\b3024\b/.test(message) ||
    message.toLowerCase().includes('maximum statement execution time')
  );
}
