import prisma from '../app/libs/prisma';

async function main() {
  console.log('Dropping workzone table...');
  
  try {
    await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS workzone`);
    console.log('Workzone table dropped');
  } catch (e) {
    console.log('Error dropping table:', e);
  }
  
  console.log('Done!');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());