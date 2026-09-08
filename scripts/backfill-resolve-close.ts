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

    // Long query timeout for bulk scan
    try {
      await prisma.$executeRaw`SET SESSION max_execution_time = 60000`;
    } catch {
      // MariaDB may use different variable - ignore
    }

    const batchSize = parseInt(process.env.BACKFILL_BATCH_SIZE || '500', 10);
    const limitArg = process.env.BACKFILL_LIMIT ? parseInt(process.env.BACKFILL_LIMIT, 10) : null;
    const dryRun = process.argv.includes('--dry-run');

    // Pre-count for logging
    const preCount = await prisma.$queryRaw<{ cnt: bigint }[]>`
      SELECT COUNT(*) as cnt FROM ticket
      WHERE resolve_date IS NOT NULL
        AND UPPER(TRIM(COALESCE(status, ''))) NOT IN (${Prisma.join(CLOSE_LIST)})
    `;
    const totalToFix = Number(preCount[0]?.cnt ?? 0);
    console.log(`[Backfill] Kandidat: ${totalToFix} tiket (resolve_date NOT NULL & status NOT IN close)`);
    if (dryRun) {
      console.log('[Backfill] --dry-run: tidak ada perubahan');
      return;
    }
    if (totalToFix === 0) {
      console.log('[Backfill] Tidak ada yang perlu di-stamp.');
      return;
    }

    let scanned = 0;
    let stamped = 0;
    let lastId = 0;

    while (!interrupted) {
      if (limitArg !== null && scanned >= limitArg) break;

      // Ambil chunk ids yang match kondisi, ordered by id_ticket
      const rows = await prisma.$queryRaw<{ id_ticket: number; closed_at: Date | null; resolve_date: Date | null }[]>`
        SELECT id_ticket, closed_at, resolve_date
        FROM ticket
        WHERE resolve_date IS NOT NULL
          AND UPPER(TRIM(COALESCE(status, ''))) NOT IN (${Prisma.join(CLOSE_LIST)})
          AND id_ticket > ${lastId}
        ORDER BY id_ticket ASC
        LIMIT ${batchSize}
      `;

      if (rows.length === 0) break;

      const ids = rows.map((r) => r.id_ticket);

      // Bulk update write-once: closed_at = COALESCE(closed_at, resolve_date)
      const result = await prisma.$executeRaw`
        UPDATE ticket
        SET status = 'RESOLVED',
            status_update = 'close',
            closed_at = COALESCE(closed_at, resolve_date)
        WHERE id_ticket IN (${Prisma.join(ids)})
      `;

      const affected = Number(result);
      scanned += rows.length;
      stamped += affected;
      lastId = ids[ids.length - 1]!;
      console.log(`[Backfill] ${stamped}/${totalToFix} stamped (chunk ${rows.length}, affected ${affected}, last id ${lastId})`);

      if (rows.length < batchSize) break;

      // yield to event loop
      await new Promise((r) => setImmediate(r));
    }

    console.log('\n=== BACKFILL RESULT ===');
    console.log(`Stamped RESOLVED/close: ${stamped}`);
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
