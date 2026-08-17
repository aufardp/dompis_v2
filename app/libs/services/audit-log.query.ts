// app/libs/services/audit-log.service.ts (extended)
// Query + retensi untuk tabel audit_log.

import prisma from '@/app/libs/prisma';
import { Prisma } from '@prisma/client';
import { logger } from '@/lib/observability/logger';

export type AuditLogFilters = {
  action?: string;
  resourceType?: string;
  actorRole?: string;
  search?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
};

export type AuditLogRow = {
  id: string;
  actorId: number | null;
  actorRole: string | null;
  actorName: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  meta: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
};

function serializeMeta(value: Prisma.JsonValue | null): Record<string, unknown> | null {
  if (!value) return null;
  if (typeof value !== 'object' || Array.isArray(value)) return { value };
  return value as Record<string, unknown>;
}

export async function getAuditLogs(
  filters: AuditLogFilters,
): Promise<{ rows: AuditLogRow[]; total: number; page: number; pageSize: number }> {
  const { action, resourceType, actorRole, search, from, to } = filters;
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 25));

  const where: Prisma.audit_logWhereInput = {};

  if (action && action !== 'all') where.action = action;
  if (resourceType && resourceType !== 'all') {
    where.resource_type = resourceType;
  }
  if (actorRole && actorRole !== 'all') where.actor_role = actorRole;

  if (search && search.trim()) {
    const q = search.trim();
    where.OR = [
      { resource_id: { contains: q } },
      { actor_name: { contains: q } },
      { actor_role: { contains: q } },
    ];
  }

  if (from || to) {
    where.created_at = {
      ...(from ? { gte: new Date(from) } : {}),
      ...(to ? { lte: new Date(to) } : {}),
    };
  }

  const [total, records] = await Promise.all([
    prisma.audit_log.count({ where }),
    prisma.audit_log.findMany({
      where,
      orderBy: { created_at: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  const rows: AuditLogRow[] = records.map((r) => ({
    id: r.id.toString(),
    actorId: r.actor_id,
    actorRole: r.actor_role,
    actorName: r.actor_name,
    action: r.action,
    resourceType: r.resource_type,
    resourceId: r.resource_id,
    meta: serializeMeta(r.meta),
    ipAddress: r.ip_address,
    userAgent: r.user_agent,
    createdAt: r.created_at.toISOString(),
  }));

  return { rows, total, page, pageSize };
}

export async function getAuditFilterOptions(): Promise<{
  actions: string[];
  resourceTypes: string[];
  roles: string[];
}> {
  const [actions, resourceTypes, roles] = await Promise.all([
    prisma.audit_log.findMany({
      distinct: ['action'],
      select: { action: true },
      orderBy: { action: 'asc' },
    }),
    prisma.audit_log.findMany({
      distinct: ['resource_type'],
      select: { resource_type: true },
      orderBy: { resource_type: 'asc' },
    }),
    prisma.audit_log.findMany({
      distinct: ['actor_role'],
      select: { actor_role: true },
      orderBy: { actor_role: 'asc' },
    }),
  ]);

  return {
    actions: actions.map((a) => a.action),
    resourceTypes: resourceTypes.map((r) => r.resource_type),
    roles: roles.filter((r) => r.actor_role).map((r) => r.actor_role!),
  };
}

const RETENTION_DAYS: Record<string, number> = {
  SEARCH: 90,
  EXPORT: 90,
  CUSTOMER_DATA_VIEW: 90,
  WAR_MAP_VIEW: 180,
  ADMIN: 365,
  SYSTEM: 365,
};

const DEFAULT_RETENTION_DAYS = 180;

export async function purgeAuditLogs(): Promise<number> {
  let total = 0;

  for (const [action, days] of Object.entries(RETENTION_DAYS)) {
    const threshold = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    try {
      const result = await prisma.audit_log.deleteMany({
        where: { action, created_at: { lt: threshold } },
      });
      total += result.count;
      logger.info('[purgeAuditLogs] Deleted', { action, days, count: result.count });
    } catch (error) {
      logger.error('[purgeAuditLogs] Error deleting', { action, error: String(error) });
    }
  }

  const defaultThreshold = new Date(Date.now() - DEFAULT_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  try {
    const defaultResult = await prisma.audit_log.deleteMany({
      where: {
        action: { notIn: Object.keys(RETENTION_DAYS) },
        created_at: { lt: defaultThreshold },
      },
    });
    total += defaultResult.count;
    if (defaultResult.count > 0) {
      logger.info('[purgeAuditLogs] Deleted default', { count: defaultResult.count, days: DEFAULT_RETENTION_DAYS });
    }
  } catch (error) {
    logger.error('[purgeAuditLogs] Error deleting default', { error: String(error) });
  }

  logger.info('[purgeAuditLogs] Completed', { totalDeleted: total });
  return total;
}