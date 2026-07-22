import prisma from '@/app/libs/prisma';
import { DailyTicketService } from '@/app/libs/services/daily-ticket.service';
import { logger } from '@/lib/observability/logger';

interface AdminUser {
  id_user: number;
  role: 'superadmin' | 'admin';
}

async function findAllAdminUsers(): Promise<AdminUser[]> {
  const users = await prisma.users.findMany({
    where: { role_id: { in: [1, 2] } },
    select: { id_user: true, role_id: true },
  });
  return users.map(u => ({
    id_user: u.id_user,
    role: u.role_id === 1 ? 'superadmin' : 'admin',
  }));
}

async function warmKpiBucketSummary(role: string, userId: number): Promise<void> {
  const start = Date.now();
  await DailyTicketService.getKpiBucketSummaryMatrix(role, userId, {});
  const ms = Date.now() - start;
  logger.info('[Prewarm] KPI bucket summary warm:', { userId, role, ms });
}

async function warmTicketManagementOverview(role: string, userId: number): Promise<void> {
  const start = Date.now();
  await DailyTicketService.getTicketManagementOverviewSummary(role, userId);
  const ms = Date.now() - start;
  logger.info('[Prewarm] Ticket management overview warm:', { userId, role, ms });
}

async function warmBufferPool(): Promise<void> {
  const start = Date.now();
  const result = await prisma.$queryRaw<Array<{ total: bigint }>>`
    SELECT /*+ MAX_EXECUTION_TIME(15000) */ COUNT(*) AS total FROM ticket
  `;
  const ms = Date.now() - start;
  logger.info('[Prewarm] Buffer pool warm (count query):', { ms, total: Number(result[0]?.total ?? 0) });
}

export async function prewarmDashboardCache(): Promise<void> {
  try {
    const users = await findAllAdminUsers();
    if (users.length === 0) {
      logger.warn('[Prewarm] No admin users found, skipping');
      return;
    }

    logger.info('[Prewarm] Starting dashboard cache pre-warm', { userCount: users.length });

    await Promise.allSettled([
      warmBufferPool(),
      ...users.map(user => Promise.allSettled([
        warmKpiBucketSummary(user.role, user.id_user),
        warmTicketManagementOverview(user.role, user.id_user),
      ])),
    ]);

    logger.info('[Prewarm] Dashboard cache pre-warm complete', { userCount: users.length });
  } catch (error) {
    logger.warn('[Prewarm] Failed:', { error: String(error) });
  }
}
