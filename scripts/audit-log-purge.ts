import { purgeAuditLogs } from '@/app/libs/services/audit-log.query';
import { logger } from '@/lib/observability/logger';

async function main() {
  try {
    const deleted = await purgeAuditLogs();
    logger.info('[AuditLogPurge] Completed', { deleted });
  } catch (error) {
    logger.error('[AuditLogPurge] Failed', { error: String(error) });
    process.exit(1);
  }
}

main();