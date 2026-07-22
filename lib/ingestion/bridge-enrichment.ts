import { prisma } from '@/app/libs/prisma';
import { Prisma } from '@prisma/client';
import { RowDataPacket } from 'mysql2';
import { getExternalPool } from '../external-db/connection';
import { normalizeExternalRow } from './normalizer';
import type { ExternalRow } from '../external-db/types';
import { logger } from '@/lib/observability/logger';
const ENRICHMENT_BATCH_SIZE = parsePositiveIntEnv(
  'INGESTION_ENRICHMENT_BATCH_SIZE',
  2000,
);

// Fields that bridge cannot fill — enrichment targets from piloting_tickets.
// These are non-BRIDGE_FIELDS from FIELDS_TO_MAP (minus 'incident').
function formatError(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  try { return JSON.stringify(error); } catch { return String(error); }
}

const ENRICHMENT_FIELDS = [
  'ttr_customer',
  'contact_phone',
  'contact_name',
  'subsidiary',
  'lapul',
  'onu_rx',
  'pending_reason',
  'hierarchy_path',
  'kode_produk',
  'perangkat',
  'classification_flag',
  'related_to_gamas',
  'note',
  'sn_ont',
  'tipe_ont',
  'manufacture_ont',
  'notes_eskalasi',
  'external_ticket_tier_3',
  'customer_category',
  'classification_path',
  'teritory_near_end',
  'teritory_far_end',
  'urgency',
  'urgency_description',
  'street_address',
];

const COLUMN_SIZES: Record<string, number> = {
  ttr_customer: 100,
  contact_phone: 50,
  contact_name: 100,
  subsidiary: 100,
  lapul: 10,
  onu_rx: 10,
  pending_reason: 1000,
  hierarchy_path: 100,
  kode_produk: 50,
  perangkat: 100,
  classification_flag: 20,
  related_to_gamas: 10,
  note: 255,
  sn_ont: 30,
  tipe_ont: 20,
  manufacture_ont: 20,
  notes_eskalasi: 255,
  external_ticket_tier_3: 50,
  customer_category: 50,
  classification_path: 100,
  teritory_near_end: 50,
  teritory_far_end: 50,
  urgency: 20,
  urgency_description: 100,
  street_address: 500,
};

function parsePositiveIntEnv(name: string, fallback: number): number {
  const value = Number.parseInt(process.env[name] || '', 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function sqlIdentifier(identifier: string): Prisma.Sql {
  if (!/^[A-Za-z0-9_]+$/.test(identifier)) {
    throw new Error(`Unsafe SQL identifier: ${identifier}`);
  }
  return Prisma.raw(`\`${identifier}\``);
}

export interface EnrichmentResult {
  scanned: number;
  enriched: number;
}

export async function runBridgeEnrichment(
  batchId: string,
  signal?: AbortSignal,
): Promise<EnrichmentResult> {
  if (process.env.INGESTION_ENRICHMENT_ENABLED === 'false') {
    return { scanned: 0, enriched: 0 };
  }

  const result: EnrichmentResult = { scanned: 0, enriched: 0 };

  logger.info('[Enrichment] Starting bridge enrichment', { batchId });

  const externalPool = getExternalPool();
  if (!externalPool) {
    logger.warn('[Enrichment] External DB pool not available', { batchId });
    return result;
  }

  // 1. Fetch bridge rows needing enrichment from ticket_raw
  let rawRows: Array<{ incident: string }>;
  try {
    rawRows = await prisma.$queryRaw<Array<{ incident: string }>>`
      SELECT incident
      FROM ticket_raw
      WHERE sourceTable IN ('nossa', 'nossa_closed')
        AND contact_phone IS NULL
        AND isActive = 1
        AND incident IS NOT NULL
      LIMIT ${ENRICHMENT_BATCH_SIZE}
    `;
  } catch (error) {
    logger.error('[Enrichment] Fetch ticket_raw enrichment candidates failed', {
      batchId,
      errorMessage: formatError(error),
    });
    return result;
  }

  result.scanned = rawRows.length;
  if (rawRows.length === 0) {
    logger.info('[Enrichment] No bridge rows need enrichment', { batchId });
    return result;
  }

  const rawIncidents = rawRows.map((r) => r.incident).filter(Boolean);

  // 2. Fetch matching enrichment data from piloting_tickets (direct external pool, no COLLATE)
  const placeholders = rawIncidents.map(() => '?').join(',');
  let rows: RowDataPacket[];
  try {
    [rows] = await externalPool.query<RowDataPacket[]>(
      `SELECT * FROM piloting_tickets WHERE incident IN (${placeholders})`,
      rawIncidents,
    );
  } catch (error) {
    logger.error('[Enrichment] Query piloting_tickets enrichment data failed', {
      batchId,
      count: rawIncidents.length,
      errorMessage: formatError(error),
    });
    return result;
  }

  if (rows.length === 0) {
    logger.info('[Enrichment] No piloting_tickets rows found for enrichment incidents', {
      batchId,
      count: rawIncidents.length,
    });
    return result;
  }

  // 3. Normalize and build enrichment payloads (non-BRIDGE_FIELDS only)
  const updates: Array<{ incident: string; data: Record<string, unknown> }> = [];

  for (const row of rows) {
    if (signal?.aborted) return result;
    try {
      const normalized = normalizeExternalRow(
        row as unknown as ExternalRow,
        'piloting_tickets',
      );
      if (!normalized.incident) continue;

      const data: Record<string, unknown> = {};
      for (const field of ENRICHMENT_FIELDS) {
        const value = normalized[field as keyof typeof normalized];
        if (value !== null && value !== undefined && value !== '') {
          const str = String(value);
          const maxLen = COLUMN_SIZES[field];
          data[field] = maxLen ? str.slice(0, maxLen) : str;
        }
      }

      if (Object.keys(data).length > 0) {
        updates.push({ incident: normalized.incident, data });
      }
    } catch (error) {
      logger.warn('[Enrichment] Normalize row failed', {
        incident: String(row?.incident ?? 'unknown'),
        errorMessage: formatError(error),
      });
    }
  }

  if (updates.length === 0) return result;

  // 4. Bulk upsert — INSERT ... ON DUPLICATE KEY UPDATE
  // Only touches ENRICHMENT_FIELDS (non-BRIDGE_FIELDS), preserves source_system
  const columns = ['incident', ...ENRICHMENT_FIELDS];
  const updateFields = ENRICHMENT_FIELDS;

  try {
    await prisma.$executeRaw`
      INSERT INTO ticket_raw (${Prisma.join(columns.map((c) => sqlIdentifier(c)))})
      VALUES ${Prisma.join(
        updates.map(
          (u) => Prisma.sql`(${Prisma.join(
            columns.map((c) =>
              c === 'incident' ? u.incident : (u.data[c] ?? null),
            ),
          )})`,
        ),
      )}
      ON DUPLICATE KEY UPDATE ${Prisma.join(
        updateFields.map(
          (f) =>
            Prisma.sql`${sqlIdentifier(f)} = VALUES(${sqlIdentifier(f)})`,
        ),
      )}
    `;

    result.enriched = updates.length;
  } catch (error) {
    logger.error('[Enrichment] Batch upsert failed', {
      batchId,
      updates: updates.length,
      errorMessage: formatError(error),
    });
  }

  if (result.enriched > 0) {
    logger.info('[Enrichment] Bridge rows enriched from piloting_tickets', {
      batchId,
      scanned: result.scanned,
      enriched: result.enriched,
    });
  }

  return result;
}
