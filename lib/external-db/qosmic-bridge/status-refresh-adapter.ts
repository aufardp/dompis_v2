import { Prisma } from '@prisma/client';
import { prisma } from '@/app/libs/prisma';
import { iterateNossaOpen, iterateNossaClosedIncremental } from './nossa';
import { isQosmicBridgeConfigured } from './client';
import {
  normalizeExternalRow,
  normalizeStatus,
} from '@/lib/ingestion/normalizer';
import { logger } from '@/lib/observability/logger';
import { nowWib, todayWibDateForDb } from '@/lib/timezone';
import type {
  ExternalRow,
  NormalizedExternalRow,
} from '@/lib/external-db/types';

interface ExternalStatusRow {
  incident: string;
  sourceTable: string;
  normalizedStatus: string;
  statusDate: string | null;
  dateModified: string | null;
  worklogSummary: string | null;
  lastUpdateWorklog: string | null;
  sourceUpdatedAt: Date;
}

const UPSERT_CHUNK_SIZE = 50;

function trimTo(value: unknown, maxLen: number): string | null {
  if (value === null || value === undefined) return null;
  const str = String(value).trim();
  if (!str) return null;
  return str.length > maxLen ? str.slice(0, maxLen) : str;
}

function parseExternalDate(value: unknown): Date | null {
  if (!value) return null;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
}

function toResource(sourceTable: string): 'nossa' | 'nossa_closed' {
  if (sourceTable === 'nossa' || sourceTable === 'nossa_closed')
    return sourceTable;
  throw new Error(
    `[QosmicBridge] sourceTable tidak dikenal: "${sourceTable}" — harus "nossa" atau "nossa_closed"`,
  );
}

function rawToExternalStatusRow(
  rawRow: Record<string, unknown>,
  sourceTable: string,
): ExternalStatusRow | null {
  const normalized = normalizeExternalRow(
    rawRow as unknown as ExternalRow,
    sourceTable,
  ) as NormalizedExternalRow;

  const incident = trimTo(normalized.incident, 50);
  if (!incident) return null;

  return {
    incident,
    sourceTable,
    normalizedStatus: normalizeStatus(
      trimTo(normalized.status, 50) ?? undefined,
    ),
    statusDate: trimTo(normalized.status_date, 100),
    dateModified: trimTo(normalized.date_modified, 50),
    worklogSummary: trimTo(normalized.worklog_summary, 100),
    lastUpdateWorklog: trimTo(normalized.last_update_worklog, 100),
    sourceUpdatedAt: parseExternalDate(normalized.date_modified) ?? nowWib(),
  };
}

function hasChanged(
  existing: {
    status: string | null;
    status_date: string | null;
    date_modified: string | null;
    worklog_summary: string | null;
    last_update_worklog: string | null;
  },
  bridge: ExternalStatusRow,
): boolean {
  return (
    existing.status !== bridge.normalizedStatus ||
    existing.status_date !== bridge.statusDate ||
    existing.date_modified !== bridge.dateModified ||
    existing.worklog_summary !== bridge.worklogSummary ||
    existing.last_update_worklog !== bridge.lastUpdateWorklog
  );
}

async function fetchExistingFromTicketRaw(
  incidents: string[],
  sourceTable: string,
): Promise<
  Map<
    string,
    {
      status: string | null;
      status_date: string | null;
      date_modified: string | null;
      worklog_summary: string | null;
      last_update_worklog: string | null;
    }
  >
