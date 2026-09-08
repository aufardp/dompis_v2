import 'dotenv/config';
import { connectDB, prisma } from '@/app/libs/prisma';
import { computeTtrCompliance } from '@/app/libs/tickets/ttr-comply';
import { CLOSE_STATUS_VALUES } from '@/app/libs/ticket-utils';
import type { Prisma } from '@prisma/client';

/**
 * Recompute `ttr_comply_status` + `ttr_deadline_at` dari `resolve_date`.
 *
 * Pass 1 — tiket close ber-`resolve_date`: hitung ulang comply (timpa nilai lama
 *          yang mungkin masih berbasis closed_at).
 * Pass 2 — tiket close tanpa `resolve_date` tapi punya `ttr_comply_status`:
 *          reset ke null (belum bisa dinilai — acuan hanya resolve_date).
 */
async function main() {
  console.log('[Backfill] Recompute TTR comply dari resolve_date...\n');

  try {
    await connectDB();
    console.log('[Backfill] Database connected');

    const batchSize = parseInt(process.env.BACKFILL_BATCH_SIZE || '500', 10);
    const limitArg = process.env.BACKFILL_LIMIT
      ? parseInt(process.env.BACKFILL_LIMIT, 10)
      : null;
    const closedFrom = process.env.BACKFILL_CLOSED_FROM || '2026-01-01';
    const fromDate = new Date(`${closedFrom}T00:00:00+07:00`);

    // ── Pass 1: recompute untuk yang punya resolve_date ──────────────────
    let processed = 0;
    let comply = 0;
    let notComply = 0;
    let excluded = 0;
    let lastId = 0;

    while (true) {
      if (limitArg !== null && processed >= limitArg) break;
      const take =
        limitArg !== null ? Math.min(batchSize, limitArg - processed) : batchSize;

      const tickets = await prisma.ticket.findMany({
        where: {
          status: { in: CLOSE_STATUS_VALUES },
          id_ticket: { gt: lastId },
          resolve_date: { gte: fromDate },
        },
        select: {
          id_ticket: true,
          status: true,
          resolve_date: true,
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
          resolveAt: ticket.resolve_date,
          reportedDate: ticket.reported_date,
          customerSegment: ticket.customer_segment,
          customerType: ticket.customer_type,
          jenisTiket1: ticket.jenis_tiket_1,
          jenisTiket2: ticket.jenis_tiket_2,
          ticketIdGamas: ticket.ticket_id_gamas ?? null,
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
        `[Backfill] Pass1: ${processed} processed, ${comply} comply, ${notComply} not_comply, ${excluded} excluded (last id ${lastId})`,
      );
    }

    // ── Pass 2: reset yang tak punya resolve_date (chunked by id) ───────
    let resetCount = 0;
    let resetLastId = 0;
    while (true) {
      const batch = await prisma.ticket.findMany({
        where: {
          status: { in: CLOSE_STATUS_VALUES },
          resolve_date: null,
          ttr_comply_status: { not: null },
          id_ticket: { gt: resetLastId },
        },
        select: { id_ticket: true },
        take: batchSize,
        orderBy: { id_ticket: 'asc' },
      });
      if (batch.length === 0) break;
      const ids = batch.map((b) => b.id_ticket);
      const res = await prisma.ticket.updateMany({
        where: { id_ticket: { in: ids } },
        data: { ttr_comply_status: null, ttr_deadline_at: null },
      });
      resetCount += res.count;
      resetLastId = ids[ids.length - 1];
      console.log(`[Backfill] Pass2 reset: ${resetCount} (last id ${resetLastId})`);
    }
    const reset = { count: resetCount };

    console.log('\n=== BACKFILL RESULT ===');
    console.log(`Pass1 processed: ${processed}`);
    console.log(`  comply: ${comply}`);
    console.log(`  not_comply: ${notComply}`);
    console.log(`  excluded (no clear max TTR): ${excluded}`);
    console.log(`Pass2 reset (resolve_date null): ${reset.count}`);
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
