import 'dotenv/config';
import { getExternalPool, getTableNames } from '../lib/external-db/connection';

async function main() {
  console.log('═══════════════════════════════════════════');
  console.log('  EXTERNAL DB COLUMN ANALYSIS');
  console.log('═══════════════════════════════════════════\n');

  const pool = getExternalPool();
  if (!pool) {
    console.error('External DB pool not available');
    process.exit(1);
  }

  const tables = getTableNames();
  console.log(`Tables: ${tables.join(', ')}\n`);

  for (const table of tables) {
    console.log(`── ${table} ──`);

    const [columns] = await pool.query(`
      SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = 'bot_dompis_db' AND TABLE_NAME = ?
      ORDER BY ORDINAL_POSITION
    `, [table]);

    const cols = columns as Array<{
      COLUMN_NAME: string;
      COLUMN_TYPE: string;
      IS_NULLABLE: string;
      COLUMN_DEFAULT: string | null;
    }>;

    for (const col of cols) {
      console.log(`  ${col.COLUMN_NAME}  ${col.COLUMN_TYPE}  ${col.IS_NULLABLE === 'YES' ? 'NULL' : 'NOT NULL'}`);
    }
    console.log('');
  }

  // Check sample data for channel and classification_path
  for (const table of tables.slice(0, 1)) {
    console.log(`── Sample from ${table} (channel, classification_path) ──`);

    const [rows] = await pool.query(`
      SELECT incident, channel, classification_path, customer_segment, source_ticket
      FROM \`${table}\`
      LIMIT 5
    `, []);

    const sampleRows = rows as Array<{
      incident: string;
      channel: string | null;
      classification_path: string | null;
      customer_segment: string | null;
      source_ticket: string | null;
    }>;

    for (const row of sampleRows) {
      console.log(`  ${row.incident}`);
      console.log(`    channel: ${row.channel || '(null)'}`);
      console.log(`    classification_path: ${row.classification_path || '(null)'}`);
      console.log(`    customer_segment: ${row.customer_segment || '(null)'}`);
      console.log(`    source_ticket: ${row.source_ticket || '(null)'}`);
    }
    console.log('');

    // Count null values
    const [counts] = await pool.query(`
      SELECT
        COUNT(*) as total,
        SUM(channel IS NULL) as channel_null,
        SUM(classification_path IS NULL) as classification_null,
        SUM(customer_segment IS NULL) as segment_null,
        SUM(source_ticket IS NULL) as source_null
      FROM \`${table}\`
    `, []);

    const c = (counts as Array<any>)[0];
    console.log(`── Null counts for ${table} ──`);
    console.log(`  Total: ${c.total}`);
    console.log(`  channel NULL: ${c.channel_null} (${((c.channel_null / c.total) * 100).toFixed(1)}%)`);
    console.log(`  classification_path NULL: ${c.classification_null} (${((c.classification_null / c.total) * 100).toFixed(1)}%)`);
    console.log(`  customer_segment NULL: ${c.segment_null} (${((c.segment_null / c.total) * 100).toFixed(1)}%)`);
    console.log(`  source_ticket NULL: ${c.source_null} (${((c.source_null / c.total) * 100).toFixed(1)}%)`);
    console.log('');
  }

  await pool.end();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
