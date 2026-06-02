import { createHash } from 'crypto';

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 24);
}

export function getClientIp(request: Request): string {
  const forwardedFor = request.headers.get('x-forwarded-for');
  return forwardedFor?.split(',')[0]?.trim() || 'unknown';
}

export function buildRateLimitIdentifier(
  request: Request,
  namespace: string,
  options: { authValue?: string; username?: string } = {},
): string {
  const ip = getClientIp(request);

  if (options.username) {
    return `${namespace}:login:${digest(`${ip}:${options.username.toLowerCase().trim()}`)}`;
  }

  const authHeader = options.authValue ?? request.headers.get('authorization') ?? '';
  if (authHeader.startsWith('Bearer ')) {
    return `${namespace}:token:${digest(authHeader.slice('Bearer '.length))}`;
  }

  return `${namespace}:ip:${digest(ip)}`;
}
