// scripts/seed-test-event.ts
// Jalankan: npx tsx scripts/seed-test-event.ts

import 'dotenv/config';
import prisma from '../app/libs/prisma';

async function main() {
  const event = await prisma.tech_event_outbox.create({
    data: {
      event_id: 'test-10',
      event_type: 'TICKET_STATUS_CHANGED',
      status: 'PENDING',
      attempt_count: 0,
      payload: {
        event_id: 'test-10',
        event_type: 'TICKET_STATUS_CHANGED',
        occurred_at:
          new Date()
            .toLocaleString('sv-SE', {
              timeZone: 'Asia/Jakarta',
              hour12: false,
            })
            .replace(' ', 'T') + '+07:00',
        ticket: {
          id: 10,
          incident: 'TEST_INCIDENT',
          workzone: 'TEST',
          service_no: '152415230585',
          customer_name: 'PELANGGAN1',
        },
        status: {
          old_hasil_visit: 'ASSIGNED',
          new_hasil_visit: 'ON_PROGRESS',
          pending_reason: null,
          evidence: null,
        },
        old_technician: null,
        new_technician: {
          id_user: 10,
          nik: 'TEST010',
          nama: 'Test Tech 10',
        },
        actor: {
          id_user: 10,
          role: 'admin',
        },
      },
    },
  });

  console.log('✅ Test event inserted:', event.id);
  console.log('\n📝 Event payload:');
  console.log(JSON.stringify(event.payload, null, 2));
}

main()
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
