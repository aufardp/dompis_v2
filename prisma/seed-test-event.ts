/**
 * Seed script untuk test webhook
 * Usage: npx tsx prisma/seed-test-event.ts
 *
 * NOTE: Untuk test alert diamond, ticket harus punya sync_date = hari ini.
 * Script ini membuat ticket dengan sync_date kemarin sebagai contoh.
 * Untuk test alert, buat ticket baru dengan sync_date = todayWIB().
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const testEvents = [
  {
    event_type: 'TICKET_ASSIGNED',
    event_id: 'TEST-ASSIGN-001',
    event_label: 'TICKET_ASSIGNED_INC00001',
    occurred_at: new Date().toISOString(),
    ticket: {
      id: 1,
      incident: 'INC00001',
      workzone: 'WZK001',
      service_no: '123456789',
      customer_name: 'Budi Santoso',
      owner_group: 'NMS',
      customer_type: 'B2C',
    },
    status: {
      old_hasil_visit: null,
      new_hasil_visit: 'ASSIGNED',
      pending_dompis: null,
      evidence: null,
    },
    old_technician: null,
    new_technician: {
      id_user: 5,
      nik: 'TK001',
      nama: 'Teknisi A',
    },
    actor: {
      id_user: 0,
      role: 'admin',
    },
  },
  {
    event_type: 'TICKET_STATUS_CHANGED',
    event_id: 'TEST-STATUS-001',
    event_label: 'TICKET_STATUS_CHANGED_INC00002',
    occurred_at: new Date().toISOString(),
    ticket: {
      id: 2,
      incident: 'INC00002',
      workzone: 'WZK002',
      service_no: '987654321',
      customer_name: 'Siti Rahayu',
      owner_group: 'NMS',
      customer_type: 'B2B',
    },
    status: {
      old_hasil_visit: 'ASSIGNED',
      new_hasil_visit: 'ON_PROGRESS',
      pending_dompis: null,
      evidence: {
        files: [],
        count: 0,
      },
    },
    old_technician: {
      id_user: 5,
      nik: 'TK001',
      nama: 'Teknisi A',
    },
    new_technician: {
      id_user: 5,
      nik: 'TK001',
      nama: 'Teknisi A',
    },
    actor: {
      id_user: 5,
      role: 'teknisi',
    },
  },
  {
    event_type: 'TICKET_CLOSED',
    event_id: 'TEST-CLOSE-001',
    event_label: 'TICKET_CLOSED_INC00003',
    occurred_at: new Date().toISOString(),
    ticket: {
      id: 3,
      incident: 'INC00003',
      workzone: 'WZK003',
      service_no: '555666777',
      customer_name: 'Joko Pramono',
      owner_group: 'NMS',
      customer_type: 'B2C',
    },
    status: {
      old_hasil_visit: 'ON_PROGRESS',
      new_hasil_visit: 'CLOSE',
      pending_dompis: null,
      evidence: {
        files: [
          {
            file_name: 'bukti1.jpg',
            local_path: '/uploads/bukti1.jpg',
            drive_url: 'https://drive.google.com/file/d/xxx',
          },
        ],
        count: 1,
      },
      rca: 'Kabel fiber optik putus',
      sub_rca: 'Tikus menggigit kabel',
      detail_perbaikan: 'Penambalan kabel fiber dan penyegelan ulang',
    },
    old_technician: {
      id_user: 6,
      nik: 'TK002',
      nama: 'Teknisi B',
    },
    new_technician: null,
    actor: {
      id_user: 6,
      role: 'teknisi',
    },
  },
];

async function main() {
  console.log('🧪 Seeding test events...\n');

  // Clear existing test events by event_id
  const testIds = testEvents.map((e) => e.event_id);
  await prisma.tech_event_outbox.deleteMany({
    where: {
      event_id: { in: testIds },
    },
  });

  // Also clear all PENDING events to start fresh (optional)
  // Uncomment line below if you want to clear ALL pending events
  // await prisma.tech_event_outbox.deleteMany({ where: { status: 'PENDING' } });

  let inserted = 0;
  for (const event of testEvents) {
    await prisma.tech_event_outbox.create({
      data: {
        status: 'PENDING',
        payload: event,
        event_type: event.event_type,
        event_id: event.event_id,
        attempt_count: 0,
      },
    });
    inserted++;
    console.log(`  ✅ Inserted: ${event.event_id} (${event.event_type})`);
  }

  console.log(`\n✅ Done! ${inserted} test events inserted.`);
  console.log('\n📡 Next, run dispatch:');
  console.log(
    '   curl -X POST http://localhost:3000/api/integrations/tech-events/dispatch \\',
  );
  console.log('     -H "x-cron-secret: cron12345678"\n');
}

/**
 * Seed Diamond ticket untuk test alert (sync_date = hari ini)
 * Usage: npx tsx prisma/seed-test-event.ts --diamond
 */
async function seedDiamondTicket() {
  console.log('💎 Seeding Diamond ticket with today sync_date...\n');

  // Get today's date in WIB
  const today = new Date();
  const todayWib = new Date(
    today.toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }),
  );
  const todayStr = todayWib.toISOString().slice(0, 10);

  // Clear any existing test Diamond tickets
  await prisma.ticket.deleteMany({
    where: {
      incident: {
        in: ['TEST-DIAMOND-001', 'TEST-DIAMOND-002', 'TEST-DIAMOND-OLD'],
      },
    },
  });

  // Create ticket synced TODAY
  const ticketToday = await prisma.ticket.create({
    data: {
      incident: 'TEST-DIAMOND-001',
      summary: 'Test Diamond Ticket - Hari Ini',
      customer_type: 'HVC_DIAMOND',
      service_no: '123456789',
      contact_name: 'Pelanggan Diamond A',
      contact_phone: '081234567890',
      workzone: 'RKT',
      status_update: 'open',
      sync_date: new Date(`${todayStr}T00:00:00.000Z`),
      reported_date: todayWib.toISOString(),
      owner_group: 'NMS',
      service_type: 'FO',
    },
  });
  console.log(
    `  ✅ Created ticket TODAY: ${ticketToday.incident} (sync_date: ${todayStr})`,
  );

  // Create ticket synced YESTERDAY (should NOT appear in alert)
  const yesterday = new Date(todayWib);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().slice(0, 10);

  const ticketYesterday = await prisma.ticket.create({
    data: {
      incident: 'TEST-DIAMOND-OLD',
      summary: 'Test Diamond Ticket - Kemarin',
      customer_type: 'HVC_DIAMOND',
      service_no: '987654321',
      contact_name: 'Pelanggan Diamond B (Lama)',
      contact_phone: '089876543210',
      workzone: 'RKT',
      status_update: 'open',
      sync_date: new Date(`${yesterdayStr}T00:00:00.000Z`),
      reported_date: yesterday.toISOString(),
      owner_group: 'NMS',
      service_type: 'FO',
    },
  });
  console.log(
    `  ⚠️  Created ticket YESTERDAY: ${ticketYesterday.incident} (sync_date: ${yesterdayStr})`,
  );

  console.log('\n✅ Diamond ticket seeding complete!');
  console.log('\n📋 Test Alert Diamond API:');
  console.log('   curl -X GET http://localhost:3000/api/tickets/alert/diamond');
  console.log('\n📋 Expected:');
  console.log('   ✅ TEST-DIAMOND-001 should appear (sync_date = today)');
  console.log(
    '   ❌ TEST-DIAMOND-OLD should NOT appear (sync_date = yesterday)',
  );
}

main()
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
