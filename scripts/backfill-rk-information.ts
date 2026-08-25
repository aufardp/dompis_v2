import 'dotenv/config';
import { connectDB, prisma } from '@/app/libs/prisma';
import { normalizeRkInformation } from '@/lib/projection';
import type { Prisma } from '@prisma/client';

async function main() {
  console.log('[Backfill] Starting rk_information dedupe backfill...\n');

  try {
    await connectDB();
    console.log('[Backfill] Database connected');

    const batchSize = parseInt(process.env.BACKFILL_BATCH_SIZE || '1000', 10);
    const limitArg = process.env.BACKFILL_LIMIT
      ? parseInt(process.env.BACKFILL_LIMIT, 10)
      : null;

    let checked = 0;
    let updated = 0;
    let skipped = 0;
    let lastId = 0;

    while (true) {
      if (limitArg !== null && checked >= limitArg) break;

      const take = limitArg !== null
        ? Math.min(batchSize, limitArg - checked)
        : batchSize;

      const tickets = await prisma.ticket.findMany({
        where: {
          rk_information: { contains: ' ' },
          id_ticket: { gt: lastId },
        },
        select: { id_ticket: true, rk_information: true },
        take,
        orderBy: { id_ticket: 'asc' },
      });

      if (tickets.length === 0) break;

      const updates: Prisma.PrismaPromise<{ count: number }>[] = [];

      for (const ticket of tickets) {
        const normalized = normalizeRkInformation(ticket.rk_information);
        if (normalized !== ticket.rk_information) {
          updates.push(
            prisma.ticket.updateMany({
              where: { id_ticket: ticket.id_ticket },
              data: { rk_information: normalized },
            }),
          );
          updated++;
        } else {
          skipped++;
        }
      }

      if (updates.length > 0) {
        await prisma.$transaction(updates);
      }

      checked += tickets.length;
      lastId = tickets[tickets.length - 1].id_ticket;

      console.log(
        `[Backfill] Progress: ${checked} checked, ${updated} updated, ${skipped} skipped (last id ${lastId})`,
      );
    }

    console.log('\n=== BACKFILL RESULT ===');
    console.log(`Checked: ${checked}`);
    console.log(`Updated (deduped): ${updated}`);
    console.log(`Skipped (not a duplicate pattern): ${skipped}`);
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
