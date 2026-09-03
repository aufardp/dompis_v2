import { signAccessToken } from '@/app/libs/auth';
import prisma from '@/app/libs/prisma';
import { toWIB } from '@/app/utils/datetime';

async function genToken(userId: number) {
  const user = await prisma.users.findUnique({
    where: { id_user: userId },
    include: { roles: { select: { key: true } } },
  });
  if (!user) throw new Error('user not found');
  const payload = {
    id_user: user.id_user,
    role: user.roles?.key || 'admin',
    role_id: user.role_id || 2,
    workzone: ['DMO'],
    attendance_checked_in: true,
    attendance_date: '2026-08-30',
    attendance_status: 'PRESENT' as const,
    attendance_check_in_at: new Date().toISOString(),
  };
  const token = await signAccessToken(payload);
  return token;
}

async function testSingle(token: string) {
  console.log('\n=== TEST SINGLE ===');
  const body = {
    service_no: `TEST-${Date.now()}`,
    workzone: 'DMO',
    customer_type: 'DATIN',
    customer_name: `PT Test ${Date.now()}`,
    contact_phone: '08123456789',
    summary: 'Test single manual gangguan',
    manual_category: 'GANGGUAN' as const,
    rk_information: 'ODC-RKT-FDM',
  };
  console.log('Body:', body);
  const res = await fetch('http://localhost:3000/api/tickets/manual', {
    method: 'POST',
    headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  console.log('Status:', res.status);
  console.log('Response:', JSON.stringify(data, null, 2));
  if (data.success) {
    const ticket = await prisma.ticket.findUnique({ where: { incident: data.data.incident } });
    console.log('DB ticket:', {
      incident: ticket?.incident,
      jenis1: (ticket as any)?.jenis_tiket_1,
      jenis2: (ticket as any)?.jenis_tiket_2,
      is_manual: (ticket as any)?.is_manual,
      service_no: ticket?.service_no,
    });
    const ok1 = (ticket as any)?.jenis_tiket_1 === 'manual' && (ticket as any)?.jenis_tiket_2 === 'manual';
    const ok2 = /^INC-DATIN\d{6}\d{2,4}$/.test(data.data.incident);
    console.log('Check jenis manual:', ok1 ? 'PASS' : 'FAIL');
    console.log('Check incident format INC-DATINDDMMYYNN:', ok2 ? 'PASS' : 'FAIL', data.data.incident);
    return data.data.incident;
  }
  return null;
}

async function testBulkPaste(token: string) {
  console.log('\n=== TEST BULK PASTE (JSON rows) ===');
  const ts = Date.now();
  const rows = [
    {
      service_no: `BULK-${ts}-1`,
      workzone: 'DMO',
      customer_type: 'TSEL',
      customer_name: 'John Doe',
      contact_phone: '0813000001',
      summary: 'Bulk TSEL 1',
    },
    {
      service_no: `BULK-${ts}-2`,
      workzone: 'DMO',
      customer_type: 'DATIN',
      customer_name: 'PT ABC',
      contact_phone: '0813000002',
      summary: 'Bulk DATIN 1',
    },
    {
      service_no: `BULK-${ts}-3`,
      workzone: 'GBG',
      customer_type: 'VPN IP',
      customer_name: 'PT XYZ',
      contact_phone: '0813000003',
      summary: 'Bulk VPN',
    },
  ];
  console.log('Rows:', rows.length);
  const res = await fetch('http://localhost:3000/api/tickets/manual/bulk', {
    method: 'POST',
    headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ rows }),
  });
  const data = await res.json();
  console.log('Status:', res.status);
  console.log('Response:', JSON.stringify(data, null, 2));
  if (data.success) {
    console.log('Inserted:', data.data.inserted);
    console.log('Incidents:', data.data.incidents);
    // Check sequence continues
    const incidents: string[] = data.data.incidents;
    const seqs = incidents.map((inc) => {
      const m = inc.match(/(\d{6})(\d{2,})$/);
      return m ? parseInt(m[2]!, 10) : null;
    });
    console.log('Seqs:', seqs);
    const isSeq = seqs[0] !== null && seqs[1] === (seqs[0]! + 1) && seqs[2] === (seqs[1]! + 1);
    console.log('Check sequence lanjut ganti CT:', isSeq ? 'PASS' : 'FAIL');
    // Check jenis manual for one
    const ticket = await prisma.ticket.findUnique({ where: { incident: incidents[0] } });
    console.log('DB first bulk jenis:', (ticket as any)?.jenis_tiket_1, (ticket as any)?.jenis_tiket_2);
  }
}

async function testBulkUpload(token: string) {
  console.log('\n=== TEST BULK UPLOAD (CSV file) ===');
  const ts = Date.now();
  const csv = `service_no,workzone,customer_type,customer_name,contact_phone,summary,rk_information
UPLOAD-${ts}-1,DMO,DATIN,PT Upload1,0814000001,Upload DATIN via file,ODC-UP
UPLOAD-${ts}-2,GBG,TSEL,PT Upload2,0814000002,Upload TSEL via file,
`;
  const blob = new Blob([csv], { type: 'text/csv' });
  const form = new FormData();
  form.append('file', blob, 'test.csv');
  const res = await fetch('http://localhost:3000/api/tickets/manual/bulk', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form as any,
  });
  const data = await res.json();
  console.log('Status:', res.status);
  console.log('Response:', JSON.stringify(data, null, 2));
}

async function testInvalidCategory(token: string) {
  console.log('\n=== TEST INVALID CATEGORY (should fail) ===');
  const body = {
    service_no: `TEST-INVALID-${Date.now()}`,
    workzone: 'DMO',
    customer_type: 'DATIN',
    customer_name: 'PT Test',
    contact_phone: '0812',
    summary: 'Test invalid cat',
    manual_category: 'NON_TIKET' as any,
  };
  const res = await fetch('http://localhost:3000/api/tickets/manual', {
    method: 'POST',
    headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  console.log('Status:', res.status, 'expected 400');
  console.log('Response:', data);
  console.log('Check reject NON_TIKET:', res.status === 400 ? 'PASS' : 'FAIL');
}

async function testDailyReset() {
  console.log('\n=== INFO: Incident reset harian check (manual) ===');
  const wib = toWIB(new Date());
  const dd = String(wib.getDate()).padStart(2, '0');
  const mm = String(wib.getMonth() + 1).padStart(2, '0');
  const yy = String(wib.getFullYear()).slice(-2);
  const ddMMyy = `${dd}${mm}${yy}`;
  console.log('Today WIB DDMMYY:', ddMMyy);
  console.log('Next ticket should be INC-{CT}' + ddMMyy + 'NN, NN reset besok jadi 01');
}

async function main() {
  const token = await genToken(10); // admin 955942
  console.log('Token gen for admin 10, role admin');
  await testSingle(token);
  await testBulkPaste(token);
  await testBulkUpload(token);
  await testInvalidCategory(token);
  await testDailyReset();
  await prisma.$disconnect();
  console.log('\n=== DONE ===');
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
