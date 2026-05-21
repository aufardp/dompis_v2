type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  component?: string;
  worker?: string;
  task?: string;
  batchId?: string | null;
  correlationId?: string;
  lockKey?: string;
  ownerId?: string;
  fencingToken?: number;
  [key: string]: unknown;
}

function serializeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }
  return { message: String(error) };
}

export function createCorrelationId(prefix: string): string {
  return `${prefix}-${Date.now()}-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
}

export function log(level: LogLevel, message: string, context: LogContext = {}): void {
  const payload = {
    ts: new Date().toISOString(),
    level,
    message,
    pid: process.pid,
    ...context,
  };

  const line = JSON.stringify(payload, (_key, value) =>
    typeof value === 'bigint' ? value.toString() : value,
  );

  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (message: string, context?: LogContext) => log('debug', message, context),
  info: (message: string, context?: LogContext) => log('info', message, context),
  warn: (message: string, context?: LogContext) => log('warn', message, context),
  error: (message: string, error?: unknown, context: LogContext = {}) =>
    log('error', message, {
      ...context,
      error: error === undefined ? undefined : serializeError(error),
    }),
};
