import 'dotenv/config';
import { execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { logger } from '@/lib/observability/logger';

const BACKUP_DIR = process.env.DB_BACKUP_DIR || './backups';
const KEEP_LAST = 30;

function getConnectionFromUrl(url: string) {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parsed.port || '3306',
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: parsed.pathname.replace(/^\//, ''),
  };
}

async function backup() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    logger.error('DATABASE_URL not set');
    process.exit(1);
  }

  const conn = getConnectionFromUrl(url);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `dompis-${timestamp}.sql.gz`;
  const backupPath = path.resolve(BACKUP_DIR);

  fs.mkdirSync(backupPath, { recursive: true });
  const filepath = path.join(backupPath, filename);

  const cmd = `mysqldump -h ${conn.host} -P ${conn.port} -u ${conn.user} -p${conn.password} --single-transaction --routines --triggers --events ${conn.database} | gzip > ${filepath}`;

  logger.info('Starting database backup...', { host: conn.host, database: conn.database, output: filepath });

  try {
    execSync(cmd, { stdio: 'pipe', timeout: 300_000 });
    const size = fs.statSync(filepath).size;
    logger.info('Backup completed', { filename, sizeBytes: size, sizeMB: (size / 1024 / 1024).toFixed(2) });
  } catch (error) {
    logger.error('Backup failed:', { error: String(error) });
    process.exit(1);
  }

  // Cleanup old backups
  const files = fs.readdirSync(backupPath)
    .filter(f => f.startsWith('dompis-') && f.endsWith('.sql.gz'))
    .map(f => ({ name: f, time: fs.statSync(path.join(backupPath, f)).mtimeMs }))
    .sort((a, b) => b.time - a.time);

  if (files.length > KEEP_LAST) {
    const toRemove = files.slice(KEEP_LAST);
    for (const f of toRemove) {
      fs.unlinkSync(path.join(backupPath, f.name));
      logger.info('Removed old backup:', { filename: f.name });
    }
  }
}

backup().catch((error) => {
  logger.error('Fatal error:', { error: String(error) });
  process.exit(1);
});
