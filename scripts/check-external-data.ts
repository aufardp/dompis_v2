import 'dotenv/config';
import { fetchTableRows } from '../lib/external-db/connection';

async function main() {
  console.log('Checking external DB structure...');
  
  const rows = await fetchTableRows('jatim_tickets', { limit: 1 });
  
  if (rows.length > 0) {
    console.log('\n=== Column names from jatim_tickets ===');
    const columns = Object.keys(rows[0]);
    console.log(columns.join('\n'));
    
    console.log('\n=== Sample row data ===');
    console.log(JSON.stringify(rows[0], null, 2));
  }
}

main().catch(console.error);