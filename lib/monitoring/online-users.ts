import { ensureRedisReady, redis } from '@/lib/redis';
import { prisma } from '@/app/libs/prisma';

export type OnlineUserRecord = {
  id: string;
  role: string;
  path: string;
  userAgent: string;
  lastSeenAt: string;
  nama?: string | null;
};

const ONLINE_USERS_HASH = 'monitoring:online:users';
const ONLINE_USERS_SEEN = 'monitoring:online:last_seen';
const ONLINE_WINDOW_MS = 90_000;

function nowMs(): number {
  return Date.now();
}

export async function recordOnlineUser(input: {
  userId: number | string;
  role: string;
  path?: string | null;
  userAgent?: string | null;
}): Promise<void> {
  if (!(await ensureRedisReady())) return;

  const id = String(input.userId);
  const timestamp = nowMs();
  const record: OnlineUserRecord = {
    id,
    role: input.role,
    path: input.path?.slice(0, 200) || '/',
    userAgent: input.userAgent?.slice(0, 160) || '',
    lastSeenAt: new Date(timestamp).toISOString(),
  };

  const cutoff = timestamp - ONLINE_WINDOW_MS;
  await redis
    .multi()
    .hset(ONLINE_USERS_HASH, id, JSON.stringify(record))
    .zadd(ONLINE_USERS_SEEN, timestamp, id)
    .zremrangebyscore(ONLINE_USERS_SEEN, 0, cutoff)
    .expire(ONLINE_USERS_HASH, 24 * 60 * 60)
    .expire(ONLINE_USERS_SEEN, 24 * 60 * 60)
    .exec();
}

export async function getOnlineUsers(): Promise<{
  total: number;
  byRole: Record<string, number>;
  users: OnlineUserRecord[];
  windowSeconds: number;
}> {
  if (!(await ensureRedisReady())) {
    return { total: 0, byRole: {}, users: [], windowSeconds: ONLINE_WINDOW_MS / 1000 };
  }

  const cutoff = nowMs() - ONLINE_WINDOW_MS;
  await redis.zremrangebyscore(ONLINE_USERS_SEEN, 0, cutoff).catch(() => 0);

  const ids = await redis.zrangebyscore(
    ONLINE_USERS_SEEN,
    cutoff,
    '+inf',
    'LIMIT',
    0,
    100,
  );
  if (ids.length === 0) {
    return { total: 0, byRole: {}, users: [], windowSeconds: ONLINE_WINDOW_MS / 1000 };
  }

  const values = await redis.hmget(ONLINE_USERS_HASH, ...ids);
  const users = values
    .map((value) => {
      if (!value) return null;
      try {
        return JSON.parse(value) as OnlineUserRecord;
      } catch {
        return null;
      }
    })
    .filter((value): value is OnlineUserRecord => Boolean(value))
    .sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt));

  const numericIds = users
    .map((user) => Number(user.id))
    .filter((id) => Number.isInteger(id));
  const nameMap: Record<string, string> = {};
  if (numericIds.length > 0) {
    const rows = await prisma.users.findMany({
      where: { id_user: { in: numericIds } },
      select: { id_user: true, nama: true },
    });
    for (const row of rows) {
      nameMap[String(row.id_user)] = row.nama ?? '';
    }
  }
  const enriched = users.map((user) => ({
    ...user,
    nama: nameMap[String(user.id)] ?? null,
  }));

  const byRole: Record<string, number> = {};
  for (const user of enriched) {
    byRole[user.role] = (byRole[user.role] ?? 0) + 1;
  }

  return {
    total: enriched.length,
    byRole,
    users: enriched,
    windowSeconds: ONLINE_WINDOW_MS / 1000,
  };
}
