import 'dotenv/config';
// Bulk socket timeout harus dinaikkan sebelum PrismaClient dibuat — default 60s
// bisa membunuh UPDATE batch besar.
process.env.PRISMA_SOCKET_TIMEOUT = process.env.PRISMA_SOCKET_TIMEOUT ?? '120';
process.env.PRISMA_SOCKET_TIMEOUT_BULK =
  process.env.PRISMA_SOCKET_TIMEOUT_BULK ?? '120';
process.env.PRISMA_POOL_TIMEOUT = process.env.PRISMA_POOL_TIMEOUT ?? '60';
import { connectDB, prisma, prismaBulk } from '@/app/libs/prisma';
import { batchClassifyJenisFromVlookup } from '@/lib/classify-jenis-vlookup';

/**
 * Backfill jenis tiket PREMAN.
 *
 * Menetapkan jenis_tiket_1 = 'PREMAN' dan jenis_tiket_2 = 'PREMAN' pada
 * tiket yang summary-nya mengandung kata "preman", sesuai aturan yang sudah
 * dipakai classifier saat ini (checkPremanOverride di
 * lib/classify-jenis-vlookup.ts).
 *
 * PENTING: script ini tidak menebak klasifikasinya sendiri. Ia memanggil
 * batchClassifyJenisFromVlookup — classifier yang sama dengan yang dipakai
 * projection — sehingga hasilnya dijamin identik dengan apa yang akan
 * ditulisProjection untuk tiket baru. Override berurutan (GAMAS menang atas
 * PREMAN, dst) otomatis dihormati tanpa kode duplikat di sini.
 *
 * Kolom TTR ikut dibersihkan: PREMAN termasuk jenis netral, dan
 * getComplyMaxTtrHours() mengembalikan null untuk netral — jadi
 * ttr_comply_status/ttr_deadline_at harus NULL. Kalau tidak, akan ada tiket
 * bertanda PREMAN yang masih reported "comply" (index idx_ticket_ttr_comply
 * akan ikut mencountex).
 *
 * operational_bucket SENGAJA tidak disentuh: itu kolom STORED GENERATED,
 * MySQL yang menghitung ulang sendiri saat jenis_tiket_2 berubah.
 */

type CandidateRow = {
  id_ticket: number;
  incident: string | null;
  summary: string | null;
  symptom: string | null;
  customer_segment: string | null;
  customer_type: string | null;
  classification_path: string | null;
  channel: string | null;
  service_type: string | null;
  service_no: string | null;
  source_ticket: string | null;
  realm: string | null;
  jenis_tiket_1: string | null;
  jenis_tiket_2: string | null;
  ttr_comply_status: string | null;
  c_description_serviceid: string | null;
};

