/* eslint-disable @typescript-eslint/no-require-imports */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const REDACTED = '[REDACTED]';
const SENSITIVE_KEY_PATTERN =
  /authorization|cookie|token|secret|password|passwd|refresh|access|signature/i;

export interface CorrelationContext {
  correlationId: string;
  workerName: string;
}

let _asyncLocalStorage: { getStore(): CorrelationContext | undefined; run<R>(store: CorrelationContext, callback: (...args: unknown[]) => R, ...args: unknown[]): R } | null = null;

function getStorage() {
  if (_asyncLocalStorage) return _asyncLocalStorage;
  try {
    const { AsyncLocalStorage: ALS } = require('async_hooks') as { AsyncLocalStorage: new <T>() => { getStore(): T | undefined; run<R>(store: T, callback: (...args: unknown[]) => R, ...args: unknown[]): R } };
    _asyncLocalStorage = new ALS<CorrelationContext>();
  } catch {
    _asyncLocalStorage = {
      getStore: () => undefined,
      run: <R>(_store: CorrelationContext, callback: (...args: unknown[]) => R, ...args: unknown[]) => callback(...args),
    };
  }
  return _asyncLocalStorage;
}

export function getCorrelationId(): string | undefined {
  return getStorage().getStore()?.correlationId;
}

export function getWorkerName(): string | undefined {
  return getStorage().getStore()?.workerName;
}

function sanitizeValue(value: string): string {
  if (/^Bearer\s+/i.test(value)) return 'Bearer [REDACTED]';
  if (value.length > 12 && /^[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+$/.test(value)) {
    return REDACTED;
  }
  return value;
}

function redactSensitive(input: unknown): unknown {
  if (input === null || input === undefined) return input;

  if (typeof input === 'string') {
    return sanitizeValue(input);
  }

  if (Array.isArray(input)) {
    return input.map((item) => redactSensitive(item));
  }

  if (typeof input === 'object') {
    const entries = Object.entries(input as Record<string, unknown>).map(
      ([key, value]) => [
        key,
        SENSITIVE_KEY_PATTERN.test(key) ? REDACTED : redactSensitive(value),
      ],
    );
    return Object.fromEntries(entries);
  }

  return input;
}

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

const _process = typeof process !== 'undefined' ? process : undefined;
const pid: number = _process && typeof _process.pid === 'number' ? _process.pid : 0;

export const correlationStorage = {
  getStore: () => getStorage().getStore(),
  run: <R>(store: CorrelationContext, callback: (...args: unknown[]) => R, ...args: unknown[]): R =>
    getStorage().run(store, callback, ...args) as R,
};

export function createCorrelationId(prefix: string): string {
  return `${prefix}-${Date.now()}-${pid}-${Math.random().toString(36).slice(2, 8)}`;
}

export function log(level: LogLevel, message: string, context: LogContext = {}): void {
  const store = getStorage().getStore();
  if (store && !context.correlationId) {
    context.correlationId = store.correlationId;
    context.worker = store.workerName;
  }

  const payload = {
    ts: new Date().toISOString(),
    level,
    message,
    pid,
    ...redactSensitive(context) as LogContext,
  };

  const line = JSON.stringify(payload, (_key, value) =>
    typeof value === 'bigint' ? value.toString() : value,
  );

  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

function childLogger(defaultContext: LogContext) {
  return {
    debug: (message: string, context?: LogContext) =>
      log('debug', message, { ...defaultContext, ...context }),
    info: (message: string, context?: LogContext) =>
      log('info', message, { ...defaultContext, ...context }),
    warn: (message: string, context?: LogContext) =>
      log('warn', message, { ...defaultContext, ...context }),
    error: (message: string, error?: unknown, context: LogContext = {}) =>
      log('error', message, {
        ...defaultContext,
        ...context,
        error: error === undefined ? undefined : serializeError(error),
      }),
  };
}

export type ChildLogger = ReturnType<typeof childLogger>;

export const logger = {
  debug: (message: string, context?: LogContext) => log('debug', message, context),
  info: (message: string, context?: LogContext) => log('info', message, context),
  warn: (message: string, context?: LogContext) => log('warn', message, context),
  error: (message: string, error?: unknown, context: LogContext = {}) =>
    log('error', message, {
      ...context,
      error: error === undefined ? undefined : serializeError(error),
    }),
  child: childLogger,
};
