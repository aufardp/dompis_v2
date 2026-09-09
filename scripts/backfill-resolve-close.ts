import 'dotenv/config';
// Bulk socket timeout must be raised before prisma client is constructed —
// default 60s kills chunk scan even with MAX_EXECUTION_TIME(0) hint.
process.env.PRISMA_SOCKET_TIMEOUT = process.env.PRISMA_SOCKET_TIMEOUT ?? '120';
process.env.PRISMA_SOCKET_TIMEOUT_BULK = process.env.PRISMA_SOCKET_TIMEOUT_BULK ?? '120';
process.env.PRISMA_POOL_TIMEOUT = process.env.PRISMA_POOL_TIMEOUT ?? '60';
import { connectDB, prisma, prismaBulk } from '@/app/libs/prisma';
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

    // Disable MySQL max_execution_time for this session — dashboard caps (30s) kill
    // the full scan. Use both hint + SET; hint is authoritative per-connection.
    for (const client of [prisma, prismaBulk] as const) {
      for (const sql of [
        'SET SESSION max_execution_time = 0',
        'SET SESSION MAX_EXECUTION_TIME = 0',
      ] as const) {
        try {
          await client.$executeRawUnsafe(sql);
        } catch {}
      }
    }

    const batchSize = parseInt(process.env.BACKFILL_BATCH_SIZE || '500', 10);
    const scanBatch = parseInt(process.env.BACKFILL_SCAN_BATCH_SIZE || '2000', 10);
    const limitArg = process.env.BACKFILL_LIMIT ? parseInt(process.env.BACKFILL_LIMIT, 10) : null;
    const dryRun = process.argv.includes('--dry-run');

    // No COUNT: COUNT(*) with UPPER(TRIM(...)) full-scans and hits socket_timeout
    // even with MAX_EXECUTION_TIME(0) (see P2010 60s). Scan PK instead.
    let totalToFix: number | null = null;
    if (!dryRun) {
      console.log('[Backfill] Kandidat: scan PK tanpa COUNT (hindari full-scan timeout)');
    } else {
      try {
        const preCount = await prismaBulk.$queryRawUnsafe<{ cnt: bigint }[]>(
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

    const CLOSE_SET = new Set(CLOSE_LIST);

    while (!interrupted) {
      if (limitArg !== null && scanned >= limitArg) break;

      // Scan PK only — no function on status, uses PRIMARY, never times out.
      // Filter resolve_date + CLOSE status in JS; update only matching ids.
      const candidates = await prismaBulk.$queryRawUnsafe<
        { id_ticket: number; status: string | null; closed_at: Date | null; resolve_date: Date | null }[]
      >(
        `SELECT /*+ MAX_EXECUTION_TIME(0) */ id_ticket, status, closed_at, resolve_date FROM ticket WHERE id_ticket > ? ORDER BY id_ticket ASC LIMIT ?`,
        lastId,
        scanBatch,
      );

      if (candidates.length === 0) break;

      // Track PK progress even if no match in this chunk
      lastId = candidates[candidates.length - 1]!.id_ticket;
      scanned += candidates.length;

      const rows = candidates.filter(
        (r) => r.resolve_date !== null && !CLOSE_SET.has(String(r.status ?? '').trim().toUpperCase()),
      );

      if (rows.length === 0) {
        if (candidates.length < scanBatch) break;
        // yield and continue scanning
        await new Promise((r) => setImmediate(r));
        continue;
      }

      const ids = rows.map((r) => r.id_ticket);

      // Bulk update write-once: closed_at = COALESCE(closed_at, resolve_date)
      // Chunk update IN to avoid huge IN clause
      const updateChunks: number[][] = [];
      for (let i = 0; i < ids.length; i += batchSize) updateChunks.push(ids.slice(i, i + batchSize));
      let affectedTotal = 0;
      for (const chunk of updateChunks) {
        const result = await prismaBulk.$executeRawUnsafe(
          `UPDATE /*+ MAX_EXECUTION_TIME(0) */ ticket SET status = 'RESOLVED', status_update = 'close', closed_at = COALESCE(closed_at, resolve_date) WHERE id_ticket IN (${chunk.map(() => '?').join(',')})`,
          ...chunk,
        );
        affectedTotal += Number(result);
      }

      stamped += affectedTotal;
      const totalLabel = totalToFix !== null ? `${stamped}/${totalToFix}` : `${stamped}`;
      console.log(`[Backfill] ${totalLabel} stamped (matched ${rows.length}/${candidates.length}, scanned ${scanned}, affected ${affectedTotal}, last id ${lastId})`);

      if (candidates.length < scanBatch) break;

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
    await Promise.allSettled([prisma.$disconnect(), prismaBulk.$disconnect()]);
    console.log('[Backfill] Done');
    process.exit(0);
  }
}

main();
