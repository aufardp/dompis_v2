import prisma from '@/app/libs/prisma';
import { getSheetsClient, getSpreadsheetId } from './client';
import { nowWIB } from './helpers';

const SHEET_NAME = 'Dummy_Dompis';
const START_ROW = 6;
const BATCH_SIZE = 200;
const RETRY_MAX = 3;
const MAX_READ_ROW = 50000;

let isPushRunning = false;

// Helper untuk deteksi perubahan data (Hashing)
function hashRow(data: any[]) {
  return data.map((v) => v?.toString()?.trim() ?? '').join('|');
}

// Helper Retry untuk koneksi Google API
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
    console.log('[PUSH] START', nowWIB());
    const sheets = getSheetsClient();
    const spreadsheetId = getSpreadsheetId();

    // 1️⃣ FILTER: Hanya ambil data yang sync_date-nya HARI INI
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    const tickets = await prisma.ticket.findMany({
      where: {
        sync_date: {
          gte: startOfDay,
          lte: endOfDay,
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
        users: { select: { nama: true, username: true } },
      },
    });

    if (tickets.length === 0) {
      console.log('[PUSH] Tidak ada data dengan sync_date hari ini.');
      return { success: true, updated: 0, inserted: 0 };
    }

    // 2️⃣ AMBIL DATA EXISTING DARI SHEET (B-AH) UNTUK MAPPING
    const sheetRes = await retryGoogle(() =>
      sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `'${SHEET_NAME}'!B${START_ROW}:AH${MAX_READ_ROW}`,
      }),
    );

    const sheetRows = sheetRes.data.values || [];
    const sheetMap = new Map<string, { row: number; hash: string }>();

    sheetRows.forEach((r: any[], i: number) => {
      const incidentId = r[0]; // Kolom B
      if (!incidentId) return;

      // Hash kolom yang sering berubah untuk deteksi update (O, AC-AG)
      const hash = hashRow([r[13], r[27], r[28], r[29], r[30], r[31]]);
      sheetMap.set(incidentId, { row: START_ROW + i, hash });
    });

    // 3️⃣ LOGIKA MAPPING: INSERT ATAU UPDATE
    const updates: any[] = [];
    const inserts: any[][] = [];
    let skipped = 0;

    for (const t of tickets) {
      const closedAtStr = t.closed_at
        ? new Date(t.closed_at).toLocaleString('id-ID')
        : '';

      // Hash data dari DB untuk dibandingkan dengan Sheet
      const dbHash = hashRow([
        t.STATUS_UPDATE ?? '', // O
        t.STATUS_UPDATE ?? '', // AC
        t.PENDING_REASON ?? '', // AD
        t.rca ?? '', // AE
        t.sub_rca ?? '', // AF
        t.DESCRIPTION_ACTUAL_SOLUTION ?? '', // AG
      ]);

      const existingInSheet = sheetMap.get(t.INCIDENT);

      if (!existingInSheet) {
        // JIKA TIDAK ADA DI SHEET -> INSERT BARU (B-AH)
        const newRow = new Array(33).fill('');
        newRow[0] = t.INCIDENT; // B
        newRow[13] = t.STATUS_UPDATE ?? ''; // O
        newRow[20] = t.ALAMAT ?? ''; // V
        newRow[21] = t.users?.nama ?? ''; // W
        newRow[22] = t.users?.username ?? ''; // X
        newRow[27] = t.STATUS_UPDATE ?? ''; // AC
        newRow[28] = t.PENDING_REASON ?? ''; // AD
        newRow[29] = t.rca ?? ''; // AE
        newRow[30] = t.sub_rca ?? ''; // AF
        newRow[31] = t.DESCRIPTION_ACTUAL_SOLUTION ?? ''; // AG
        newRow[32] = closedAtStr; // AH
        inserts.push(newRow);
      } else if (existingInSheet.hash !== dbHash) {
        // JIKA ADA TAPI HASH BEDA -> UPDATE KOLOM TERTENTU (V-AH)
        updates.push({
          range: `'${SHEET_NAME}'!V${existingInSheet.row}:AH${existingInSheet.row}`,
          values: [
            [
              t.ALAMAT ?? '', // V
              t.users?.nama ?? '', // W
              t.users?.username ?? '', // X
              '',
              '',
              '', // Y, Z, AA (Kosongkan jika tidak dipakai)
              '', // AB
              t.STATUS_UPDATE ?? '', // AC
              t.PENDING_REASON ?? '', // AD
              t.rca ?? '', // AE
              t.sub_rca ?? '', // AF
              t.DESCRIPTION_ACTUAL_SOLUTION ?? '', // AG
              closedAtStr, // AH
            ],
          ],
        });
      } else {
        skipped++;
      }
    }

    // 4️⃣ EKSEKUSI UPDATE (BATCH)
    if (updates.length > 0) {
      for (let i = 0; i < updates.length; i += BATCH_SIZE) {
        const chunk = updates.slice(i, i + BATCH_SIZE);
        await retryGoogle(() =>
          sheets.spreadsheets.values.batchUpdate({
            spreadsheetId,
            requestBody: { valueInputOption: 'RAW', data: chunk },
          }),
        );
      }
    }

    // 5️⃣ EKSEKUSI INSERT (APPEND)
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
      `[PUSH] DONE | New: ${inserts.length} | Updated: ${updates.length} | Skipped: ${skipped}`,
    );
    return { success: true, updated: updates.length, inserted: inserts.length };
  } catch (err: any) {
    console.error('[PUSH] FATAL ERROR:', err);
    return { success: false, error: err.message };
  } finally {
    isPushRunning = false;
  }
}
