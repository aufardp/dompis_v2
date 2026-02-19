export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message || fallback;
  return fallback;
}

export function getErrorStatus(error: unknown, fallback: number) {
  if (error && typeof error === 'object') {
    const status = (error as any).status ?? (error as any).statusCode;
    if (typeof status === 'number' && Number.isFinite(status) && status > 0) {
      return Math.floor(status);
    }
  }

  if (error instanceof Error) {
    const msg = String(error.message || '').trim();
    if (/^unauthorized\b/i.test(msg)) return 401;
    if (/^forbidden\b/i.test(msg)) return 403;
  }

  return fallback;
}
