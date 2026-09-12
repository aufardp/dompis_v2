import 'dotenv/config';
// Bulk socket timeout must be raised before prisma client is constructed —
// default 60s kills chunk scan even with MAX_EXECUTION_TIME(0) hint.
process.env.PRISMA_SOCKET_TIMEOUT = process.env.PRISMA_SOCKET_TIMEOUT ?? '120';
process.env.PRISMA_SOCKET_TIMEOUT_BULK = process.env.PRISMA_SOCKET_TIMEOUT_BULK ?? '120';
process.env.PRISMA_POOL_TIMEOUT = process.env.PRISMA_POOL_TIMEOUT ?? '60';
import fs from 'fs';
import path from 'path';
import { connectDB, prisma, prismaBulk } from '@/app/libs/prisma';
import { parseWIBDateInput } from '@/app/utils/datetime';

/**
 * Fase 1 migrasi reported_date VARCHAR -> DATETIME (lihat migration
 * 20260912030000_add_reported_date_dt dan lib/projection/index.ts).
 *
 * Mengisi kolom baru `ticket.reported_date_dt` untuk baris LAMA (yang
 * projection-nya sudah lewat sebelum kolom ini ada). Baris baru sudah
 * otomatis terisi lewat buildProjectionUpsert; script ini hanya untuk
 * catch-up data historis.
 *
 * Parsing pakai parseWIBDateInput yang sama dipakai projection — hasilnya
 * konsisten dengan apa yang akan ditulis untuk tiket baru. Baris yang
 * gagal parse di-set NULL (bukan menghentikan seluruh backfill) dan
 * incident-nya dicatat ke file JSON untuk ditinjau manual (keputusan
 * eksplisit user, bukan default yang saya asumsikan).
 *
 * Pola chunked-by-id mengikuti scripts/backfill-resolve-close.ts.
 */

async function main() {
  console.log('[Backfill] Mengisi reported_date_dt dari reported_date (VARCHAR)...\n');

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

    const scanBatch = parseInt(process.env.BACKFILL_SCAN_BATCH_SIZE || '2000', 10);
    const updateBatch = parseInt(process.env.BACKFILL_BATCH_SIZE || '500', 10);
    const limitArg = process.env.BACKFILL_LIMIT ? parseInt(process.env.BACKFILL_LIMIT, 10) : null;
    const dryRun = process.argv.includes('--dry-run');

    if (dryRun) {
      // Estimate saja — hindari COUNT(*) full-scan yang bisa timeout;
      // cukup scan PK sekali untuk kasih gambaran ukuran pekerjaan.
      const sample = await prismaBulk.$queryRawUnsafe<{ cnt: bigint }[]>(
        `SELECT /*+ MAX_EXECUTION_TIME(0) */ COUNT(*) as cnt FROM ticket WHERE reported_date IS NOT NULL AND reported_date_dt IS NULL`,
      );
      console.log(`[Backfill] Kandidat (estimate): ${Number(sample[0]?.cnt ?? 0)} tiket`);
      console.log('[Backfill] --dry-run: tidak ada perubahan');
      return;
    }

    let scanned = 0;
    let updated = 0;
    let nulled = 0;
    let lastId = 0;
    const failures: Array<{ id_ticket: number; incident: string; reported_date: string }> = [];

    while (!interrupted) {
      if (limitArg !== null && scanned >= limitArg) break;

      // Scan PK only — tanpa fungsi apa pun di WHERE, pakai PRIMARY, tak
      // pernah timeout. reported_date_dt IS NULL cukup murah (kolom baru,
      // selalu NULL sampai baris ini di-backfill atau di-projection ulang).
      const candidates = await prismaBulk.$queryRawUnsafe<
        { id_ticket: number; incident: string; reported_date: string | null }[]
      >(
        `SELECT /*+ MAX_EXECUTION_TIME(0) */ id_ticket, incident, reported_date
         FROM ticket
         WHERE id_ticket > ? AND reported_date_dt IS NULL
         ORDER BY id_ticket ASC LIMIT ?`,
        lastId,
        scanBatch,
      );

      if (candidates.length === 0) break;

      lastId = candidates[candidates.length - 1]!.id_ticket;
      scanned += candidates.length;

      const withDate = candidates.filter((r) => r.reported_date !== null);

      if (withDate.length > 0) {
        const chunks: typeof withDate[] = [];
        for (let i = 0; i < withDate.length; i += updateBatch) {
          chunks.push(withDate.slice(i, i + updateBatch));
        }

        for (const chunk of chunks) {
          const parsed = chunk.map((row) => {
            const dt = parseWIBDateInput(row.reported_date);
            if (!dt) {
              failures.push({
                id_ticket: row.id_ticket,
                incident: row.incident,
                reported_date: row.reported_date ?? '',
              });
            }
            return { id_ticket: row.id_ticket, dt };
          });

          // UPDATE ... SET reported_date_dt = CASE id_ticket WHEN ? THEN ? ... END
          // WHERE id_ticket IN (...) — satu round-trip per chunk, nilai
          // beda-beda per baris (bukan value tunggal untuk semua baris).
          const caseParts = parsed.map(() => 'WHEN ? THEN ?').join(' ');
          const caseParams = parsed.flatMap((p) => [p.id_ticket, p.dt]);
          const ids = parsed.map((p) => p.id_ticket);

          const result = await prismaBulk.$executeRawUnsafe(
            `UPDATE /*+ MAX_EXECUTION_TIME(0) */ ticket
             SET reported_date_dt = CASE id_ticket ${caseParts} END
             WHERE id_ticket IN (${ids.map(() => '?').join(',')})`,
            ...caseParams,
            ...ids,
          );
          updated += Number(result);
          nulled += parsed.filter((p) => p.dt === null).length;
        }
      }

      console.log(
        `[Backfill] updated ${updated} (nulled ${nulled}), scanned ${scanned}, last id ${lastId}`,
      );

      if (candidates.length < scanBatch) break;
      await new Promise((r) => setImmediate(r));
    }

    console.log('\n=== BACKFILL RESULT ===');
    console.log(`Baris diproses: ${updated} (scanned ${scanned})`);
    console.log(`Gagal parse (di-set NULL): ${nulled}`);
    if (failures.length > 0) {
      const outPath = path.join(process.cwd(), 'reported-date-backfill-failures.json');
      fs.writeFileSync(outPath, JSON.stringify(failures, null, 2));
      console.log(`Daftar incident yang gagal parse ditulis ke: ${outPath}`);
    }
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
