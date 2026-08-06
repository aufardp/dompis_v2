#!/usr/bin/env tsx
/**
 * Log-table retention diagnostics — READ-ONLY.
 *
 * Menampilkan ukuran & umur data tabel log/outbox yang ditangani oleh
 * `runLogRetention`/`runTransientCleanup` di ops-worker, tanpa mengubah data:
 *   - ukuran fisik (information_schema)
 *   - total baris, baris tertua/terbaru per kolom waktu
 *   - estimasi baris yang akan di-purge dengan retention saat ini
 *
 * Run with: npm run logs:diagnose [-- --retention-days 30] [-- --finalized-days 90]
 */

import 'dotenv/config';
import { prismaBulk } from '@/app/libs/prisma';
import { logger } from '@/lib/observability/logger';

interface CliOptions {
  retentionDays: number;
  finalizedDays: number;
}

interface TableSpec {
  name: string;
  table: string;
  timeCol: string;
  retentionDays?: number;
  expirableWhere?: (cutoff: string) => string;
}

const SPECS: TableSpec[] = [
  { name: 'ingestion_run_log', table: 'ingestion_run_log', timeCol: 'startedAt' },
  { name: 'status_refresh_run_log', table: 'status_refresh_run_log', timeCol: 'startedAt' },
  { name: 'active_refresh_run_log', table: 'active_refresh_run_log', timeCol: 'startedAt' },
  {
    name: 'projection_request',
    table: 'projection_request',
    timeCol: 'processed_at',
    expirableWhere: (cutoff) => `processed_at IS NOT NULL AND processed_at <= '${cutoff}'`,
  },
  { name: 'ingestion_quarantine', table: 'ingestion_quarantine', timeCol: 'createdAt' },
  { name: 'status_refresh_ticket_state', table: 'status_refresh_ticket_state', timeCol: 'lastCheckedAt' },
  { name: 'reguler_webhook_outbox', table: 'reguler_webhook_outbox', timeCol: 'created_at' },
  {
    name: 'invite_tokens',
    table: 'invite_tokens',
    timeCol: 'created_at',
    expirableWhere: (cutoff) => `(used_at IS NOT NULL OR expires_at <= '${cutoff}') AND created_at <= '${cutoff}'`,
  },
  { name: 'ticket_raw_finalized', table: 'ticket_raw_finalized', timeCol: 'finalized_at', retentionDays: 90 },
  { name: 'ticket_active_viewers', table: 'ticket_active_viewers', timeCol: 'last_seen_at' },
];

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { retentionDays: 30, finalizedDays: 90 };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--retention-days') {
      const n = parseInt(argv[++i], 10);
      if (Number.isFinite(n) && n > 0) options.retentionDays = n;
    } else if (arg === '--finalized-days') {
      const n = parseInt(argv[++i], 10);
      if (Number.isFinite(n) && n > 0) options.finalizedDays = n;
    }
  }
  return options;
}

function toMysqlTs(d: Date): string {
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

async function tableSizes(): Promise<void> {
  const tableNames = SPECS.map((s) => s.table).join("','");
  const rows = await prismaBulk.$queryRawUnsafe<
    Array<{ table_name: string; table_rows: bigint; size_bytes: bigint }>
  >(`
    SELECT table_name, table_rows,
           (data_length + index_length) AS size_bytes
    FROM information_schema.TABLES
    WHERE table_schema = DATABASE()
      AND table_name IN ('${tableNames}')
    ORDER BY size_bytes DESC
  `);
  logger.info('[LogDiag] === Physical size (information_schema) ===');
  for (const r of rows) {
    logger.info('[LogDiag] size', {
      table: r.table_name,
      rows: Number(r.table_rows),
      sizeMB: Number(Number(r.size_bytes) / 1024 / 1024).toFixed(2),
    });
  }
}

async function diagnosePerTable(options: CliOptions): Promise<void> {
  logger.info('[LogDiag] === Per-table breakdown ===', {
    retentionDays: options.retentionDays,
    finalizedDays: options.finalizedDays,
  });

  for (const spec of SPECS) {
    const cutoff = toMysqlTs(
      new Date(Date.now() - (spec.retentionDays ?? options.retentionDays) * 24 * 60 * 60 * 1000)
    );
    try {
      const [overview] = await prismaBulk.$queryRawUnsafe<Array<{ total: bigint; oldest: string | null; newest: string | null }>>(`
        SELECT COUNT(*) AS total,
               DATE_FORMAT(MIN(${spec.timeCol}), '%Y-%m-%d %H:%i:%s') AS oldest,
               DATE_FORMAT(MAX(${spec.timeCol}), '%Y-%m-%d %H:%i:%s') AS newest
        FROM ${spec.table}
      `);
      const expirableWhere = spec.expirableWhere
        ? spec.expirableWhere(cutoff)
        : `${spec.timeCol} <= '${cutoff}'`;
      const [exp] = await prismaBulk.$queryRawUnsafe<Array<{ expirable: bigint }>>(`
        SELECT COUNT(*) AS expirable FROM ${spec.table} WHERE ${expirableWhere}
      `);
      logger.info('[LogDiag] table', {
        table: spec.name,
        total: Number(overview.total),
        oldest: overview.oldest,
        newest: overview.newest,
        expirable: Number(exp.expirable),
        cutoff,
      });
    } catch (err: any) {
      logger.error('[LogDiag] Table query failed', { table: spec.name, error: String(err) });
    }
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  logger.info('[LogDiag] Starting log-table diagnostics', { ...options });
  await tableSizes();
  await diagnosePerTable(options);
  logger.info('[LogDiag] Done');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    logger.error('[LogDiag] Failed', { error: String(err) });
    process.exit(1);
  });
