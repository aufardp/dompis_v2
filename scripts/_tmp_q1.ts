import { prisma } from '../app/libs/prisma';
async function main(){
  const rows:any = await prisma.$queryRawUnsafe(`SELECT NOW() db_now, @@session.time_zone stz, MAX(reported_date_dt) mx, MAX(synced_at) syn, COUNT(*) c FROM ticket`);
  console.log(rows);
  const s:any = await prisma.$queryRawUnsafe(`SELECT id_ticket, reported_date, reported_date_dt, synced_at, status, status_update, jenis_tiket_2 FROM ticket WHERE reported_date_dt IS NOT NULL ORDER BY id_ticket DESC LIMIT 5`);
  console.log(s);
}
main().finally(()=>prisma.$disconnect());
