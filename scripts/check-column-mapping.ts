import 'dotenv/config';
import { fetchTableRows } from '../lib/external-db/connection';
import { normalizeExternalRow } from '../lib/ingestion/normalizer';

async function main() {
  console.log('Checking column mapping...\n');
  
  const rows = await fetchTableRows('jatim_tickets', { limit: 1 });
  const externalRow = rows[0] as Record<string, unknown>;
  const normalized = normalizeExternalRow(externalRow as any, 'jatim_tickets');
  
  console.log('=== External DB Columns ===');
  const externalKeys = Object.keys(externalRow).filter(k => externalRow[k] !== null && externalRow[k] !== '');
  console.log(externalKeys.join(', '));
  
  console.log('\n=== Normalized (non-empty) ===');
  const normalizedKeys = Object.keys(normalized).filter(k => k !== '_sourceTable' && k !== '_rawPayload' && normalized[k as keyof typeof normalized] !== null && normalized[k as keyof typeof normalized] !== '');
  console.log(normalizedKeys.join(', '));
  
  console.log('\n=== Missing from Normalized ===');
  const missing = externalKeys.filter(k => !normalizedKeys.includes(k));
  console.log(missing.join(', '));
  
  console.log('\n=== Sample normalized row (first 10) ===');
  const sample = Object.entries(normalized).slice(0, 10);
  for (const [key, value] of sample) {
    console.log(`  ${key}: ${value}`);
  }
}

main().catch(console.error);