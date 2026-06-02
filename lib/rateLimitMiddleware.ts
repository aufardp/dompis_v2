import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { checkRateLimit } from '@/lib/ratelimit';
import { buildRateLimitIdentifier } from '@/lib/rate-limit-identifiers';

export async function withRateLimit(
  request: NextRequest,
  handler: (request: NextRequest) => Promise<NextResponse>,
  options: { limit?: number; window?: number } = {},
) {
  const { limit = 100, window = 60 } = options;

  const identifier = buildRateLimitIdentifier(request, 'middleware');

  const result = await checkRateLimit(identifier, limit, window);

  if (!result.allowed) {
    return NextResponse.json(
      {
        success: false,
        message: 'Too many requests. Please try again later.',
        retryAfter: result.resetAt - Math.floor(Date.now() / 1000),
      },
      {
        status: 429,
        headers: {
          'Retry-After': String(result.resetAt - Math.floor(Date.now() / 1000)),
        },
      },
    );
  }

  return handler(request);
}

export const RATE_LIMITS = {
  DEFAULT: { limit: 100, window: 60 },
  AUTH: { limit: 10, window: 60 },
  WRITE: { limit: 30, window: 60 },
  STRICT: { limit: 20, window: 60 },
};
