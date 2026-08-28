import 'dotenv/config';
import { connectDB, prisma } from '@/app/libs/prisma';
import { computeTtrCompliance } from '@/app/libs/tickets/ttr-comply';
import { CLOSE_STATUS_VALUES } from '@/app/libs/ticket-utils';
import type { Prisma } from '@prisma/client';

async function main() {
  console.log('[Backfill] Starting TTR comply backfill...\n');

  try {
    await connectDB();
    console.log('[Backfill] Database connected');

    const batchSize = parseInt(process.env.BACKFILL_BATCH_SIZE || '500', 10);
    const limitArg = process.env.BACKFILL_LIMIT
      ? parseInt(process.env.BACKFILL_LIMIT, 10)
      : null;
    const closedFrom = process.env.BACKFILL_CLOSED_FROM || '2026-01-01';

    let processed = 0;
    let comply = 0;
    let notComply = 0;
    let excluded = 0;
    let lastId = 0;

    while (true) {
      if (limitArg !== null && processed >= limitArg) break;

      const take = limitArg !== null
        ? Math.min(batchSize, limitArg - processed)
        : batchSize;

      const tickets = await prisma.ticket.findMany({
        where: {
          status: { in: CLOSE_STATUS_VALUES },
          ttr_comply_status: null,
          id_ticket: { gt: lastId },
          closed_at: { gte: new Date(`${closedFrom}T00:00:00+07:00`) },
        },
        select: {
          id_ticket: true,
          status: true,
          closed_at: true,
          reported_date: true,
          customer_segment: true,
          customer_type: true,
          jenis_tiket_1: true,
          jenis_tiket_2: true,
          ticket_id_gamas: true,
        },
        take,
        orderBy: { id_ticket: 'asc' },
      });

      if (tickets.length === 0) break;

      const updates: Prisma.PrismaPromise<{ count: number }>[] = [];

      for (const ticket of tickets) {
        const result = computeTtrCompliance({
          status: ticket.status,
          closedAt: ticket.closed_at,
          reportedDate: ticket.reported_date,
          customerSegment: ticket.customer_segment,
          customerType: ticket.customer_type,
          jenisTiket1: ticket.jenis_tiket_1,
          jenisTiket2: ticket.jenis_tiket_2,
          ticketIdGamas: (ticket as any).ticket_id_gamas ?? null,
        });

        if (result.status === 'comply') comply++;
        else if (result.status === 'not_comply') notComply++;
        else excluded++;

        updates.push(
          prisma.ticket.updateMany({
            where: { id_ticket: ticket.id_ticket },
            data: {
              ttr_comply_status: result.status,
              ttr_deadline_at: result.deadlineAt,
            },
          }),
        );
      }

      await prisma.$transaction(updates);

      processed += tickets.length;
      lastId = tickets[tickets.length - 1].id_ticket;

      console.log(
        `[Backfill] Progress: ${processed} processed, ${comply} comply, ${notComply} not_comply, ${excluded} excluded (last id ${lastId})`,
      );
    }

    console.log('\n=== BACKFILL RESULT ===');
    console.log(`Processed: ${processed}`);
    console.log(`Comply: ${comply}`);
    console.log(`Not comply: ${notComply}`);
    console.log(`Excluded (no clear max TTR): ${excluded}`);
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
