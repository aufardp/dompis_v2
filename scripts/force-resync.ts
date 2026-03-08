/**
 * Force Re-Sync Script
 * 
 * Purpose: Re-sync all tickets from Google Sheets to update STATUS_UPDATE
 * Usage: npx tsx scripts/force-resync.ts
 */

import { syncSpreadsheet } from '@/lib/google-sheets/sync';

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('FORCE RE-SYNC — Starting');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');
  console.log(`Start time: ${new Date().toISOString()}`);
  console.log('');

  try {
    const result = await syncSpreadsheet();

    console.log('');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('FORCE RE-SYNC — Complete');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`Inserted: ${result.inserted}`);
    console.log(`Updated:  ${result.updated}`);
    console.log(`Errors:   ${result.errors.length}`);
    console.log('');

    if (result.errors.length > 0) {
      console.log('Errors:');
      result.errors.forEach((err, i) => {
        console.log(`  ${i + 1}. ${err}`);
      });
    }

    console.log(`End time: ${new Date().toISOString()}`);
    console.log('');
  } catch (err: any) {
    console.error('');
    console.error('═══════════════════════════════════════════════════════════');
    console.error('FORCE RE-SYNC — FAILED');
    console.error('═══════════════════════════════════════════════════════════');
    console.error(`Error: ${err.message}`);
    console.error('');
    console.error('Stack trace:');
    console.error(err.stack);
    process.exit(1);
  }
}

main().catch(console.error);
