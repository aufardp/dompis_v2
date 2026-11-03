import { Prisma } from '@prisma/client';
import type { ExternalRow, NormalizedExternalRow } from '@/lib/external-db/types';
import { computeSourceHash, normalizeExternalRow } from './normalizer';

export const PILOTING_COMPLEMENT_FIELDS = new Set([
  'contact_phone', 'contact_name', 'contact_email', 'street_address',
  'customer_name', 'service_no', 'workzone', 'witel',
]);

export function sourceFamily(resource: string): string {
  return resource === 'nossa' || resource === 'nossa_closed' ? 'qosmic' : resource;
}

export function mergeSourcePayloads(
  primary: Record<string, unknown>,
  supplement: Record<string, unknown>,
): Record<string, unknown> {
  const merged = { ...primary };
  for (const field of PILOTING_COMPLEMENT_FIELDS) {
    if (merged[field] == null && supplement[field] != null) merged[field] = supplement[field];
  }
  return merged;
}

export function sourceTimestamp(value: unknown): Date | null {
  if (!value) return null;
  const text = String(value).trim().replace(' ', 'T');
  const parsed = new Date(/(?:Z|[+-]\d{2}:?\d{2})$/i.test(text) ? text : `${text}+07:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function snapshotDecision(
  previous: { sourceHash: string; sourceUpdatedAt: Date | null } | undefined,
  hash: string,
  timestamp: Date | null,
): 'accept' | 'unchanged' | 'stale' | 'ambiguous' {
  if (!previous) return 'accept';
  if (previous.sourceHash === hash) return 'unchanged';
  if (previous.sourceUpdatedAt && timestamp) {
    if (timestamp < previous.sourceUpdatedAt) return 'stale';
    if (timestamp > previous.sourceUpdatedAt) return 'accept';
  }
  return 'ambiguous';
}

function payloadOf(row: NormalizedExternalRow): Record<string, unknown> {
  return Object.fromEntries(Object.entries(row).filter(([key]) => !key.startsWith('_')));
}

export async function prepareSourceSnapshots(
  tx: Prisma.TransactionClient,
  rows: NormalizedExternalRow[],
  resource: string,
  legacyOwners: Map<string, { sourceTable?: string | null }>,
): Promise<{
  rows: NormalizedExternalRow[];
  skipped: number;
  conflicts: Array<{ row: NormalizedExternalRow; reason: string }>;
}> {
  const incidents = [...new Set(rows.map(row => String(row.incident)))];
  const snapshots = await tx.ticket_source_snapshot.findMany({ where: { incident: { in: incidents } } });
  const byKey = new Map(snapshots.map(snapshot => [`${snapshot.incident}:${snapshot.sourceFamily}`, snapshot]));
  const family = sourceFamily(resource);
  const accepted: NormalizedExternalRow[] = [];
  const conflicts: Array<{ row: NormalizedExternalRow; reason: string }> = [];
  let skipped = 0;
  const writes: Array<Prisma.ticket_source_snapshotCreateManyInput> = [];
  const observed: string[] = [];

  for (const input of rows) {
    const incident = String(input.incident);
    const previous = byKey.get(`${incident}:${family}`);
    const previousPayload = (previous?.payload ?? {}) as Record<string, unknown>;
    const payload = { ...previousPayload, ...payloadOf(input) };
    const normalized = normalizeExternalRow(payload as ExternalRow, resource);
    const hash = computeSourceHash(normalized);
    const timestamp = sourceTimestamp(payload.date_modified);
    const decision = snapshotDecision(previous, hash, timestamp);
    if (decision === 'stale') { skipped++; continue; }
    if (decision === 'ambiguous') {
      conflicts.push({ row: input, reason: 'source_order_ambiguous: changed payload without a newer source timestamp' });
      continue;
    }
    const snapshot = {
      incident, sourceFamily: family, resource, sourceHash: hash,
      sourceUpdatedAt: timestamp, payload: payload as Prisma.InputJsonObject, observedAt: new Date(),
    };
    if (decision === 'accept' || previous?.resource !== resource) writes.push(snapshot);
    else observed.push(incident);
    byKey.set(`${incident}:${family}`, snapshot as typeof snapshots[number]);
    const primary = byKey.get(`${incident}:qosmic`);
    const supplement = byKey.get(`${incident}:piloting_tickets`);
    if (!primary && sourceFamily(legacyOwners.get(incident)?.sourceTable ?? '') === 'qosmic') {
      skipped++;
      continue;
    }
    const effectiveResource = primary?.resource ?? resource;
    const supplementPayload = (supplement?.payload ?? {}) as Record<string, unknown>;
    const maxAge = Math.max(1000, Number(process.env.PILOTING_COMPLEMENT_MAX_AGE_MS) || 900000);
    const freshSupplement = supplement && Date.now() - supplement.observedAt.getTime() <= maxAge;
    const effective = primary
      ? mergeSourcePayloads(primary.payload as Record<string, unknown>, freshSupplement ? supplementPayload : {})
      : payload;
    if (primary && supplement && !freshSupplement) {
      for (const field of PILOTING_COMPLEMENT_FIELDS) {
        if ((primary.payload as Record<string, unknown>)[field] == null && Object.hasOwn(supplementPayload, field)) effective[field] = null;
      }
    }
    accepted.push(normalizeExternalRow(effective as ExternalRow, effectiveResource));
  }

  if (writes.length > 0) {
    await tx.ticket_source_snapshot.createMany({
      data: writes,
      skipDuplicates: true,
    });
    // For ON DUPLICATE KEY UPDATE with specific update logic, a simple createMany(skipDuplicates:true)
    // might not be enough. If more complex update logic is needed, a batch upsert with
    // a loop or a direct raw SQL update for duplicates might be required.
    // For now, assuming skipDuplicates is acceptable as it prevents panics.
    // Additional logic to handle updates on conflict might be needed if primary keys match and data differs.
    // For this specific case (source-snapshots), it is expected that if a key exists,
    // the existing entry is updated, or if 'skipDuplicates:true' means that if it exists, nothing is updated.
    // Given the previous raw query, it was an upsert, so let's use separate update if skipDuplicates doesn't update.
    // A better solution would be to fetch existing, compare, then create/update,
    // or use a different upsert strategy if createMany + skipDuplicates doesn't fit the original logic.
    // For now, prioritize fixing the panic.
    for (const row of writes) {
        await tx.ticket_source_snapshot.upsert({
            where: {
                incident_sourceFamily: {
                    incident: row.incident,
                    sourceFamily: row.sourceFamily,
                },
            },
            update: {
                resource: row.resource,
                sourceHash: row.sourceHash,
                sourceUpdatedAt: row.sourceUpdatedAt,
                payload: row.payload,
                observedAt: row.observedAt,
            },
            create: row,
        });
    }

  }
  if (observed.length > 0) {
    await tx.$executeRaw`UPDATE ticket_source_snapshot SET observedAt = UTC_TIMESTAMP(3)
      WHERE sourceFamily = ${family} AND incident IN (${Prisma.join(observed)})
        AND observedAt < TIMESTAMPADD(SECOND, -60, UTC_TIMESTAMP(3))`;
  }
  return { rows: accepted, skipped, conflicts };
}
