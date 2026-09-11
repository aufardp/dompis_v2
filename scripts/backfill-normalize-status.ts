import 'dotenv/config';
import { connectDB, prisma } from '@/app/libs/prisma';

async function main() {
  console.log('[Backfill] Normalize ticket.status → UPPER(TRIM) + status_update → LOWER(TRIM)');
  await connectDB();
  // Disable timeout for full table scan
  for (const sql of ['SET SESSION max_execution_time = 0', 'SET SESSION MAX_EXECUTION_TIME = 0'] as const) {
    try { await prisma.$executeRawUnsafe(sql); } catch {}
  }
  const batchSize = 2000;
  let lastId = 0;
  let totalScanned = 0;
  let totalUpdated = 0;
  while (true) {
    const rows = await prisma.$queryRawUnsafe<{ id_ticket: number; status: string | null; status_update: string | null }[]>(
      `SELECT /*+ MAX_EXECUTION_TIME(0) */ id_ticket, status, status_update FROM ticket WHERE id_ticket > ? ORDER BY id_ticket ASC LIMIT ?`,
      lastId, batchSize,
    );
    if (rows.length === 0) break;
    lastId = rows[rows.length - 1]!.id_ticket;
    totalScanned += rows.length;
    const toUpdate = rows.filter(r => {
      const normStatus = String(r.status ?? '').trim().toUpperCase();
      const normUpdate = String(r.status_update ?? '').trim().toLowerCase();
      return normStatus !== String(r.status ?? '') || normUpdate !== String(r.status_update ?? '');
    });
    if (toUpdate.length > 0) {
      // Bulk update via CASE
      for (const chunk of chunkArray(toUpdate, 500)) {
        const ids = chunk.map(c => c.id_ticket);
        // Use raw update per chunk with CASE
        // Simpler: update each via executeRaw per id is slower, use bulk with VALUES
        for (const r of chunk) {
          const normStatus = String(r.status ?? '').trim().toUpperCase() || null;
          const normUpdate = String(r.status_update ?? '').trim().toLowerCase() || null;
          await prisma.$executeRawUnsafe(`UPDATE ticket SET status = ?, status_update = ? WHERE id_ticket = ?`, normStatus, normUpdate, r.id_ticket);
        }
        totalUpdated += chunk.length;
      }
      console.log(`[Backfill] Scanned ${totalScanned}, updated ${totalUpdated} (last id ${lastId})`);
    } else if (totalScanned % 20000 === 0) {
      console.log(`[Backfill] Scanned ${totalScanned} (no updates, last id ${lastId})`);
    }
    if (rows.length < batchSize) break;
    await new Promise(r => setImmediate(r));
  }
  console.log(`\n=== DONE scanned ${totalScanned}, normalized ${totalUpdated} ===`);
  await prisma.$disconnect();
}
function chunkArray<T>(a: T[], n: number): T[][] { const r: T[][]=[]; for(let i=0;i<a.length;i+=n) r.push(a.slice(i,i+n)); return r; }
main().catch(e=>{console.error(e);process.exit(1)});
