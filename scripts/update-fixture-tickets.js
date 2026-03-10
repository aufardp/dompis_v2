#!/usr/bin/env node
/**
 * Update Fixture Ticket IDs
 * Fetches ticket IDs with STATUS_UPDATE = 'assigned' and updates stress-test.js
 */

const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

const DB_CONFIG = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'dompis_db',
};

async function main() {
  console.log('Fetching fixture ticket IDs...\n');

  let connection;
  try {
    connection = await mysql.createConnection(DB_CONFIG);

    // Get assigned tickets
    const [tickets] = await connection.execute(
      `SELECT id_ticket, INCIDENT, STATUS_UPDATE, teknisi_user_id
       FROM ticket
       WHERE STATUS_UPDATE = 'assigned'
         AND teknisi_user_id IS NOT NULL
       ORDER BY REPORTED_DATE DESC
       LIMIT 20`
    );

    console.log(`Found ${tickets.length} assigned tickets:`);
    tickets.forEach((t, i) => {
      console.log(`  ${i + 1}. ID: ${t.id_ticket}, Incident: ${t.INCIDENT}`);
    });
    console.log();

    if (tickets.length === 0) {
      console.log('⚠ No assigned tickets found!');
      console.log('  The test will still work but pickup/assign tests may fail.\n');
      console.log('  To create assigned tickets:');
      console.log('  1. Login as admin');
      console.log('  2. Assign some tickets to teknisi users');
      console.log();
      return;
    }

    // Update stress-test.js
    const stressTestPath = path.join(__dirname, '..', 'stress-test.js');
    let stressTestContent = fs.readFileSync(stressTestPath, 'utf8');

    const ticketIds = tickets.map((t) => t.id_ticket);
    
    // Format as multi-line array
    const formattedIds = ticketIds.length > 10 
      ? '[\n  ' + ticketIds.slice(0, 10).join(', ') + ',\n  ' + ticketIds.slice(10).join(', ') + '\n]'
      : '[' + ticketIds.join(', ') + ']';

    const newFixture = `const FIXTURE_TICKET_IDS = ${formattedIds};`;
    const fixtureRegex = /const FIXTURE_TICKET_IDS = [\s\S]*?];/;

    if (fixtureRegex.test(stressTestContent)) {
      stressTestContent = stressTestContent.replace(fixtureRegex, newFixture);
      fs.writeFileSync(stressTestPath, stressTestContent);
      console.log('✓ Updated stress-test.js with fixture ticket IDs\n');
    }

    console.log('Fixture IDs ready for stress test!');

  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

main();
