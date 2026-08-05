import 'dotenv/config';
import { connectDB, prisma } from '@/app/libs/prisma';
import { DailyTicketService } from '@/app/libs/services/daily-ticket.service';

async function main() {
  await connectDB();
  const filters = {
    dept: 'all',
    operationalBucket: ['kpi_proactive'],
    page: 1,
    limit: 15,
    includeValidasi: false,
    includeOptions: false,
    globalScope: true,
  };
  const res = await DailyTicketService.getDailyTicketTable('superadmin', 1, filters);
  console.log('summary.total        =', res.summary.total);
  console.log('data.length          =', res.data.length);
  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
