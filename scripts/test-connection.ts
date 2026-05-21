import 'dotenv/config';
import { testExternalConnection, getTableNames } from '../lib/external-db/connection';

async function main() {
  console.log('Testing External DB Connection...');
  
  const connected = await testExternalConnection();
  console.log('External DB Connected:', connected);
  
  const tables = getTableNames();
  console.log('Tables configured:', tables);
  
  if (!connected) {
    console.log('\n⚠️  External DB not connected. Check EXTERNAL_DB_* environment variables.');
    console.log('\nRequired:');
    console.log('- EXTERNAL_DB_HOST');
    console.log('- EXTERNAL_DB_USER');
    console.log('- EXTERNAL_DB_PASSWORD');
    console.log('- EXTERNAL_DB_NAME');
  }
}

main().catch(console.error);