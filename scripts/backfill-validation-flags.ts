import 'dotenv/config';
import { connectDB, prisma } from '@/app/libs/prisma';
import { classifyNeedsValidation } from '@/lib/projection/classify-validation';
import type { Prisma } from '@prisma/client';

async function main() {
  console.log('[Backfill] Starting validation flags backfill...\n');

  try {
    await connectDB();
    console.log('[Backfill] Database connected');

    const batchSize = parseInt(process.env.BACKFILL_BATCH_SIZE || '500', 10);
    let processed = 0;
    let updated = 0;
    let skipped = 0;
    let errors = 0;
    let skip = 0;

    while (true) {
      const tickets = await prisma.ticket.findMany({
        select: {
          id_ticket: true,
          incident: true,
          status: true,
          status_update: true,
          worklog_summary: true,
          needs_validation: true,
          validation_reason: true,
          validation_flagged_at: true,
        },
        take: batchSize,
        skip,
        orderBy: { id_ticket: 'asc' },
      });

      if (tickets.length === 0) break;

      const updates: Prisma.PrismaPromise<{ count: number }>[] = [];

      for (const ticket of tickets) {
        const result = classifyNeedsValidation({
          status: ticket.status,
          statusUpdate: ticket.status_update,
          worklogSummary: ticket.worklog_summary,
        });

        const currentNeedsValidation = ticket.needs_validation;
        const currentReason = ticket.validation_reason;
        const needsUpdate =
          result.needsValidation !== currentNeedsValidation ||
          result.reason !== currentReason;

        if (!needsUpdate) {
          skipped++;
          continue;
        }

        const data: Prisma.ticketUpdateInput = {
          needs_validation: result.needsValidation,
          validation_reason: result.reason,
        };

        if (result.needsValidation && !currentNeedsValidation) {
          data.validation_flagged_at = new Date();
        } else if (!result.needsValidation) {
          data.validation_flagged_at = null;
        }

        updates.push(
          prisma.ticket.updateMany({
            where: { id_ticket: ticket.id_ticket },
            data,
          }),
        );
      }

      if (updates.length > 0) {
        const updateResults = await prisma.$transaction(updates);
        const actualUpdated = updateResults.reduce((sum, r) => sum + r.count, 0);
        updated += actualUpdated;
      }

      processed += tickets.length;
      skip += batchSize;

      if (processed % 5000 === 0 || tickets.length < batchSize) {
        console.log(
          `[Backfill] Progress: ${processed} processed, ${updated} updated, ${skipped} skipped, ${errors} errors`,
        );
      }
    }

    console.log('\n=== BACKFILL RESULT ===');
    console.log(`Processed: ${processed}`);
    console.log(`Updated: ${updated}`);
    console.log(`Skipped (no change): ${skipped}`);
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
