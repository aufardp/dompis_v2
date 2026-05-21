import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Checking ticket_raw data...');
  
  // Check sample data
  const sample = await prisma.ticket_raw.findFirst({
    select: {
      incident: true,
      summary: true,
      cause: true,
      street_address: true,
      date_modified: true,
      external_ticket_tier_3: true,
      sourceTable: true,
      isActive: true,
    }
  });
  
  console.log('\n=== Sample ticket_raw data ===');
  console.log(JSON.stringify(sample, null, 2));
  
  // Check all columns with data
  const allColumns = await prisma.$queryRawUnsafe(`
    SELECT 
      incident,
      summary,
      cause,
      street_address,
      date_modified,
      external_ticket_tier_3,
      source_table,
      is_active
    FROM ticket_raw 
    LIMIT 3
  `);
  
  console.log('\n=== Raw SQL query result ===');
  console.log(JSON.stringify(allColumns, null, 2));
  
  await prisma.$disconnect();
}

main().catch(console.error);