async function main() {
  console.log('[Backfill-Preman] Menetapkan jenis PREMAN dari kata "preman" di summary\n');

  let interrupted = false;
  const onSignal = () => {
    console.log('\n[Backfill-Preman] Interrupted, menyelesaikan chunk berjalan...');
    interrupted = true;
  };
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);

  try {
    await connectDB();
    for (const client of [prisma, prismaBulk] as const) {
      await client.$executeRawUnsafe('SET SESSION max_execution_time = 0').catch(() => {});
    }
    console.log('[Backfill-Preman] Database connected');

    const scanBatch = Number.parseInt(
      process.env.BACKFILL_SCAN_BATCH_SIZE || '1000',
      10,
    );
    const updateBatch = Number.parseInt(
      process.env.BACKFILL_BATCH_SIZE || '200',
      10,
    );
    const limitArg = process.env.BACKFILL_LIMIT
      ? Number.parseInt(process.env.BACKFILL_LIMIT, 10)
      : null;
    const dryRun = process.argv.includes('--dry-run');

    // Pre-filter murah di SQL. REGEXP ini longgar (hanya "mengandung preman")
    // — keputusan_final tetap dibuat regex di lib/classify-jenis-vlookup.ts,
    // supaya tidak ada dua definisi "apa itu preman" yang bisa berbeda.
    const CANDIDATE_SQL = `
      SELECT t.id_ticket, t.incident, t.summary, t.symptom, t.customer_segment,
             t.customer_type, t.classification_path, t.channel, t.service_type,
             t.service_no, t.source_ticket, t.realm, t.jenis_tiket_1, t.jenis_tiket_2,
             t.ttr_comply_status, ext.c_description_serviceid
      FROM ticket t
      LEFT JOIN ticket_raw_bridge_ext ext ON ext.incident = t.incident
      WHERE t.id_ticket > ? AND t.summary REGEXP 'preman'
      ORDER BY t.id_ticket ASC
      LIMIT ?`;

    if (dryRun) {
      const est = await prismaBulk.$queryRawUnsafe<{ cnt: bigint }[]>(
        "SELECT COUNT(*) AS cnt FROM ticket WHERE summary REGEXP 'preman'",
      );
      console.log(
        `[Backfill-Preman] Kandidat (summary mengandung "preman"): ${Number(est[0]?.cnt ?? 0).toLocaleString('id-ID')}`,
      );
      console.log('[Backfill-Preman] --dry-run: tidak ada perubahan');
      return;
    }

    let lastId = 0;
    let scanned = 0;
    let updated = 0;
    let alreadyPreman = 0;
    let classifiedElsewhere = 0;
    let ttrCleared = 0;
    const transitions = new Map<string, number>();

    while (!interrupted) {
      if (limitArg !== null && scanned >= limitArg) break;

      const rows = await prismaBulk.$queryRawUnsafe<CandidateRow[]>(
        CANDIDATE_SQL,
        lastId,
        scanBatch,
      );
      if (rows.length === 0) break;

      lastId = rows[rows.length - 1]!.id_ticket;
      scanned += rows.length;

      // Klasifikasi dengan resolver yang sama seperti projection.
      const results = await batchClassifyJenisFromVlookup(
        rows.map((r) => ({
          channel: r.channel,
          classification_flag: null,
          classification_path: r.classification_path,
          customer_type: r.customer_type,
          customer_segment: r.customer_segment,
          service_type: r.service_type,
          service_no: r.service_no,
          source_ticket: r.source_ticket,
          realm: r.realm,
          summary: r.summary,
          symptom: r.symptom,
          c_description_serviceid: r.c_description_serviceid,
        })),
      );

      // Hanya yang benar-benar di-PREMAN-kan oleh classifier. Tiket yang
      // jatuh ke override lain (GAMAS) atau ke kata non-preman ("premana" =
      // nama orang) tidak boleh disentuh.
      const toUpdate: number[] = [];
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i]!;
        const out = results[i]!;
        const isPreman =
          (out.jenis_tiket_1 ?? '').toUpperCase() === 'PREMAN' &&
          (out.jenis_tiket_2 ?? '').toUpperCase() === 'PREMAN';

        if (!isPreman) {
          classifiedElsewhere++;
          continue;
        }
        if (
          (row.jenis_tiket_1 ?? '').toUpperCase() === 'PREMAN' &&
          (row.jenis_tiket_2 ?? '').toUpperCase() === 'PREMAN'
        ) {
          alreadyPreman++;
          continue;
        }

        const from = `${row.jenis_tiket_1 ?? '-'} / ${row.jenis_tiket_2 ?? '-'}`;
        transitions.set(from, (transitions.get(from) ?? 0) + 1);
        toUpdate.push(row.id_ticket);
        if (row.ttr_comply_status) ttrCleared++;
      }

      for (let i = 0; i < toUpdate.length; i += updateBatch) {
        const chunk = toUpdate.slice(i, i + updateBatch);
        // Semua baris dapat nilai yang sama, jadi tidak perlu CASE seperti
        // backfill reported_date_dt yang tiap baris punya tanggal berbeda.
        const affected = await prismaBulk.$executeRawUnsafe(
          `UPDATE ticket
             SET jenis_tiket_1 = 'PREMAN',
                 jenis_tiket_2 = 'PREMAN',
                 ttr_comply_status = NULL,
                 ttr_deadline_at = NULL
           WHERE id_ticket IN (${chunk.map(() => '?').join(',')})`,
          ...chunk,
        );
        updated += Number(affected);
      }

      console.log(
        `[Backfill-Preman] dipindai ${scanned}, diubah ${updated}, sudah PREMAN ${alreadyPreman}, ambil jenis lain ${classifiedElsewhere}`,
      );

      if (rows.length < scanBatch) break;
      await new Promise((r) => setImmediate(r));
    }

    console.log('\n=== HASIL BACKFILL PREMAN ===');
    console.log(`Baris dipindai            : ${scanned}`);
    console.log(`Diubah jadi PREMAN        : ${updated}`);
    console.log(`Sudah PREMAN (dilewati)   : ${alreadyPreman}`);
    console.log(`Klasifikasi lain (skip)   : ${classifiedElsewhere}`);
    console.log(`  └ ttr_comply_status ikut dibersihkan: ${ttrCleared}`);
    if (transitions.size > 0) {
      console.log('\nPerubahan jenis:');
      for (const [from, count] of [...transitions.entries()].sort(
        (a, b) => b[1] - a[1],
      )) {
        console.log(`  ${from.padEnd(34)} → PREMAN / PREMAN  (${count})`);
      }
    }
    console.log('===============================\n');
  } catch (error) {
    console.error('[Backfill-Preman] Fatal error:', error);
    process.exit(1);
  } finally {
    process.off('SIGINT', onSignal);
    process.off('SIGTERM', onSignal);
    await Promise.allSettled([prisma.$disconnect(), prismaBulk.$disconnect()]);
    console.log('[Backfill-Preman] Done');
    process.exit(0);
  }
}

main();
