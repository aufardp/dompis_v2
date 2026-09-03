import prisma from '@/app/libs/prisma';
import { signAccessToken } from '@/app/libs/auth';
import { TicketWorkflowService } from '@/app/libs/services/ticketWorkflow.service';
import { toWIB } from '@/app/utils/datetime';

async function genToken(userId: number, role: string, role_id: number) {
  const payload = {
    id_user: userId,
    role,
    role_id,
    workzone: ['DMO'],
    attendance_checked_in: true,
    attendance_date: '2026-08-30',
    attendance_status: 'PRESENT' as const,
    attendance_check_in_at: new Date().toISOString(),
  };
  return signAccessToken(payload);
}

async function main() {
  // Create manual ticket via API as admin 33 (DMO)
  const adminToken = await genToken(33, 'admin', 2);
  const ts = Date.now();
  const body = {
    service_no: `TEST-CLOSE-${ts}`,
    workzone: 'DMO',
    customer_type: 'DATIN',
    customer_name: 'PT Close Test',
    contact_phone: '08123456789',
    summary: 'Test close manual no validation',
    manual_category: 'GANGGUAN' as const,
  };
  console.log('Creating manual ticket...');
  const res = await fetch('http://localhost:3000/api/tickets/manual', {
    method: 'POST',
    headers: { 'content-type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  console.log('Create status', res.status, data);
  if (!data.success) throw new Error('create failed');
  const incident = data.data.incident;
  const id_ticket = data.data.id_ticket;
  let ticket = await prisma.ticket.findUnique({ where: { id_ticket } });
  console.log('After create:', { status: ticket?.status, jenis1: (ticket as any).jenis_tiket_1, jenis2: (ticket as any).jenis_tiket_2, status_update: ticket?.status_update, needs_validation: (ticket as any).needs_validation });
  console.log('Check status BACKEND:', ticket?.status === 'BACKEND' ? 'PASS' : 'FAIL', ticket?.status);
  console.log('Check jenis MANUAL:', (ticket as any).jenis_tiket_1 === 'MANUAL' && (ticket as any).jenis_tiket_2 === 'MANUAL' ? 'PASS' : 'FAIL');

  // Assign to teknisi 797 (DMO)
  console.log('\nAssigning to teknisi 797...');
  const assignRes = await TicketWorkflowService.assignToUser(id_ticket, 797, { id_user: 33, role: 'admin' } as any);
  console.log('Assign', assignRes);

  // Pickup as teknisi
  console.log('\nPickup as teknisi...');
  const pickupRes = await TicketWorkflowService.pickupTicket(id_ticket, { id_user: 797, role: 'teknisi' } as any);
  console.log('Pickup', pickupRes);

  // Add 2 evidences (required for close) - create dummy evidence rows
  await prisma.ticket_evidence.createMany({
    data: [
      { ticket_id: id_ticket, incident, file_name: 'ev1.jpg', file_path: '/tmp/ev1.jpg', n8n_sync_status: 'DONE' },
      { ticket_id: id_ticket, incident, file_name: 'ev2.jpg', file_path: '/tmp/ev2.jpg', n8n_sync_status: 'DONE' },
    ],
    skipDuplicates: true,
  });

  // Close as teknisi
  console.log('\nClosing as teknisi...');
  const closeRes = await TicketWorkflowService.closeTicket(
    id_ticket,
    { id_user: 797, role: 'teknisi' } as any,
    'RCA_TEST',
    'SUB_RCA_TEST',
    'Detail perbaikan minimal 10 karakter untuk test manual close',
    { latitude: -7.5, longitude: 112.5, barcodeDc: 'DC123', accuracyMeters: 10 },
    { alamat: 'Jl Test 123', deviceName: 'ODP-TEST' },
  );
  console.log('Close', closeRes);

  ticket = await prisma.ticket.findUnique({ where: { id_ticket } });
  console.log('After close:', { status: ticket?.status, status_update: ticket?.status_update, needs_validation: (ticket as any).needs_validation, validation_reason: (ticket as any).validation_reason });
  console.log('Check status CLOSED:', ticket?.status === 'CLOSED' ? 'PASS' : 'FAIL');
  console.log('Check status_update close:', ticket?.status_update === 'close' ? 'PASS' : 'FAIL');
  console.log('Check needs_validation false:', (ticket as any).needs_validation === false || (ticket as any).needs_validation === 0 ? 'PASS' : 'FAIL');

  await prisma.$disconnect();
  console.log('\nDONE');
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
