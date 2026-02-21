import sheets from '@/app/libs/google';
import { prisma } from '@/app/libs/prisma';

const SPREADSHEET_ID = process.env.SPREADSHEET_ID!;
const RANGE = 'Rekap_WO_Hi!A1:HZ1000';

function mapSheetRowToTicket(row: string[]) {
  const get = (i: number): string | null => row[i]?.trim() || null;

  return {
    INCIDENT: row[0]?.trim() ?? '',
    SUMMARY: get(2),
    REPORTED_DATE: get(3),
    OWNER_GROUP: get(4),
    CUSTOMER_SEGMENT: get(6),
    SERVICE_TYPE: get(7),
    WORKZONE: get(9),
    STATUS: get(10),
    TICKET_ID_GAMAS: get(12),
    CONTACT_PHONE: get(14),
    CONTACT_NAME: get(15),
    BOOKING_DATE: get(17),
    SOURCE_TICKET: get(20),
    CUSTOMER_TYPE: get(24),
    SERVICE_NO: get(30),
    SYMPTOM: get(40),
    DESCRIPTION_ACTUAL_SOLUTION: get(43),
    DEVICE_NAME: get(47),
    JAM_EXPIRED_12_JAM_GOLD: get(84),
    STATUS_TTR_12_GOLD: get(85),
    JAM_EXPIRED_3_JAM_DIAMOND: get(102),
    JAM_EXPIRED_24_JAM_REGULER: get(113),
    STATUS_TTR_24_REGULER: get(114),
    JAM_EXPIRED_6_JAM_PLATINUM: get(115),
    STATUS_TTR_6_PLATINUM: get(116),
    JENIS_TIKET: get(117),
    JAM_EXPIRED: get(118),
    REDAMAN: get(119),
    MANJA_EXPIRED: get(120),
    ALAMAT: get(121),
  };
}

export interface PullResult {
  upserted: number;
  skipped: number;
  errors: number;
}

export async function pullFromSheet(): Promise<PullResult> {
  console.log('📥 Pulling data dari Google Sheets...');

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: RANGE,
  });

  const sheetData: string[][] = response.data.values ?? [];

  if (sheetData.length <= 1) {
    console.log('⚠️  Sheet kosong atau hanya header');
    return { upserted: 0, skipped: 0, errors: 0 };
  }

  const dataRows = sheetData.slice(1);
  console.log(`📊 Total baris ditemukan: ${dataRows.length}`);

  let upserted = 0;
  let skipped = 0;
  let errors = 0;

  for (const row of dataRows) {
    const incident = row[0]?.trim();

    if (!incident) {
      skipped++;
      continue;
    }

    try {
      const data = mapSheetRowToTicket(row);

      await prisma.ticket.upsert({
        where: { INCIDENT: incident },
        update: data,
        create: data,
      });

      upserted++;
    } catch (err) {
      console.error(`❌ Gagal upsert INCIDENT "${incident}":`, err);
      errors++;
    }
  }

  console.log(
    `✅ Pull selesai — upserted: ${upserted}, skipped: ${skipped}, errors: ${errors}`,
  );
  return { upserted, skipped, errors };
}
