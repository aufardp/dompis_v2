import prisma from '@/app/libs/prisma';
import { DailyTicketService } from '@/app/libs/services/daily-ticket.service';
import { logger } from '@/lib/observability/logger';

async function findSuperadmin(): Promise<{ id_user: number } | null> {
  return prisma.users.findFirst({
    where: { role_id: 1 },
    select: { id_user: true },
    orderBy: { id_user: 'asc' },
  });
}

async function warmKpiBucketSummary(role: string, userId: number): Promise<void> {
  const start = Date.now();
  await DailyTicketService.getKpiBucketSummaryMatrix(role, userId, {});
  const ms = Date.now() - start;
  logger.info('[Prewarm] KPI bucket summary warm:', { userId, ms });
}

async function warmTicketManagementOverview(role: string, userId: number): Promise<void> {
  const start = Date.now();
  await DailyTicketService.getTicketManagementOverviewSummary(role, userId);
  const ms = Date.now() - start;
  logger.info('[Prewarm] Ticket management overview warm:', { userId, ms });
}

async function warmBufferPool(): Promise<void> {
  const start = Date.now();
  const result = await prisma.$queryRaw<Array<{ total: bigint }>>`
    SELECT COUNT(*) AS total FROM ticket
  `;
  const ms = Date.now() - start;
  logger.info('[Prewarm] Buffer pool warm (count query):', { ms, total: Number(result[0]?.total ?? 0) });
}

export async function prewarmDashboardCache(): Promise<void> {
  try {
    const user = await findSuperadmin();
    if (!user) {
      logger.warn('[Prewarm] No superadmin user found, skipping');
      return;
    }

    const role = 'superadmin';
    const userId = user.id_user;

    logger.info('[Prewarm] Starting dashboard cache pre-warm for superadmin:', { userId });

    await Promise.allSettled([
      warmKpiBucketSummary(role, userId),
      warmTicketManagementOverview(role, userId),
      warmBufferPool(),
    ]);

    logger.info('[Prewarm] Dashboard cache pre-warm complete');
  } catch (error) {
    logger.warn('[Prewarm] Failed:', { error: String(error) });
  }
}
