import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { checkRateLimit } from '@/lib/ratelimit';

export async function withRateLimit(
  request: NextRequest,
  handler: (request: NextRequest) => Promise<NextResponse>,
  options: { limit?: number; window?: number } = {},
) {
  const { limit = 100, window = 60 } = options;

  const authHeader = request.headers.get('authorization');
  const identifier = authHeader?.startsWith('Bearer ')
    ? `token:${authHeader.split(' ')[1]}`
    : `ip:${request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'}`;

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
