import 'dotenv/config';
import { runBridgeEnrichment } from '../lib/ingestion/bridge-enrichment';

async function main() {
  console.time('enrich');
  const result = await runBridgeEnrichment('debug-b2000');
  console.timeEnd('enrich');
  console.log('Result:', JSON.stringify(result));
}

main().catch(console.error);
