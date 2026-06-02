import prisma from '../app/libs/prisma';
import { format, toZonedTime } from 'date-fns-tz';

async function main() {
  const wibNow = toZonedTime(new Date(), 'Asia/Jakarta');
  const todayWib = format(wibNow, 'yyyy-MM-dd', { timeZone: 'Asia/Jakarta' });
  const currentHourWib = Number(format(wibNow, 'H', { timeZone: 'Asia/Jakarta' }));

  const rows = await prisma.ticket.findMany({
    where: {
      reported_date: {
        not: null,
        startsWith: todayWib,
      },
    },
    select: {
      reported_date: true,
      workzone: true,
      customer_segment: true,
    },
    take: 50,
    orderBy: {
      reported_date: 'asc',
    },
  });

  const counts = Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0 }));
  for (const row of rows) {
    const reportedDate = row.reported_date?.trim();
    if (!reportedDate) continue;
    const hour = Number(reportedDate.slice(11, 13));
    if (!Number.isFinite(hour) || hour < 0 || hour > currentHourWib) continue;
    counts[hour].count += 1;
  }

  const summary = await prisma.ticket.aggregate({
    _count: { _all: true },
    where: {
      reported_date: {
        not: null,
        startsWith: todayWib,
      },
    },
  });

  console.log(
    JSON.stringify(
      {
        todayWib,
        currentHourWib,
        sample: rows.slice(0, 10),
        countToday: summary._count._all,
        counts: counts.filter((item) => item.count > 0),
      },
      null,
      2,
    ),
  );

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
