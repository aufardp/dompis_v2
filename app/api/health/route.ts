export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/app/libs/prisma';
import redis, { isRedisReady } from '@/lib/redis';
import { authorizeInternalRoute } from '@/app/libs/internalRouteAuth';
import { testExternalConnection } from '@/lib/external-db/connection';

export async function GET(req: NextRequest) {
  const start = Date.now();
  const baseResponse = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    responseTime: '0ms',
  };

  let authorized = false;

  try {
    await authorizeInternalRoute(req);
    authorized = true;
  } catch {
    authorized = false;
  }

  if (!authorized) {
    return NextResponse.json({
      ...baseResponse,
      responseTime: `${Date.now() - start}ms`,
    });
  }

  const health: any = {
    ...baseResponse,
    uptime: `${Math.floor(process.uptime())}s`,
    memory: {
      rss: `${Math.round(process.memoryUsage().rss / 1024 / 1024)} MB`,
      heapUsed: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)} MB`,
    },
    environment: process.env.NODE_ENV,
    services: {
      database: 'unknown',
      redis: 'unknown',
      externalDb: 'unknown',
      webhook:
        process.env.TECH_EVENTS_WEBHOOK_ENABLED === 'true'
          ? 'enabled'
          : 'disabled',
      cron: process.env.CRON_ENABLED === 'true' ? 'enabled' : 'disabled',
    },
    metrics: {
      pendingEvents: 0,
    },
    responseTime: '0ms',
  };

  try {
    // 🔹 Database check
    await prisma.$queryRawUnsafe('SELECT 1');
    health.services.database = 'connected';

    // 🔹 Redis check (safe)
    if (isRedisReady()) {
      await redis.ping();
      health.services.redis = 'connected';
    } else {
      health.services.redis = 'disconnected';
      health.status = 'warning';
    }

    // 🔹 External DB check
    const externalDbOk = await testExternalConnection();
    health.services.externalDb = externalDbOk ? 'connected' : 'disconnected';
    if (!externalDbOk) {
      health.status = 'warning';
    }

    // 🔹 Outbox backlog
    const pendingCount = await prisma.tech_event_outbox.count({
      where: { status: 'PENDING' },
    });

    health.metrics.pendingEvents = pendingCount;

    if (pendingCount > 1000) {
      health.status = 'warning';
    }

    health.responseTime = `${Date.now() - start}ms`;

    return NextResponse.json(health);
  } catch (error) {
    health.status = 'error';
    health.responseTime = `${Date.now() - start}ms`;

    if (health.services.database === 'unknown') {
      health.services.database = 'disconnected';
    }

    if (health.services.redis === 'unknown') {
      health.services.redis = 'disconnected';
    }

    if (health.services.externalDb === 'unknown') {
      health.services.externalDb = 'disconnected';
    }

    return NextResponse.json(health, { status: 500 });
  }
}
