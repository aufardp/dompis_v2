import prisma from '@/app/libs/prisma';
import { getSheetsClient, getSpreadsheetId } from './client';
import { nowWIB } from './helpers';

const SHEET_NAME = 'Dummy_Dompis';
const START_ROW = 6;
const BATCH_SIZE = 200;
const RETRY_MAX = 3;
const MAX_READ_ROW = 50000;

let isPushRunning = false;

function hashRow(data: any[]) {
  return data.map((v) => v?.toString()?.trim() ?? '').join('|');
}

async function retryGoogle(fn: () => Promise<any>) {
  let attempt = 0;
  while (attempt < RETRY_MAX) {
    try {
      return await fn();
    } catch (err) {
      attempt++;
      if (attempt >= RETRY_MAX) throw err;
      await new Promise((r) => setTimeout(r, attempt * 1500));
    }
  }
}

export async function pushSpreadsheet() {
  if (isPushRunning)
    return { success: false, message: 'Process already running' };
  isPushRunning = true;

  try {
    console.log('PUSH START', nowWIB());
    const sheets = getSheetsClient();
    const spreadsheetId = getSpreadsheetId();

    // Hanya ambil data yang sync_date = HARI INI
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tickets = await prisma.ticket.findMany({
      where: {
        sync_date: {
          gte: today,
          lt: new Date(today.getTime() + 24 * 60 * 60 * 1000),
        },
      },
      select: {
        INCIDENT: true,
        STATUS_UPDATE: true,
        ALAMAT: true,
        PENDING_REASON: true,
        rca: true,
        sub_rca: true,
        DESCRIPTION_ACTUAL_SOLUTION: true,
        closed_at: true,
        teknisi_user_id: true,
        users: { select: { nama: true } },
      },
    });

    if (tickets.length === 0) {
      console.log('Tidak ada data baru untuk di-sync hari ini.');
      return { success: true, updated: 0, inserted: 0 };
    }

    // Ambil data B sampai AH untuk mapping Incident ID
    const sheetRes = await retryGoogle(() =>
      sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `'${SHEET_NAME}'!B${START_ROW}:AH${MAX_READ_ROW}`,
      }),
    );

    const sheetRows = sheetRes.data.values || [];
    const sheetMap = new Map<string, { row: number; hash: string }>();

    sheetRows.forEach((r: any[], i: number) => {
      const incident = r[0]; // Kolom B
      if (!incident) return;

      const hash = hashRow([r[13], r[27], r[28], r[29], r[30], r[31]]);
      sheetMap.set(incident, { row: START_ROW + i, hash });
    });

    // 3️⃣ MAPPING LOGIC
    const updates: any[] = [];
    const inserts: any[][] = [];
    let skipped = 0;

    for (const t of tickets) {
      const closedAtStr = t.closed_at
        ? new Date(t.closed_at).toLocaleString('id-ID')
        : '';

      // --- DATA UNTUK INSERT (BARIS BARU) ---
      const fullRowForInsert = new Array(33).fill('');
      fullRowForInsert[0] = t.INCIDENT; // B
      fullRowForInsert[13] = t.STATUS_UPDATE ?? ''; // O
      fullRowForInsert[20] = t.ALAMAT ?? ''; // V
      fullRowForInsert[21] = t.teknisi_user_id?.toString() ?? ''; // W
      fullRowForInsert[22] = t.users?.nama ?? ''; // X
      fullRowForInsert[27] = t.STATUS_UPDATE ?? ''; // AC (Status Dompis)
      fullRowForInsert[28] = t.PENDING_REASON ?? ''; // AD
      fullRowForInsert[29] = t.rca ?? ''; // AE
      fullRowForInsert[30] = t.sub_rca ?? ''; // AF
      fullRowForInsert[31] = t.DESCRIPTION_ACTUAL_SOLUTION ?? ''; // AG
      fullRowForInsert[32] = closedAtStr; // AH

      const updateDataOnly = fullRowForInsert.slice(20);

      const dbHash = hashRow([
        t.STATUS_UPDATE ?? '',
        t.STATUS_UPDATE ?? '', // AC
        t.PENDING_REASON ?? '',
        t.rca ?? '',
        t.sub_rca ?? '',
        t.DESCRIPTION_ACTUAL_SOLUTION ?? '',
      ]);

      const sheetRow = sheetMap.get(t.INCIDENT);

      if (!sheetRow) {
        inserts.push(fullRowForInsert);
      } else if (sheetRow.hash !== dbHash) {
        updates.push({
          range: `'${SHEET_NAME}'!V${sheetRow.row}:AH${sheetRow.row}`,
          values: [updateDataOnly],
        });
      } else {
        skipped++;
      }
    }

    // Target Kolom V:AH
    for (let i = 0; i < updates.length; i += BATCH_SIZE) {
      const chunk = updates.slice(i, i + BATCH_SIZE);
      await retryGoogle(() =>
        sheets.spreadsheets.values.batchUpdate({
          spreadsheetId,
          requestBody: { valueInputOption: 'RAW', data: chunk },
        }),
      );
    }

    if (inserts.length > 0) {
      await retryGoogle(() =>
        sheets.spreadsheets.values.append({
          spreadsheetId,
          range: `'${SHEET_NAME}'!B${START_ROW}`,
          valueInputOption: 'RAW',
          requestBody: { values: inserts },
        }),
      );
    }

    console.log(
      `PUSH DONE | Updated Rows (V-AH): ${updates.length} | New Rows: ${inserts.length} | Skipped: ${skipped}`,
    );
    return { success: true, updated: updates.length, inserted: inserts.length };
  } catch (err: any) {
    console.error('PUSH ERROR:', err);
    return { success: false, error: err.message };
  } finally {
    isPushRunning = false;
  }
}
