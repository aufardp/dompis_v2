import { correlationStorage } from './logger';

export function withCorrelation<T extends (...args: any[]) => Promise<Response>>(
  handler: T,
): T {
  return ((...args: any[]) => {
    const req = args[0] as { headers?: { get?: (name: string) => string | null } } | undefined;
    const correlationId =
      req?.headers?.get?.('x-correlation-id') ?? crypto.randomUUID();

    return correlationStorage.run(
      { correlationId, workerName: 'api' },
      () => handler(...args),
    );
  }) as unknown as T;
}
