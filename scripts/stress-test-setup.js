#!/usr/bin/env node
/**
 * Stress Test Setup Helper
 * 
 * Usage:
 *   node scripts/stress-test-setup.js
 * 
 * This script will:
 * 1. Generate bcrypt hash for test password
 * 2. Create test users in the database
 * 3. Get fixture ticket IDs for pickup test
 * 4. Output instructions for updating stress-test.js
 */

const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

// Configuration
const TEST_PASSWORD = 'Password123!';
const BCRYPT_ROUNDS = 10;

const DB_CONFIG = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'dompis_db',
};

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(query) {
  return new Promise((resolve) => {
    rl.question(query, (answer) => resolve(answer));
  });
}

async function main() {
  console.log('==============================================');
  console.log('  K6 Stress Test — Setup Helper');
  console.log('==============================================\n');

  // Step 1: Generate password hash
  console.log('Step 1: Generating password hash...');
  const passwordHash = bcrypt.hashSync(TEST_PASSWORD, BCRYPT_ROUNDS);
  console.log(`✓ Password: ${TEST_PASSWORD}`);
  console.log(`✓ Hash: ${passwordHash}\n`);

  // Step 2: Connect to database
  console.log('Step 2: Connecting to database...');
  console.log(`  Host: ${DB_CONFIG.host}:${DB_CONFIG.port}`);
  console.log(`  Database: ${DB_CONFIG.database}\n`);

  const confirm = await question('Continue with database setup? (y/n): ');
  if (confirm.toLowerCase() !== 'y') {
    console.log('Aborted.');
    rl.close();
    return;
  }

  let connection;
  try {
    connection = await mysql.createConnection(DB_CONFIG);
    console.log('✓ Connected to database\n');

    // Step 3: Create test users
    console.log('Step 3: Creating test users...');

    const adminUsers = Array.from({ length: 10 }, (_, i) => ({
      username: `stress_admin${String(i + 1).padStart(2, '0')}`,
      nama: `Stress Admin ${String(i + 1).padStart(2, '0')}`,
      role_id: 2,
    }));

    const tekUsers = Array.from({ length: 15 }, (_, i) => ({
      username: `stress_tek${String(i + 1).padStart(2, '0')}`,
      nama: `Stress Teknisi ${String(i + 1).padStart(2, '0')}`,
      role_id: 3,
    }));

    const hdUsers = Array.from({ length: 5 }, (_, i) => ({
      username: `stress_hd${String(i + 1).padStart(2, '0')}`,
      nama: `Stress Helpdesk ${String(i + 1).padStart(2, '0')}`,
      role_id: 4,
    }));

    const allUsers = [...adminUsers, ...tekUsers, ...hdUsers];

    for (const user of allUsers) {
      await connection.execute(
        `INSERT INTO users (username, password, nama, role_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, NOW(), NOW())`,
        [user.username, passwordHash, user.nama, user.role_id]
      );
    }

    console.log(`✓ Created ${allUsers.length} test users\n`);

    // Verify users
    const [rows] = await connection.execute(
      `SELECT role_id, COUNT(*) as count
       FROM users
       WHERE username LIKE 'stress_%'
       GROUP BY role_id`
    );

    console.log('User summary:');
    rows.forEach((row) => {
      const roleName = row.role_id === 2 ? 'Admin' : row.role_id === 3 ? 'Teknisi' : 'Helpdesk';
      console.log(`  ${roleName}: ${row.count}`);
    });
    console.log();

    // Step 4: Get fixture ticket IDs
    console.log('Step 4: Getting fixture ticket IDs for pickup test...');

    const [tickets] = await connection.execute(
      `SELECT id_ticket, INCIDENT, STATUS_UPDATE, teknisi_user_id, WORKZONE
       FROM ticket
       WHERE STATUS_UPDATE = 'assigned'
         AND teknisi_user_id IS NOT NULL
       ORDER BY REPORTED_DATE DESC
       LIMIT 20`
    );

    if (tickets.length === 0) {
      console.log('⚠ No tickets with STATUS_UPDATE = "assigned" found!');
      console.log('  Please ensure you have assigned tickets in the database.\n');
    } else {
      console.log(`✓ Found ${tickets.length} assigned tickets\n`);
      console.log('Fixture Ticket IDs (copy to stress-test.js):');
      const ticketIds = tickets.map((t) => t.id_ticket);
      console.log(`  [${ticketIds.join(', ')}]\n`);

      // Update stress-test.js with fixture IDs
      const stressTestPath = path.join(__dirname, '..', 'stress-test.js');
      let stressTestContent = fs.readFileSync(stressTestPath, 'utf8');

      const fixtureRegex = /const FIXTURE_TICKET_IDS = \[[\s\S]*?\];/;
      const newFixture = `const FIXTURE_TICKET_IDS = [\n  ${ticketIds.join(', ')}\n];`;

      if (fixtureRegex.test(stressTestContent)) {
        stressTestContent = stressTestContent.replace(fixtureRegex, newFixture);
        fs.writeFileSync(stressTestPath, stressTestContent);
        console.log('✓ Updated stress-test.js with fixture ticket IDs\n');
      }
    }

    console.log('==============================================');
    console.log('  Setup Complete!');
    console.log('==============================================\n');

    console.log('Next steps:');
    console.log('1. Run smoke test first:');
    console.log('   k6 run stress-test.js --env BASE_URL=http://localhost:3000 --scenario smoke\n');
    console.log('2. If smoke test passes, run full load test:');
    console.log('   k6 run stress-test.js --env BASE_URL=http://localhost:3000 --out json=results/run-$(date +%Y%m%d-%H%M).json\n');
    console.log('3. After test, cleanup users:');
    console.log('   node scripts/stress-test-cleanup.js\n');
  } catch (error) {
    console.error('Error:', error.message);
    if (error.code === 'ECONNREFUSED') {
      console.error('\nCannot connect to database. Please ensure:');
      console.error('  - MariaDB/MySQL is running');
      console.error('  - Database credentials are correct in .env');
    }
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
    rl.close();
  }
}

main();
