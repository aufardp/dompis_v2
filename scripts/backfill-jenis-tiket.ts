import { backfillJenisTiket } from '@/lib/projection';
import { logger } from '@/lib/observability/logger';

async function main() {
  logger.info('[Backfill] Starting one-shot jenis_tiket backfill...');
  const result = await backfillJenisTiket(100);
  logger.info('[Backfill] Complete:', result);
  process.exit(0);
}

main().catch((err) => {
  logger.error('[Backfill] Fatal error:', err);
  process.exit(1);
});
