import 'dotenv/config';
import { connectDB, prisma } from '@/app/libs/prisma';
import { Prisma } from '@prisma/client';

/**
 * Stamp tiket lama ke keadaan "selesai" saat `resolve_date` (stop-clock TTR dari
 * Nossa) sudah terisi tapi `status` belum masuk CLOSE_STATUS_VALUES:
 *   status        → 'RESOLVED'
 *   status_update → 'close'
 *   closed_at     → COALESCE(closed_at, resolve_date)  (write-once)
 *
 * Projection skip baris yang tak berubah (shouldSkipProjection), jadi baris lama
 * perlu di-koreksi lewat script ini. Setelahnya jalankan `npm run backfill:ttr-comply`
 * untuk menghitung ttr_comply_status baris yang baru jadi close.
 *
 * Pola chunked-by-id mirip scripts/backfill-ttr-comply.ts.
 * Filter pakai UPPER(TRIM(COALESCE(status,''))) agar case/whitespace robust,
 * bukan Prisma notIn yang case-sensitive.
 */
const CLOSE_LIST = ['CLOSED', 'CLOSE', 'FINALCHECK', 'MEDIACARE', 'SALAMSIM', 'RESOLVED'];

async function main() {
  console.log('[Backfill] Stamp close dari resolve_date...\n');

  let interrupted = false;
  const onSignal = () => {
    console.log('\n[Backfill] Interrupted, finishing current chunk...');
    interrupted = true;
  };
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);

  try {
    await connectDB();
    console.log('[Backfill] Database connected');

    // Disable timeout for backfill — COUNT + chunk scans can exceed dashboard 30s.
    // Use hint MAX_EXECUTION_TIME(0) + SET SESSION 0; SET may not affect pooled $queryRaw conn,
    // so hint is authoritative.
    for (const sql of [
      'SET SESSION max_execution_time = 0',
      'SET SESSION MAX_EXECUTION_TIME = 0',
    ] as const) {
      try {
        await prisma.$executeRawUnsafe(sql);
      } catch {}
    }

    const batchSize = parseInt(process.env.BACKFILL_BATCH_SIZE || '500', 10);
    const limitArg = process.env.BACKFILL_LIMIT ? parseInt(process.env.BACKFILL_LIMIT, 10) : null;
    const dryRun = process.argv.includes('--dry-run');

    // No pre-count: COUNT(*) with UPPER(TRIM(...)) full-scans and times out at 60s
    // under load (see P2010 at 13:48). Enumerate directly via PK chunks.
    let totalToFix: number | null = null;
    if (!dryRun) {
      console.log('[Backfill] Kandidat: hitung via chunk scan (tanpa COUNT agar tidak timeout)');
    } else {
      // dry-run: quick estimate with unlimited timeout hint, best-effort
      try {
        const preCount = await prisma.$queryRawUnsafe<{ cnt: bigint }[]>(
          `SELECT /*+ MAX_EXECUTION_TIME(0) */ COUNT(*) as cnt FROM ticket WHERE resolve_date IS NOT NULL AND UPPER(TRIM(COALESCE(status, ''))) NOT IN (${CLOSE_LIST.map(() => '?').join(',')})`,
          ...CLOSE_LIST,
        );
        totalToFix = Number(preCount[0]?.cnt ?? 0);
      } catch {
        totalToFix = null;
      }
      console.log(`[Backfill] Kandidat (estimate): ${totalToFix ?? 'unknown'} tiket`);
      console.log('[Backfill] --dry-run: tidak ada perubahan');
      if (totalToFix === 0) {
        console.log('[Backfill] Tidak ada yang perlu di-stamp.');
        return;
      }
      return;
    }

    let scanned = 0;
    let stamped = 0;
    let lastId = 0;

    while (!interrupted) {
      if (limitArg !== null && scanned >= limitArg) break;

      // Chunk via PK — hint MAX_EXECUTION_TIME(0) so 60s dashboard cap doesn't kill it.
      // Keep UPPER(TRIM(...)) for correctness (case/space); PK order + resolve_date IS NOT NULL
      // still hits PRIMARY quickly; full table scan only if many rows have resolve_date.
      const rows = await prisma.$queryRawUnsafe<{ id_ticket: number; closed_at: Date | null; resolve_date: Date | null }[]>(
        `SELECT /*+ MAX_EXECUTION_TIME(0) */ id_ticket, closed_at, resolve_date FROM ticket WHERE resolve_date IS NOT NULL AND UPPER(TRIM(COALESCE(status, ''))) NOT IN (${CLOSE_LIST.map(() => '?').join(',')}) AND id_ticket > ? ORDER BY id_ticket ASC LIMIT ?`,
        ...CLOSE_LIST,
        lastId,
        batchSize,
      );

      if (rows.length === 0) break;

      const ids = rows.map((r) => r.id_ticket);

      // Bulk update write-once: closed_at = COALESCE(closed_at, resolve_date)
      const result = await prisma.$executeRawUnsafe(
        `UPDATE /*+ MAX_EXECUTION_TIME(0) */ ticket SET status = 'RESOLVED', status_update = 'close', closed_at = COALESCE(closed_at, resolve_date) WHERE id_ticket IN (${ids.map(() => '?').join(',')})`,
        ...ids,
      );

      const affected = Number(result);
      scanned += rows.length;
      stamped += affected;
      lastId = ids[ids.length - 1]!;
      const totalLabel = totalToFix !== null ? `${stamped}/${totalToFix}` : `${stamped}`;
      console.log(`[Backfill] ${totalLabel} stamped (chunk ${rows.length}, affected ${affected}, last id ${lastId})`);

      if (rows.length < batchSize) break;

      // yield to event loop
      await new Promise((r) => setImmediate(r));
    }

    console.log('\n=== BACKFILL RESULT ===');
    console.log(`Stamped RESOLVED/close: ${stamped} (scanned ${scanned})`);
    if (stamped > 0) console.log('Jalankan: npm run backfill:ttr-comply');
    console.log('========================\n');
  } catch (error) {
    console.error('[Backfill] Fatal error:', error);
    process.exit(1);
  } finally {
    process.off('SIGINT', onSignal);
    process.off('SIGTERM', onSignal);
    await prisma.$disconnect();
    console.log('[Backfill] Done');
    process.exit(0);
  }
}

main();
