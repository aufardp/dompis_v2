import { NextResponse } from 'next/server';

export const CACHE_CONTROL = {
  NO_CACHE: 'no-cache, no-store, must-revalidate',
  SHORT: 'private, max-age=30, stale-while-revalidate=60',
  MEDIUM: 'private, max-age=120, stale-while-revalidate=300',
  LONG: 'private, max-age=300, stale-while-revalidate=600',
} as const;

export function withCache(response: NextResponse, ttl: keyof typeof CACHE_CONTROL = 'SHORT'): NextResponse {
  response.headers.set('Cache-Control', CACHE_CONTROL[ttl]);
  return response;
}
