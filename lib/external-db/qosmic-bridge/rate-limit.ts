import { randomUUID } from 'node:crypto';
import { redis, isRedisReady } from '@/lib/redis';

const TAKE_SLOT = `
local clock = redis.call('TIME')
local now = tonumber(clock[1]) * 1000 + math.floor(tonumber(clock[2]) / 1000)
local window = 60000
for i = 1, 2 do redis.call('ZREMRANGEBYSCORE', KEYS[i], '-inf', now - window) end
local wait = 0
for i = 1, 2 do
  if redis.call('ZCARD', KEYS[i]) >= tonumber(ARGV[i + 1]) then
    local oldest = redis.call('ZRANGE', KEYS[i], 0, 0, 'WITHSCORES')
    wait = math.max(wait, tonumber(oldest[2]) + window - now)
  end
end
if wait > 0 then return wait end
for i = 1, 2 do
  redis.call('ZADD', KEYS[i], now, ARGV[4])
  redis.call('PEXPIRE', KEYS[i], window)
end
return 0
`;

export async function takeBridgeRateSlot(key: string, totalLimit: number, classLimit: number): Promise<number> {
  if (!isRedisReady()) throw new Error('Bridge rate limiter unavailable');
  return Number(await redis.eval(TAKE_SLOT, 2, 'ratelimit:qosmic-bridge:all', `ratelimit:${key}`,
    Date.now(), totalLimit, classLimit, randomUUID()));
}
