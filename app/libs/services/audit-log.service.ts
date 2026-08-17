// app/libs/services/audit-log.service.ts
// Audit trail terpusat lintas-objek (PRD 5.5).
// writeAuditLog bersifat fire-and-forget: menulis ke tabel audit_log
// di luar hot-path API. Tidak menggunakan await pada pemanggil utama.

import prisma from '@/app/libs/prisma';
import { Prisma } from '@prisma/client';
import { logger } from '@/lib/observability/logger';

export type AuditAction =
  | 'WAR_MAP_VIEW'
  | 'EXPORT'
  | 'CUSTOMER_DATA_VIEW'
  | 'SEARCH'
  | 'ADMIN'
  | 'SYSTEM';

export type AuditResourceType =
  | 'ticket'
  | 'war_map'
  | 'export'
  | 'qosmic'
  | 'audit'
  | 'user'
  | 'system';

export type AuditActor = {
  id_user?: number | null;
  role?: string | null;
  nama?: string | null;
};

export type WriteAuditInput = {
  actor?: AuditActor;
  action: string;
  resourceType: string;
  resourceId?: string | number | null;
  meta?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
};

function redactMeta(
  meta?: Record<string, unknown> | null,
): Prisma.InputJsonObject | null {
  if (!meta) return null;

  const BLACKLIST = new Set([
    'password',
    'token',
    'auth',
    'phone',
    'contact_phone',
    'contact_name',
    'customer_name',
    'alamat',
    'address',
    'email',
  ]);

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(meta)) {
    const normalized = key.toLowerCase();
    if (BLACKLIST.has(normalized)) {
      out[key] = '[redacted]';
      continue;
    }
    if (value && typeof value === 'object') {
      out[key] = redactMeta(value as Record<string, unknown>) ?? value;
    } else {
      out[key] = value;
    }
  }
  return out as Prisma.InputJsonObject;
}

/**
 * Catat aksi/akses sensitif ke tabel `audit_log` (fire-and-forget).
 * Tidak boleh dipanggil dengan `await` di hot path — panggil polos
 * (`writeAuditLog({ ... })`) supaya tidak menambah latensi respons API.
 */
export function writeAuditLog(input: WriteAuditInput): void {
  // Parsing env dilakukan sekali via module-scope cache.
  if (!stringToBool(process.env.AUDIT_LOG_ENABLED ?? 'true')) {
    return;
  }

  void (async () => {
    const sanitizedId = input.resourceId ?? null;

    const payload: Prisma.audit_logUncheckedCreateInput = {
      actor_id: input.actor?.id_user ?? null,
      actor_role: input.actor?.role ?? null,
      actor_name: input.actor?.nama ?? null,
      action: input.action.slice(0, 100),
      resource_type: input.resourceType.slice(0, 50),
      resource_id:
        typeof sanitizedId === 'number'
          ? String(sanitizedId).slice(0, 100)
          : sanitizedId
            ? String(sanitizedId).slice(0, 100)
            : null,
      meta: redactMeta(input.meta) ?? Prisma.JsonNull,
      ip_address: input.ipAddress?.slice(0, 45) ?? null,
      user_agent: input.userAgent?.slice(0, 255) ?? null,
    };

    try {
      await prisma.audit_log.create({ data: payload });
    } catch (error) {
      // Audit failure harus silent — jangan sampai merusak request utama.
      logger.error('writeAuditLog error:', error);
    }
  })();
}

function stringToBool(value: string): boolean {
  return value === 'true' || value === '1' || value === 'yes';
}

export function extractClientMeta(
  request: Request,
): { ipAddress: string | null; userAgent: string | null } {
  const headers = request?.headers;
  if (!headers) return { ipAddress: null, userAgent: null };

  const ip =
    headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    headers.get('x-real-ip') ||
    null;
  const userAgent = headers.get('user-agent') || null;

  return { ipAddress: ip, userAgent };
}