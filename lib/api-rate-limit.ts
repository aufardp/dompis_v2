import { NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/ratelimit';
import { buildRateLimitIdentifier } from '@/lib/rate-limit-identifiers';

export async function enforceApiRateLimit(
  request: Request,
  options: { namespace: string; limit: number; windowSeconds: number },
): Promise<NextResponse | null> {
  const identifier = buildRateLimitIdentifier(request, options.namespace);

  const result = await checkRateLimit(
    identifier,
    options.limit,
    options.windowSeconds,
  );

  if (result.allowed) return null;

  const retryAfter = Math.max(
    1,
    result.resetAt - Math.floor(Date.now() / 1000),
  );

  return NextResponse.json(
    {
      success: false,
      message: 'Too many requests. Please try again later.',
      retryAfter,
    },
    {
      status: 429,
      headers: {
        'Retry-After': String(retryAfter),
      },
    },
  );
}
