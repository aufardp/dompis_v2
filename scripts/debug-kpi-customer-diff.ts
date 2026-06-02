import 'dotenv/config';
import { prisma } from '@/app/libs/prisma';
import { DailyTicketService } from '@/app/libs/services/daily-ticket.service';

function norm(value: unknown): string {
  return String(value ?? '').toLowerCase().trim();
}

function compact(value: unknown): string {
  return norm(value).replace(/\s+/g, '');
}

function isUnknown(value: unknown): boolean {
  return norm(value).includes('unknown');
}

function isNonTechToken(value: unknown): boolean {
  const n = norm(value);
  const c = compact(value);
  return (
    n.includes('permintaan') ||
    n.includes('infracare') ||
    n.includes('billing') ||
    n.includes('digital_spbu') ||
    n.includes('digital spbu') ||
    n.includes('non numbering') ||
    c.includes('digitalspbu') ||
    c.includes('nonnumbering')
  );
}

function isKpiCustomerToken(value: unknown): boolean {
  const n = norm(value);
  const c = compact(value);
  return (
    n.includes('reguler') ||
    n.includes('datin') ||
    n.includes('non datin') ||
    n.includes('tsel') ||
    n.includes('vpn ip') ||
    n.includes('ccan') ||
    n.includes('regular') ||
    n.includes('dwdm') ||
    n.includes('digital_spbu') ||
    n.includes('digital spbu') ||
    n.includes('astinet') ||
    n.includes('metro-e') ||
    n.includes('indibiz') ||
    n.includes('reseller') ||
    n.includes('wifi-id') ||
    c.includes('nondatin') ||
    c.includes('vpnip') ||
    c.includes('digitalspbu') ||
    c.includes('metroe')
  );
}

async function main() {
  const dailyWhere = await DailyTicketService.buildDailyTicketWhere('superadmin', 1, {
    globalScope: true,
  });

  const rows = await prisma.ticket.findMany({
    where: dailyWhere,
    select: {
      incident: true,
      source_ticket: true,
      jenis_tiket_1: true,
      jenis_tiket_2: true,
      classification_path: true,
    },
  });

  const rowRule = rows.filter((row) => {
    return (
      norm(row.source_ticket) === 'customer' &&
      row.classification_path !== 'Z_PERMINTAAN_044' &&
      !isUnknown(row.jenis_tiket_1) &&
      !isUnknown(row.jenis_tiket_2) &&
      !isNonTechToken(row.jenis_tiket_1) &&
      !isNonTechToken(row.jenis_tiket_2) &&
      isKpiCustomerToken(row.jenis_tiket_1)
    );
  });

  const summaryRule = rows.filter((row) => {
    return (
      norm(row.source_ticket) === 'customer' &&
      row.classification_path !== 'Z_PERMINTAAN_044' &&
      !isUnknown(row.jenis_tiket_1) &&
      !isUnknown(row.jenis_tiket_2) &&
      !isNonTechToken(row.jenis_tiket_1) &&
      !isNonTechToken(row.jenis_tiket_2) &&
      [
        'reguler',
        'datin',
        'non datin',
        'tsel',
        'vpn ip',
        'ccan',
        'regular',
        'dwdm',
        'digital_spbu',
        'digital spbu',
        'astinet',
        'metro-e',
        'indibiz',
        'reseller',
        'wifi-id',
      ].some((value) => norm(row.jenis_tiket_1).includes(value) || compact(row.jenis_tiket_1).includes(value.replace(/\s+/g, '')))
    );
  });

  const rowSet = new Set(rowRule.map((row) => row.incident));
  const summarySet = new Set(summaryRule.map((row) => row.incident));
  const onlyRow = [...rowSet].filter((incident) => !summarySet.has(incident));
  const onlySummary = [...summarySet].filter((incident) => !rowSet.has(incident));

  console.log(
    JSON.stringify(
      {
        dailyRows: rows.length,
        rowCount: rowSet.size,
        summaryCount: summarySet.size,
        onlyRowCount: onlyRow.length,
        onlySummaryCount: onlySummary.length,
        sampleOnlyRow: onlyRow.slice(0, 25),
        sampleOnlySummary: onlySummary.slice(0, 25),
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