> {
  const map = new Map<
    string,
    {
      status: string | null;
      status_date: string | null;
      date_modified: string | null;
      worklog_summary: string | null;
      last_update_worklog: string | null;
    }
  >();
  if (incidents.length === 0) return map;

  const chunks: string[][] = [];
  for (let i = 0; i < incidents.length; i += 500) {
    chunks.push(incidents.slice(i, i + 500));
  }

  for (const chunk of chunks) {
    const rows = await prisma.ticket_raw.findMany({
      where: {
        incident: { in: chunk },
        sourceTable,
        isActive: true,
      },
      select: {
        incident: true,
        status: true,
        status_date: true,
        date_modified: true,
        worklog_summary: true,
        last_update_worklog: true,
      },
    });
    for (const row of rows) {
      if (!row.incident) continue;
      map.set(row.incident, {
        status: row.status,
        status_date: row.status_date,
        date_modified: row.date_modified,
        worklog_summary: row.worklog_summary,
        last_update_worklog: row.last_update_worklog,
      });
    }
  }

  return map;
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

async function upsertChangedRows(
  rows: ExternalStatusRow[],
  batchId: string,
): Promise<number> {
  if (rows.length === 0) return 0;
  let updated = 0;
  const now = nowWib();
  const today = todayWibDateForDb();

  for (const chunk of chunkArray(rows, UPSERT_CHUNK_SIZE)) {
    try {
      const values = chunk.map((row) =>
        Prisma.sql`(
          ${row.incident},
          ${row.normalizedStatus},
          ${row.statusDate},
          ${row.dateModified},
          ${row.worklogSummary},
          ${row.lastUpdateWorklog},
          ${row.sourceUpdatedAt},
          ${now},
          ${now},
          ${batchId},
          ${today},
          ${now},
          ${batchId}
        )`,
      );

      await prisma.$executeRaw`
        INSERT INTO ticket_raw
          (
            incident,
            status,
            status_date,
            date_modified,
            worklog_summary,
            last_update_worklog,
            sourceUpdatedAt,
            lastSeenAt,
            importedAt,
            syncBatchId,
            sync_date,
            synced_at,
            import_batch
          )
        VALUES ${Prisma.join(values)}
        ON DUPLICATE KEY UPDATE
          status = VALUES(status),
          status_date = VALUES(status_date),
          date_modified = VALUES(date_modified),
          worklog_summary = VALUES(worklog_summary),
          last_update_worklog = VALUES(last_update_worklog),
          sourceUpdatedAt = VALUES(sourceUpdatedAt),
          lastSeenAt = VALUES(lastSeenAt),
          importedAt = VALUES(importedAt),
          syncBatchId = VALUES(syncBatchId),
          syncVersion = syncVersion + 1,
          isActive = TRUE,
          sync_date = VALUES(sync_date),
          synced_at = VALUES(synced_at),
          import_batch = VALUES(import_batch)
      `;
      updated += chunk.length;
    } catch (error) {
      logger.error('[QosmicBridge] Upsert changed rows gagal', {
        error: error instanceof Error ? error.message : String(error),
        count: chunk.length,
      });
    }
  }

  return updated;
}

export async function fetchExternalRowsViaBridge(
  sourceTable: string,
  _incidents: string[],
): Promise<{ rows: Map<string, ExternalStatusRow>; changedCount: number }> {
  const mapped = new Map<string, ExternalStatusRow>();
  let changedCount = 0;

  if (!isQosmicBridgeConfigured()) {
    logger.error(
      '[QosmicBridge] Belum dikonfigurasi — status-refresh bridge dilewati',
      { sourceTable },
    );
    return { rows: mapped, changedCount: 0 };
  }

  const resource = toResource(sourceTable);
  const bridgeRows: ExternalStatusRow[] = [];

  logger.info('[QosmicBridge] Mulai paginated fetch untuk status refresh', {
    sourceTable,
    resource,
  });

  try {
    if (resource === 'nossa') {
      for await (const page of iterateNossaOpen()) {
        for (const rawRow of page) {
          const row = rawToExternalStatusRow(rawRow, sourceTable);
          if (row) bridgeRows.push(row);
        }
      }
    } else {
      for await (const page of iterateNossaClosedIncremental(7)) {
        for (const rawRow of page) {
          const row = rawToExternalStatusRow(rawRow, sourceTable);
          if (row) bridgeRows.push(row);
        }
      }
    }
  } catch (error) {
    logger.error('[QosmicBridge] Paginated fetch gagal', {
      sourceTable,
      error: error instanceof Error ? error.message : String(error),
    });
    return { rows: mapped, changedCount: 0 };
  }

  if (bridgeRows.length === 0) {
    logger.info('[QosmicBridge] Tidak ada data dari bridge', { sourceTable });
    return { rows: mapped, changedCount: 0 };
  }

  // Build full map for caller
  for (const row of bridgeRows) {
    mapped.set(row.incident, row);
  }

  // Batch-read existing values from ticket_raw
  const incidentList = [...mapped.keys()];
  const existingMap = await fetchExistingFromTicketRaw(incidentList, sourceTable);

  // Detect changes
  const changedRows: ExternalStatusRow[] = [];
  for (const row of bridgeRows) {
    const existing = existingMap.get(row.incident);
    if (!existing || hasChanged(existing, row)) {
      changedRows.push(row);
    }
  }

  // Upsert changed rows langsung ke ticket_raw
  const batchId = `bridge-refresh-${Date.now()}`;
  if (changedRows.length > 0) {
    const upserted = await upsertChangedRows(changedRows, batchId);
    changedCount = upserted;
    logger.info('[QosmicBridge] Status refresh bridge selesai', {
      sourceTable,
      totalFromBridge: bridgeRows.length,
      changed: changedRows.length,
      upserted,
    });
  } else {
    logger.info('[QosmicBridge] Tidak ada perubahan data bridge', {
      sourceTable,
      totalFromBridge: bridgeRows.length,
    });
  }

  return { rows: mapped, changedCount };
}
