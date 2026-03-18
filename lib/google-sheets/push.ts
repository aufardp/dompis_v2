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

    // 1️⃣ FILTER DB: Hanya ambil data yang sync_date = HARI INI
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

    // 2️⃣ GET EXISTING DATA DI SHEET (Untuk Cek Incident & Hash)
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

      // Hash kolom monitor (O, AC, AD, AE, AF, AG)
      const hash = hashRow([r[13], r[27], r[28], r[29], r[30], r[31]]);
      sheetMap.set(incident, { row: START_ROW + i, hash });
    });

    // 3️⃣ MAPPING & FILTERING
    const updates: any[] = [];
    const inserts: any[][] = [];
    let skipped = 0;

    for (const t of tickets) {
      const closedAtStr = t.closed_at
        ? new Date(t.closed_at).toLocaleString('id-ID')
        : '';

      const fullRow = new Array(33).fill('');
      fullRow[0] = t.INCIDENT; // B
      fullRow[13] = t.STATUS_UPDATE ?? ''; // O
      fullRow[20] = t.ALAMAT ?? ''; // V
      fullRow[21] = t.teknisi_user_id?.toString() ?? ''; // W
      fullRow[22] = t.users?.nama ?? ''; // X
      fullRow[27] = t.STATUS_UPDATE ?? ''; // AC
      fullRow[28] = t.PENDING_REASON ?? ''; // AD
      fullRow[29] = t.rca ?? ''; // AE
      fullRow[30] = t.sub_rca ?? ''; // AF
      fullRow[31] = t.DESCRIPTION_ACTUAL_SOLUTION ?? ''; // AG
      fullRow[32] = closedAtStr; // AH

      const dbHash = hashRow([
        t.STATUS_UPDATE ?? '',
        t.STATUS_UPDATE ?? '',
        t.PENDING_REASON ?? '',
        t.rca ?? '',
        t.sub_rca ?? '',
        t.DESCRIPTION_ACTUAL_SOLUTION ?? '',
      ]);

      const sheetRow = sheetMap.get(t.INCIDENT);

      if (!sheetRow) {
        inserts.push(fullRow); // Incident belum ada di sheet
      } else if (sheetRow.hash !== dbHash) {
        updates.push({
          range: `'${SHEET_NAME}'!B${sheetRow.row}:AH${sheetRow.row}`,
          values: [fullRow],
        });
      } else {
        skipped++; // Data identik, abaikan
      }
    }

    // 4️⃣ EXECUTE UPDATES
    for (let i = 0; i < updates.length; i += BATCH_SIZE) {
      const chunk = updates.slice(i, i + BATCH_SIZE);
      await retryGoogle(() =>
        sheets.spreadsheets.values.batchUpdate({
          spreadsheetId,
          requestBody: { valueInputOption: 'RAW', data: chunk },
        }),
      );
    }

    // 5️⃣ EXECUTE INSERTS (Gunakan APPEND agar tidak Error Grid Limit)
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
      `PUSH DONE | Updated: ${updates.length} | Inserted: ${inserts.length} | Skipped: ${skipped}`,
    );
    return { success: true, updated: updates.length, inserted: inserts.length };
  } catch (err: any) {
    console.error('PUSH ERROR:', err);
    return { success: false, error: err.message };
  } finally {
    isPushRunning = false;
  }
}
