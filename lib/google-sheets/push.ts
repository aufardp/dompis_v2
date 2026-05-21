import prisma from '@/app/libs/prisma';
import { getSheetsClient, getSpreadsheetId } from './client';
import { nowWIB } from './helpers';
import { formatInTimeZone } from 'date-fns-tz';
import { sheetsQueue, sleep } from '@/lib/worker-queue';

const SHEET_NAME = 'Dummy_Dompis';
const START_ROW = 6;
const BATCH_SIZE = 100;
const RETRY_MAX = 3;
const MAX_READ_ROW = 100000;
const WIB = 'Asia/Jakarta';

let isPushRunning = false;

// ──────────────────────────────────────────────────────────────────────────────
// HELPERS
// ──────────────────────────────────────────────────────────────────────────────

function hashRow(data: any[]): string {
  return data.map((v) => v?.toString()?.trim() ?? '').join('|');
}

async function sheetsApiCall<T>(
  label: string,
  fn: () => Promise<T>,
): Promise<T> {
  return sheetsQueue.enqueue(label, async () => {
    let attempt = 0;
    while (attempt < RETRY_MAX) {
      try {
        return await fn();
      } catch (err) {
        attempt++;
        if (attempt >= RETRY_MAX) throw err;
        await sleep(attempt * 2000);
      }
    }
    throw new Error('Max retries exceeded');
  });
}

function formatDateWIB(date: Date | null | undefined): string {
  if (!date) return '';
  return formatInTimeZone(date, WIB, 'dd/MM/yyyy HH:mm:ss');
}

// ──────────────────────────────────────────────────────────────────────────────
// MAIN PUSH FUNCTION
// ──────────────────────────────────────────────────────────────────────────────

