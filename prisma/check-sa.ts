import prisma from '../app/libs/prisma';

async function main() {
  const serviceAreas = await prisma.service_area.findMany({
    take: 30,
    include: { area: true },
  });
  console.log('Existing service_areas:', JSON.stringify(serviceAreas, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());