import 'dotenv/config';
import { prisma } from '../app/libs/prisma';
import { testExternalConnection, getExternalPool, getTableNames } from '../lib/external-db/connection';
import { normalizeExternalRow, resolveIdentity, computeSourceHash, normalizeStatus } from '../lib/ingestion/normalizer';
import { nowWib, todayWibDateForDb } from '../lib/timezone';
import { randomUUID } from 'crypto';

async function main() {
  console.log('═══════════════════════════════════════════');
  console.log('  INGESTION TEST (Quick - 10 rows)');
  console.log('═══════════════════════════════════════════\n');

  // Step 1: Test connection
  console.log('[1] Testing External DB...');
  const connected = await testExternalConnection();
  console.log(`    ${connected ? '✅ Connected' : '❌ Not Connected'}\n`);
  if (!connected) process.exit(1);

  // Step 2: Fetch 10 rows from first table
  const tables = getTableNames();
  const tableName = tables[0];
  console.log(`[2] Fetching 10 rows from ${tableName}...\n`);

  const pool = getExternalPool();
  if (!pool) {
    console.error('❌ External DB pool not initialized');
    process.exit(1);
  }
  const [rows] = await pool.query(`SELECT * FROM \`${tableName}\` LIMIT 10`);

  console.log(`[3] ticket_raw count before: ${await prisma.ticket_raw.count()}\n`);

  // Step 3: Process rows manually
  const batchId = `test-${Date.now()}`;
  const now = nowWib();
  const syncDate = todayWibDateForDb();
  let inserted = 0, updated = 0, skipped = 0;

  for (const row of rows as any[]) {
    const normalized = normalizeExternalRow(row, tableName);
    const incident = resolveIdentity(normalized).primaryIdentity;
    if (!incident) continue;

    const sourceHash = computeSourceHash(row);

    const existing = await prisma.ticket_raw.findUnique({
      where: { incident },
      select: { id_ticket: true, sourceHash: true, syncVersion: true },
    });

    if (existing) {
      if (existing.sourceHash === sourceHash) {
        skipped++;
        continue;
      }
      await prisma.ticket_raw.update({
        where: { id_ticket: existing.id_ticket },
        data: {
          sourceHash,
          lastSeenAt: now,
          syncBatchId: batchId,
          syncVersion: { increment: 1 },
          isActive: true,
        },
      });
      updated++;
    } else {
      const data: Record<string, unknown> = {
        incident,
        sourceTable: tableName,
        sourceHash,
        lastSeenAt: now,
        syncBatchId: batchId,
        syncVersion: 1,
        isActive: true,
        importedAt: now,
        rawPayload: normalized._rawPayload,
        status: normalizeStatus(normalized.status),
      };

      for (const [key, value] of Object.entries(normalized)) {
        if (key.startsWith('_')) continue;
        if (value !== null && value !== undefined) {
          data[key] = value instanceof Date ? value.toISOString() : String(value);
        }
      }

      await prisma.ticket_raw.create({ data });
      inserted++;
    }
  }

  console.log('[4] Results:');
  console.log(`    Inserted: ${inserted}`);
  console.log(`    Updated:  ${updated}`);
  console.log(`    Skipped:  ${skipped}\n`);

  // Step 4: Verify
  console.log(`[5] ticket_raw count after: ${await prisma.ticket_raw.count()}\n`);

  // Step 5: Show sample
  const sample = await prisma.ticket_raw.findMany({
    where: { syncBatchId: batchId },
    take: 3,
    select: {
      id_ticket: true,
      incident: true,
      sourceTable: true,
      syncVersion: true,
      isActive: true,
      importedAt: true,
      description_actual_solution: true,
    },
  });

  if (sample.length > 0) {
    console.log('[6] Sample Records:');
    sample.forEach((r, i) => {
      console.log(`  ${i + 1}. ${r.incident}`);
      console.log(`     sourceTable:  ${r.sourceTable}`);
      console.log(`     syncVersion:  ${r.syncVersion}`);
      console.log(`     importedAt:   ${r.importedAt?.toISOString()}`);
      console.log(`     description_actual_solution: ${r.description_actual_solution?.slice(0, 50) || '(null)'}...`);
      console.log('');
    });
  }

  await prisma.$disconnect();
  console.log('✅ Test completed successfully!');
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