export async function pushSpreadsheet(signal?: AbortSignal) {
  if (isPushRunning) {
    return { success: false, message: 'Process already running' };
  }

  if (signal?.aborted) {
    console.log('[PUSH] Cancelled before start');
    return { success: false, message: 'Cancelled' };
  }

  isPushRunning = true;

  try {
    console.log('[PUSH] START', nowWIB());

    const sheets = getSheetsClient();
    const spreadsheetId = getSpreadsheetId();

    // ──────────────────────────────────────────────────────────────────────────
    // STEP 1: Baca SEMUA incident dari kolom B di Dummy_Dompis
    //         Bangun map: incident → nomor baris di sheet
    // ──────────────────────────────────────────────────────────────────────────

    if (signal?.aborted) throw new Error('Push cancelled');

    const incidentColRes = await sheetsApiCall('push:readIncidentCol', () =>
      sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `'${SHEET_NAME}'!B${START_ROW}:B${MAX_READ_ROW}`,
      }),
    );

    const incidentRows: string[][] = incidentColRes.data.values || [];

    if (incidentRows.length === 0) {
      console.log('[PUSH] Sheet kosong, tidak ada incident ditemukan.');
      return { success: true, updated: 0, skipped: 0 };
    }

    // Map: incident → row number di sheet (1-indexed, sesuai Google Sheets API)
    const incidentToRowMap = new Map<string, number>();
    incidentRows.forEach((row, idx) => {
      const incident = row[0]?.trim();
      if (incident) {
        const sheetRowNum = START_ROW + idx;
        incidentToRowMap.set(incident, sheetRowNum);
      }
    });

    console.log(`[PUSH] Ditemukan ${incidentToRowMap.size} incident di sheet`);

    // ──────────────────────────────────────────────────────────────────────────
    // STEP 2: Baca kolom V-AH yang sudah ada di sheet untuk deteksi perubahan
    //         Ini untuk avoid update jika data sama
    // ──────────────────────────────────────────────────────────────────────────

    if (signal?.aborted) throw new Error('Push cancelled');

    const currentVAHRes = await sheetsApiCall('push:readCurrentVAH', () =>
      sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `'${SHEET_NAME}'!B${START_ROW}:AH${MAX_READ_ROW}`,
        valueRenderOption: 'UNFORMATTED_VALUE',
      }),
    );

    const currentRows: any[][] = currentVAHRes.data.values || [];

    // Map: incident → hash kolom V-AH saat ini di sheet
    const sheetHashMap = new Map<string, string>();
    currentRows.forEach((row) => {
      const incident = row[0]?.toString()?.trim(); // kolom B = index 0
      if (!incident) return;

      // Kolom V-AH = index 20-32 dalam range B:AH (B=0, C=1, ..., V=20, AH=32)
      const vahData = row.slice(20, 33); // V sampai AH = 13 kolom
      sheetHashMap.set(incident, hashRow(vahData));
    });

    // ──────────────────────────────────────────────────────────────────────────
    // STEP 3: Ambil data dari MySQL untuk SEMUA incident yang ada di sheet
    //         Tidak dibatasi sync_date — ambil semua yang punya perubahan
    // ──────────────────────────────────────────────────────────────────────────

    const allIncidents = Array.from(incidentToRowMap.keys());

    if (allIncidents.length === 0) {
      return { success: true, updated: 0, skipped: 0 };
    }

    // Ambil dalam batch agar tidak melebihi limit query
    const DB_BATCH_SIZE = 1000;
    const allTickets: any[] = [];

    for (let i = 0; i < allIncidents.length; i += DB_BATCH_SIZE) {
      const batch = allIncidents.slice(i, i + DB_BATCH_SIZE);
      const tickets = await prisma.ticket.findMany({
        where: {
          incident: { in: batch },
        },
        select: {
          incident: true,
          alamat: true,
          status_update: true,
          pending_dompis: true,
          rca: true,
          sub_rca: true,
          description_solution_dompis: true,
          closed_at: true,
          teknisi_user_id: true,
          users: {
            select: {
              nama: true,
              nik: true,
              username: true,
            },
          },
        },
      });
      allTickets.push(...tickets);
    }

    console.log(`[PUSH] Data MySQL: ${allTickets.length} tiket ditemukan`);

    // ──────────────────────────────────────────────────────────────────────────
    // STEP 4: Bandingkan data MySQL vs sheet, buat list update
    //         HANYA UPDATE kolom V-AH jika ada perubahan
    //         TIDAK PERNAH insert baris baru atau sentuh kolom A-U
    // ──────────────────────────────────────────────────────────────────────────

    const updates: Array<{ range: string; values: any[][] }> = [];
    let skipped = 0;
    let notInSheet = 0;

    for (const t of allTickets) {
      const sheetRow = incidentToRowMap.get(t.incident);

      if (!sheetRow) {
        // Tiket ada di DB tapi tidak ada di sheet — skip, tidak bisa insert
        notInSheet++;
        continue;
      }

      const closedAtStr = formatDateWIB(t.closed_at);
      const teknisiNama = t.users?.nama ?? '';
      const teknisiNik = t.users?.nik ?? ''; // NIK sebagai labor code

      // Build data untuk kolom V-AH (13 kolom: V, W, X, Y, Z, AA, AB, AC, AD, AE, AF, AG, AH)
      const vahValues = [
        t.alamat ?? '', // V  = alamat
        teknisiNama, // W  = TEKNISI 1 (nama)
        teknisiNik, // X  = LABOR CODE 1 (NIK teknisi)
        '', // Y  = SEKTOR (kosong, diisi manual)
        '', // Z  = TEKNISI 2 (kosong)
        '', // AA = LABOR CODE 2 (kosong)
        '', // AB = STATUS INSERA (kosong, sistem lain)
        t.status_update ?? '', // AC = STATUS DOMPIS
        t.pending_dompis ?? '', // AD = UPDATE_KENDALA
        t.rca ?? '', // AE = RCA
        t.sub_rca ?? '', // AF = SUB_RCA
        t.description_solution_dompis ?? '', // AG = DETAIL_PERBAIKAN
        closedAtStr, // AH = CLOSED_AT
      ];

      // Cek apakah data berubah dibanding sheet saat ini
      const newHash = hashRow(vahValues);
      const currentHash = sheetHashMap.get(t.incident) ?? '';

      if (newHash === currentHash) {
        skipped++;
        continue; // Tidak ada perubahan, skip
      }

      // Ada perubahan → tambahkan ke list update
      updates.push({
        range: `'${SHEET_NAME}'!V${sheetRow}:AH${sheetRow}`,
        values: [vahValues],
      });
    }

    console.log(
      `[PUSH] Updates: ${updates.length} | Skipped (no change): ${skipped} | Not in sheet: ${notInSheet}`,
    );

    // ──────────────────────────────────────────────────────────────────────────
    // STEP 5: Eksekusi update ke Google Sheets dalam batch
    //         Hanya kolom V-AH, TIDAK menyentuh A-U sama sekali
    // ──────────────────────────────────────────────────────────────────────────

    if (updates.length === 0) {
      console.log('[PUSH] Tidak ada perubahan. Sheet sudah sinkron.');
      return { success: true, updated: 0, skipped };
    }

    let totalUpdated = 0;

    for (let i = 0; i < updates.length; i += BATCH_SIZE) {
      if (signal?.aborted) {
        console.log('[PUSH] Cancelled during batchUpdate');
        break;
      }

      const chunk = updates.slice(i, i + BATCH_SIZE);

      await sheetsApiCall(`push:batchUpdate[${i}..${i + chunk.length}]`, () =>
        sheets.spreadsheets.values.batchUpdate({
          spreadsheetId,
          requestBody: {
            valueInputOption: 'USER_ENTERED', // USER_ENTERED agar tanggal diparse dengan benar
            data: chunk,
          },
        }),
      );

      totalUpdated += chunk.length;
      console.log(`[PUSH] Progress: ${totalUpdated}/${updates.length}`);
    }

    console.log(
      `[PUSH] DONE | Updated: ${totalUpdated} | Skipped: ${skipped} | ${nowWIB()}`,
    );
    return { success: true, updated: totalUpdated, skipped };
  } catch (err: any) {
    console.error('[PUSH] FATAL ERROR:', err?.message ?? err);
    return { success: false, error: err?.message ?? 'Unknown error' };
  } finally {
    isPushRunning = false;
  }
}
