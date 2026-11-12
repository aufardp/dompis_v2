import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { readFile } from 'node:fs/promises';
import { availableParallelism, freemem, totalmem, loadavg } from 'node:os';

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const url = new URL(process.env.DATABASE_URL);
  url.searchParams.set('connection_limit', '1');
  url.searchParams.set('pool_timeout', '5');
  url.searchParams.set('socket_timeout', '5');
  const db = new PrismaClient({ datasources: { db: { url: url.toString() } }, log: [] });
  const inspect = async (sql: string) => {
    try { return await db.$queryRawUnsafe(sql); }
    catch (error) { return { unavailable: true, error: error instanceof Error ? error.name : 'UnknownError' }; }
  };
  const host = async () => ({
    parallelism: availableParallelism(), freeMemoryBytes: freemem(), totalMemoryBytes: totalmem(), loadAverage: loadavg(),
    cgroup: Object.fromEntries(await Promise.all(['memory.current', 'memory.max', 'cpu.max', 'cpu.stat', 'io.pressure'].map(async name => [
      name, await readFile(`/sys/fs/cgroup/${name}`, 'utf8').then(value => value.trim()).catch(() => null),
    ]))),
  });
  const status = () => inspect(`SHOW GLOBAL STATUS WHERE Variable_name IN (
    'Threads_running','Threads_connected','Innodb_log_waits','Innodb_row_lock_current_waits',
    'Innodb_row_lock_waits','Innodb_row_lock_time','Innodb_data_pending_writes',
    'Innodb_data_pending_fsyncs','Innodb_buffer_pool_reads','Innodb_buffer_pool_read_requests')`);
  try {
    const startedAt = new Date().toISOString();
    const first = { host: await host(), status: await status() };
    await new Promise(resolve => setTimeout(resolve, 2000));
    const second = { host: await host(), status: await status() };
    const report = {
      startedAt, finishedAt: new Date().toISOString(), node: process.version,
      revisionSyncEnabledInThisProcess: process.env.TICKET_SYNC_REVISIONS_ENABLED === 'true',
      first, second,
      version: await inspect('SELECT VERSION() AS version'),
      activeProcesses: await inspect("SELECT ID, COMMAND, TIME, STATE FROM information_schema.PROCESSLIST WHERE DB = DATABASE() AND COMMAND <> 'Sleep' ORDER BY TIME DESC LIMIT 20"),
      dataLockWaits: await inspect('SELECT REQUESTING_ENGINE_TRANSACTION_ID, BLOCKING_ENGINE_TRANSACTION_ID FROM performance_schema.data_lock_waits LIMIT 20'),
      fileWaits: await inspect(`SELECT EVENT_NAME, COUNT_STAR,
        ROUND(SUM_TIMER_WAIT / 1000000000000, 3) AS totalWaitSeconds,
        ROUND(AVG_TIMER_WAIT / 1000000000, 3) AS averageWaitMs
        FROM performance_schema.file_summary_by_event_name WHERE COUNT_STAR > 0
        ORDER BY SUM_TIMER_WAIT DESC LIMIT 10`),
    };
    process.stdout.write(JSON.stringify(report, (_key, value) => typeof value === 'bigint' ? value.toString() : value, 2) + '\n');
  } finally { await db.$disconnect(); }
}

main().catch(error => {
  process.stderr.write(`Sync diagnostics failed: ${error instanceof Error ? error.name : 'UnknownError'}\n`);
  process.exitCode = 1;
});
