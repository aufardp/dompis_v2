import 'dotenv/config';
import { prisma } from '../app/libs/prisma';

async function testWorkflow() {
  console.log('=== Testing Workflow (Limited) ===\n');

  // Check current data
  const ticketRawCount = await prisma.ticket_raw.count();
  console.log('1. ticket_raw count:', ticketRawCount);

  const ticketCount = await prisma.ticket.count();
  console.log('2. ticket count:', ticketCount);

  // Test projection with only 5 records
  if (ticketRawCount > 0) {
    console.log('\n3. Testing projection (5 records)...');
    const { runProjection } = await import('../lib/projection');
    
    // Get first 5 incidents to project manually
    const rawRecords = await prisma.ticket_raw.findMany({
      take: 5,
      select: { id_ticket: true, incident: true }
    });
    
    console.log('Sample records to project:', rawRecords.map(r => r.incident));
    console.log('\nProjection requires full run - this may take time.');
    console.log('Try running projection with proper environment variables:');
    console.log('PROJECTION_ENABLED=true npx tsx scripts/test-workflow.ts');
  } else {
    console.log('\n3. No ticket_raw data to project.');
  }

  console.log('\n=== Done ===');
  process.exit(0);
}

testWorkflow().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});