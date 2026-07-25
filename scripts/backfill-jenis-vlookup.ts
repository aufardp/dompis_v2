/**
 * Script untuk backfill jenis_tiket_1 dan jenis_tiket_2 pada semua ticket yang ada
 *
 * Menggunakan classifier baru berbasis source_vlookup (lib/classify-jenis-vlookup.ts).
 * Membaca data dari ticket_raw (sumber data lengkap) dan mengupdate tiket.
 *
 * Usage: npx tsx scripts/backfill-jenis-vlookup.ts
 */

import 'dotenv/config';
import { connectDB, prisma } from '@/app/libs/prisma';
import { batchClassifyJenisFromVlookup, resetVlookupCache, refreshVlookupCache } from '@/lib/classify-jenis-vlookup';
import type { Prisma } from '@prisma/client';

async function main() {
  console.log('[Backfill] Starting jenis_tiket vlookup backfill...\n');

  try {
    await connectDB();
    console.log('[Backfill] Database connected');

    resetVlookupCache();
    await refreshVlookupCache();
    console.log('[Backfill] Vlookup cache warmed up\n');

    const batchSize = parseInt(process.env.BACKFILL_BATCH_SIZE || '500', 10);
    let processed = 0;
    let updated = 0;
    let skipped = 0;
    let errors = 0;
    let cursorId: string | undefined;

    while (true) {
      const rawTickets = await prisma.ticket_raw.findMany({
        where: { isActive: true },
        select: {
          id_ticket: true,
          incident: true,
          channel: true,
          classification_flag: true,
          classification_path: true,
          customer_type: true,
          customer_segment: true,
          service_type: true,
          service_no: true,
          source_ticket: true,
          realm: true,
          summary: true,
          symptom: true,
        },
        take: batchSize,
        ...(cursorId ? { cursor: { id_ticket: cursorId }, skip: 1 } : {}),
        orderBy: { id_ticket: 'asc' },
      });

      if (rawTickets.length === 0) break;

      const inputs = rawTickets.map((t) => ({
        channel: t.channel,
        classification_flag: t.classification_flag,
        classification_path: t.classification_path,
        customer_type: t.customer_type,
        customer_segment: t.customer_segment,
        service_type: t.service_type,
        service_no: t.service_no,
        source_ticket: t.source_ticket,
        realm: t.realm,
        summary: t.summary,
        symptom: t.symptom ?? null,
      }));

      const results = await batchClassifyJenisFromVlookup(inputs);

      // Batch lookup current values — eliminates N+1
      const incidents = rawTickets.map((t) => t.incident).filter((s): s is string => s !== null);
      const existing: { incident: string; jenis_tiket_1: string | null; jenis_tiket_2: string | null }[] = incidents.length > 0
        ? await prisma.ticket.findMany({
            where: { incident: { in: incidents } },
            select: { incident: true, jenis_tiket_1: true, jenis_tiket_2: true },
          })
        : [];
      const currentMap = new Map(existing.map((t) => [t.incident, t]));

      const updates: Prisma.PrismaPromise<{ count: number }>[] = [];

      for (let i = 0; i < rawTickets.length; i++) {
        const rawTicket = rawTickets[i]!;
        const result = results[i]!;

        if (!rawTicket.incident) continue;

        const nextJenis1 = result.jenis_tiket_1 ?? null;
        const nextJenis2 = result.jenis_tiket_2 ?? null;
        const current = currentMap.get(rawTicket.incident);
        const currentJenis1 = current?.jenis_tiket_1 ?? null;
        const currentJenis2 = current?.jenis_tiket_2 ?? null;

        if (nextJenis1 === currentJenis1 && nextJenis2 === currentJenis2) {
          skipped++;
          continue;
        }

        updates.push(
          prisma.ticket.updateMany({
            where: { incident: rawTicket.incident },
            data: {
              jenis_tiket_1: nextJenis1,
              jenis_tiket_2: nextJenis2,
            },
          }),
        );
      }

      if (updates.length > 0) {
        const updateResults = await prisma.$transaction(updates);
        updated += updateResults.reduce((sum, r) => sum + r.count, 0);
      }

      processed += rawTickets.length;
      cursorId = rawTickets[rawTickets.length - 1]!.id_ticket;

      if (processed % 5000 === 0 || rawTickets.length < batchSize) {
        console.log(`[Backfill] Progress: ${processed} processed, ${updated} updated, ${skipped} skipped, ${errors} errors`);
      }
    }

    console.log('\n=== BACKFILL RESULT ===');
    console.log(`Processed: ${processed}`);
    console.log(`Updated: ${updated}`);
    console.log(`Skipped (already correct): ${skipped}`);
    console.log(`Errors: ${errors}`);
    console.log('========================\n');
  } catch (error) {
    console.error('[Backfill] Fatal error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    console.log('[Backfill] Done');
    process.exit(0);
  }
}

main();
