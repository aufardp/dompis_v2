import { NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/ratelimit';

export async function enforceApiRateLimit(
  request: Request,
  options: { namespace: string; limit: number; windowSeconds: number },
): Promise<NextResponse | null> {
  const authHeader = request.headers.get('authorization');
  const forwardedFor = request.headers.get('x-forwarded-for');
  const ip = forwardedFor?.split(',')[0]?.trim() || 'unknown';
  const identifier = authHeader?.startsWith('Bearer ')
    ? `${options.namespace}:token:${authHeader.slice('Bearer '.length)}`
    : `${options.namespace}:ip:${ip}`;

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
