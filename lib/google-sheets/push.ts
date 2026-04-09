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

    const todayIncidentSet = new Set(
      tickets.map((t: { INCIDENT: string }) => t.INCIDENT),
    );
    console.log(`[PUSH] Tickets hari ini: ${tickets.length}`);

    if (tickets.length === 0) {
      console.log('[PUSH] Tidak ada data dengan sync_date hari ini.');
      return { success: true, updated: 0, inserted: 0, deleted: 0 };
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

    // Build map dari sheet: INCIDENT -> {row, hash}
    sheetRows.forEach((r: any[], i: number) => {
      const incidentId = r[0]; // Kolom B (index 0 dalam array = kolom B)
      if (!incidentId) return;

      // Hash kolom yang sering berubah untuk deteksi update (O, AC-AG)
      const hash = hashRow([r[13], r[27], r[28], r[29], r[30], r[31]]);
      sheetMap.set(incidentId, { row: START_ROW + i, hash });
    });

    console.log(`[PUSH] Rows di sheet: ${sheetMap.size}`);

    // 3️⃣ DELETE LAMA: Hapus baris yang tidak ada di sync_date hari ini
    // EXTRA PROTECTION: Jangan pernah delete row 5 (START_ROW = 6, jadi aman)
    const rowsToDelete: number[] = [];

    for (const [incidentId, data] of sheetMap) {
      if (!todayIncidentSet.has(incidentId)) {
        rowsToDelete.push(data.row);
      }
    }

    console.log(`[PUSH] Rows untuk dihapus: ${rowsToDelete.length}`);

    // Delete dalam batch
    if (rowsToDelete.length > 0) {
      const deleteRequests = rowsToDelete.map((row) => ({
        deleteDimension: {
          range: {
            sheetId: 0, // Sheet pertama
            dimension: 'ROWS',
            startRowIndex: row - 1, // Google Sheets uses 0-indexed
            endRowIndex: row,
          },
        },
      }));

      // Eksekusi delete dalam batch (maks 50 per request)
      for (let i = 0; i < deleteRequests.length; i += 50) {
        const chunk = deleteRequests.slice(i, i + 50);
        await retryGoogle(() =>
          sheets.spreadsheets.batchUpdate({
            spreadsheetId,
            requestBody: { requests: chunk },
          }),
        );
        console.log(
          `[PUSH] Deleted chunk ${Math.floor(i / 50) + 1}/${Math.ceil(deleteRequests.length / 50)}`,
        );
      }
    }

    // 4️⃣ LOGIKA UPDATE: INSERT ATAU UPDATE untuk data hari ini
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
        // EXTRA PROTECTION: Array index 0 = Kolom B (bukan A)
        const newRow = new Array(33).fill('');
        newRow[0] = t.INCIDENT; // B (index 0 dalam range B-AH)
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
        // EXTRA PROTECTION: Range dimulai dari V (tidak pernah menyentuh A atau B)
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

    console.log(
      `[PUSH] Insert: ${inserts.length}, Update: ${updates.length}, Skip: ${skipped}`,
    );

    // 5️⃣ EKSEKUSI UPDATE (BATCH)
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
      console.log(`[PUSH] Updated ${updates.length} rows`);
    }

    // 6️⃣ EKSEKUSI INSERT (APPEND)
    // EXTRA PROTECTION: Range eksplisit 'B6:AH' - JANGAN pernah tulis ke kolom A
    if (inserts.length > 0) {
      // Insert dalam batch maksimal 500 row per request
      for (let i = 0; i < inserts.length; i += 500) {
        const chunk = inserts.slice(i, i + 500);
        await retryGoogle(() =>
          sheets.spreadsheets.values.append({
            spreadsheetId,
            range: `'${SHEET_NAME}'!B${START_ROW}:AH`, // EXTRA PROTECTION: Explicit mulai dari B
            valueInputOption: 'RAW',
            requestBody: { values: chunk },
          }),
        );
      }
      console.log(`[PUSH] Inserted ${inserts.length} rows`);
    }

    console.log(
      `[PUSH] DONE | Deleted: ${rowsToDelete.length} | New: ${inserts.length} | Updated: ${updates.length} | Skipped: ${skipped}`,
    );
    return {
      success: true,
      deleted: rowsToDelete.length,
      updated: updates.length,
      inserted: inserts.length,
      skipped,
    };
  } catch (err: any) {
    console.error('[PUSH] FATAL ERROR:', err);
    return { success: false, error: err.message };
  } finally {
    isPushRunning = false;
  }
}
