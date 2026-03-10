#!/usr/bin/env node
/**
 * Stress Test Cleanup Script
 *
 * Usage:
 *   node scripts/stress-test-cleanup.js
 *
 * This script will:
 * 1. Delete stress test users from database
 * 2. Optionally reset tickets modified during test
 * 3. Verify cleanup
 */

const mysql = require('mysql2/promise');
const readline = require('readline');

const DB_CONFIG = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3307'),
  user: process.env.DB_USER || 'dompis_user',
  password: process.env.DB_PASSWORD || 'dompis_password',
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
  console.log('  K6 Stress Test — Cleanup');
  console.log('==============================================\n');

  console.log('This will delete all stress test users from the database.');
  console.log(
    'Optionally, it can also reset tickets modified during the test.\n',
  );

  const confirm = await question('Continue with cleanup? (y/n): ');
  if (confirm.toLowerCase() !== 'y') {
    console.log('Aborted.');
    rl.close();
    return;
  }

  let connection;
  try {
    connection = await mysql.createConnection(DB_CONFIG);
    console.log('✓ Connected to database\n');

    // Step 1: Count users to be deleted
    console.log('Step 1: Checking stress test users...');
    const [users] = await connection.execute(
      `SELECT role_id, COUNT(*) as count
       FROM users
       WHERE username LIKE 'stress_%'
       GROUP BY role_id`,
    );

    if (users.length === 0) {
      console.log('No stress test users found. Nothing to clean up.\n');
    } else {
      console.log('Users to delete:');
      users.forEach((row) => {
        const roleName =
          row.role_id === 2
            ? 'Admin'
            : row.role_id === 3
              ? 'Teknisi'
              : 'Helpdesk';
        console.log(`  ${roleName}: ${row.count}`);
      });
      console.log();

      // Step 2: Delete users
      console.log('Step 2: Deleting stress test users...');
      const [result] = await connection.execute(
        `DELETE FROM users WHERE username LIKE 'stress_%'`,
      );
      console.log(`✓ Deleted ${result.affectedRows} users\n`);
    }

    // Step 3: Optionally reset tickets
    console.log('Step 3: Reset tickets modified during test?');
    const resetTickets = await question(
      'Reset tickets that were picked up? (y/n): ',
    );

    if (resetTickets.toLowerCase() === 'y') {
      console.log(
        'Note: This will reset STATUS_UPDATE to "assigned" for tickets',
      );
      console.log(
        '      that are currently "on_progress" without a teknisi assigned.\n',
      );

      const [tickets] = await connection.execute(
        `SELECT id_ticket, INCIDENT, STATUS_UPDATE, teknisi_user_id
         FROM ticket
         WHERE STATUS_UPDATE = 'on_progress'
           AND teknisi_user_id IS NULL
         LIMIT 100`,
      );

      if (tickets.length === 0) {
        console.log('No tickets to reset.\n');
      } else {
        console.log(`Found ${tickets.length} tickets to reset.\n`);

        const confirmReset = await question(
          'Proceed with ticket reset? (y/n): ',
        );
        if (confirmReset.toLowerCase() === 'y') {
          const [resetResult] = await connection.execute(
            `UPDATE ticket
             SET STATUS_UPDATE = 'assigned'
             WHERE STATUS_UPDATE = 'on_progress'
               AND teknisi_user_id IS NULL`,
          );
          console.log(`✓ Reset ${resetResult.affectedRows} tickets\n`);
        }
      }
    }

    // Step 4: Verify cleanup
    console.log('Step 4: Verifying cleanup...');
    const [remaining] = await connection.execute(
      `SELECT COUNT(*) as count FROM users WHERE username LIKE 'stress_%'`,
    );

    if (remaining[0].count === 0) {
      console.log('✓ Cleanup verified - no stress test users remaining\n');
    } else {
      console.log(
        `⚠ Warning: ${remaining[0].count} stress test users still exist\n`,
      );
    }

    console.log('==============================================');
    console.log('  Cleanup Complete!');
    console.log('==============================================\n');
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
