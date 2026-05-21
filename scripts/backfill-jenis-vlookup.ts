/**
 * Script untuk backfill jenis_tiket_1 dan jenis_tiket_2 pada semua ticket yang ada
 *
 * Menggunakan classifier baru berbasis source_vlookup.
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
    let skip = 0;

    while (true) {
      // Read from ticket_raw which has complete data
      const rawTickets = await prisma.ticket_raw.findMany({
        where: { isActive: true },
        select: {
          incident: true,
          channel: true,
          classification_path: true,
          customer_type: true,
          customer_segment: true,
          service_type: true,
          service_no: true,
          source_ticket: true,
          realm: true,
        },
        take: batchSize,
        skip,
        orderBy: { importedAt: 'asc' },
      });

      if (rawTickets.length === 0) break;

      const inputs = rawTickets.map((t) => ({
        channel: t.channel,
        classification_path: t.classification_path,
        customer_type: t.customer_type,
        customer_segment: t.customer_segment,
        service_type: t.service_type,
        service_no: t.service_no,
        source_ticket: t.source_ticket,
        realm: t.realm,
      }));

      const results = await batchClassifyJenisFromVlookup(inputs);

      // Build updates only for tickets that have non-null classification
      const updates: Prisma.PrismaPromise<{ count: number }>[] = [];
      const incidentsToUpdate: string[] = [];

      for (let i = 0; i < rawTickets.length; i++) {
        const rawTicket = rawTickets[i]!;
        const result = results[i]!;

        if (!rawTicket.incident) continue;

        // Only update if classification produced a result
        if (result.jenis_tiket_1 || result.jenis_tiket_2) {
          updates.push(
            prisma.ticket.updateMany({
              where: { incident: rawTicket.incident },
              data: {
                jenis_tiket_1: result.jenis_tiket_1,
                jenis_tiket_2: result.jenis_tiket_2,
              },
            })
          );
          incidentsToUpdate.push(rawTicket.incident);
        } else {
          skipped++;
        }
      }

      if (updates.length > 0) {
        const updateResults = await prisma.$transaction(updates);
        const actualUpdated = updateResults.reduce((sum, r) => sum + r.count, 0);
        updated += actualUpdated;
      }

      processed += rawTickets.length;
      skip += batchSize;

      if (processed % 5000 === 0 || rawTickets.length < batchSize) {
        console.log(`[Backfill] Progress: ${processed} processed, ${updated} updated, ${skipped} skipped (null classification), ${errors} errors`);
      }
    }

    console.log('\n=== BACKFILL RESULT ===');
    console.log(`Processed: ${processed}`);
    console.log(`Updated: ${updated}`);
    console.log(`Skipped (null classification): ${skipped}`);
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
