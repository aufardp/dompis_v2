import prisma from '@/app/libs/prisma';
import { getSheetsClient, getSpreadsheetId } from './client';
import { nowWIB } from './helpers';

const SHEET_NAME = 'Dummy_Dompis';
const START_ROW = 6;
const BATCH_SIZE = 200;
const RETRY_MAX = 3;
const MAX_READ_ROW = 50000;

let isPushRunning = false;

/**
 * Helper untuk deteksi perubahan data (Hashing)
 * Membandingkan kolom O (Status) dan AC-AG (Detail Perbaikan)
 */
function hashRow(data: any[]) {
  return data.map((v) => v?.toString()?.trim() ?? '').join('|');
}

/**
 * Helper Retry untuk koneksi Google API
 */
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
    console.log('[PUSH] START SYNC', nowWIB());
    const sheets = getSheetsClient();
    const spreadsheetId = getSpreadsheetId();

    // 1️⃣ FILTER: Ambil data tiket dengan sync_date hari ini
    const today = new Date();
    const startOfDay = new Date(today.setHours(0, 0, 0, 0));
    const endOfDay = new Date(today.setHours(23, 59, 59, 999));

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
        users: {
          select: {
            nama: true,
            username: true,
          },
        },
      },
    });

    if (tickets.length === 0) {
      console.log('[PUSH] Tidak ada data tiket untuk sync_date hari ini.');
      return { success: true, updated: 0, skipped: 0, notInSheet: 0 };
    }

    // 2️⃣ AMBIL DATA EXISTING DARI SHEET (B-AH) UNTUK PENCCOKAN
    const sheetRes = await retryGoogle(() =>
      sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `'${SHEET_NAME}'!B${START_ROW}:AH${MAX_READ_ROW}`,
      }),
    );

    const sheetRows = sheetRes.data.values || [];
    const sheetMap = new Map<string, { row: number; hash: string }>();

    // Mapping: INCIDENT -> { Nomor Baris, Fingerprint Data }
    sheetRows.forEach((r: any[], i: number) => {
      const incidentId = r[0]; // Kolom B
      if (!incidentId) return;

      // Hash kolom O (index 13) dan AC-AG (index 27-31)
      const hash = hashRow([r[13], r[27], r[28], r[29], r[30], r[31]]);
      sheetMap.set(incidentId.toString().trim(), {
        row: START_ROW + i,
        hash,
      });
    });

    // 3️⃣ PROSES MAPPING & UPDATE
    const updates: any[] = [];
    let skipped = 0;
    let notInSheet = 0;

    for (const t of tickets) {
      const closedAtStr = t.closed_at
        ? new Date(t.closed_at).toLocaleString('id-ID')
        : '';

      // Hash data dari Database
      const dbHash = hashRow([
        t.STATUS_UPDATE ?? '', // O
        t.STATUS_UPDATE ?? '', // AC
        t.PENDING_REASON ?? '', // AD
        t.rca ?? '', // AE
        t.sub_rca ?? '', // AF
        t.DESCRIPTION_ACTUAL_SOLUTION ?? '', // AG
      ]);

      const existingInSheet = sheetMap.get(t.INCIDENT.trim());

      // JIKA INCIDENT TIDAK ADA DI SHEET -> ABAIKAN (Sesuai Permintaan)
      if (!existingInSheet) {
        notInSheet++;
        continue;
      }

      // JIKA ADA TAPI DATA BERBEDA -> UPDATE
      if (existingInSheet.hash !== dbHash) {
        updates.push({
          range: `'${SHEET_NAME}'!V${existingInSheet.row}:AH${existingInSheet.row}`,
          values: [
            [
              t.ALAMAT ?? '', // V
              t.users?.nama ?? '', // W
              t.users?.username ?? '', // X (Labor Code)
              '',
              '',
              '',
              '', // Y, Z, AA, AB (Kosong/Tetap)
              t.STATUS_UPDATE ?? '', // AC (Status Dompis)
              t.PENDING_REASON ?? '', // AD (Update Kendala)
              t.rca ?? '', // AE
              t.sub_rca ?? '', // AF
              t.DESCRIPTION_ACTUAL_SOLUTION ?? '', // AG
              closedAtStr, // AH
            ],
          ],
        });

        // Update juga kolom O (Status Awal) jika diperlukan
        updates.push({
          range: `'${SHEET_NAME}'!O${existingInSheet.row}`,
          values: [[t.STATUS_UPDATE ?? '']],
        });
      } else {
        skipped++;
      }
    }

    // 4️⃣ EKSEKUSI BATCH UPDATE KE GOOGLE SHEETS
    if (updates.length > 0) {
      // Pecah menjadi chunk agar tidak melebihi limit payload Google API
      for (let i = 0; i < updates.length; i += BATCH_SIZE) {
        const chunk = updates.slice(i, i + BATCH_SIZE);
        await retryGoogle(() =>
          sheets.spreadsheets.values.batchUpdate({
            spreadsheetId,
            requestBody: {
              valueInputOption: 'RAW',
              data: chunk,
            },
          }),
        );
      }
    }

    console.log(
      `[PUSH] SELESAI | Updated: ${updates.length / 2} | Skipped: ${skipped} | Not in Sheet: ${notInSheet}`,
    );

    return {
      success: true,
      deleted: 0,
      inserted: 0,
      updated: updates.length / 2,
      skipped,
      notInSheet,
    };
  } catch (err: any) {
    console.error('[PUSH] FATAL ERROR:', err);
    return { success: false, error: err.message };
  } finally {
    isPushRunning = false;
  }
}
