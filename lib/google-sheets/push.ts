import { query } from '../../app/libs/db';
import { RowDataPacket } from 'mysql2/promise';
import { getSheetsClient, getSpreadsheetId } from './client';
import { nowWIB } from './helpers';

interface PushResult {
  success: boolean;
  count: number;
  error?: string;
}

interface TicketRow extends RowDataPacket {
  INCIDENT: string;
  HASIL_VISIT: string;
  PENDING_REASON: string;
  NAMA_TEKNISI: string;
  rca: string;
  sub_rca: string;
}

let isPushRunning = false;

/**
 * CONFIG
 */
const SHEET_NAME = 'WorkOrder_SO_1';
const START_ROW = 8;

const MAX_INSERT_PER_RUN = 200;
const BATCH_UPDATE_CHUNK = 500;
const MAX_SHEET_CELLS = 10000000;

export async function pushSpreadsheet(): Promise<PushResult> {
  const result: PushResult = {
    success: false,
    count: 0,
  };

  if (isPushRunning) {
    console.log('[PUSH] Skip — masih berjalan');
    return result;
  }

  isPushRunning = true;

  try {
    console.log('[PUSH] Start:', nowWIB());

    const sheets = getSheetsClient();
    const spreadsheetId = getSpreadsheetId();

    /**
     * 1️⃣ Ambil data dari DB
     */
    const dbRows = await query<TicketRow[]>(`
      SELECT 
        t.INCIDENT,
        t.HASIL_VISIT,
        t.PENDING_REASON,
        t.rca,
        t.sub_rca,
        u.nama AS NAMA_TEKNISI
      FROM ticket t
      LEFT JOIN users u ON t.teknisi_user_id = u.id_user
      WHERE t.INCIDENT IS NOT NULL
    `);

    if (!dbRows.length) {
      console.log('[PUSH] Tidak ada data DB');
      result.success = true;
      return result;
    }

    /**
     * 2️⃣ Ambil semua INCIDENT dari sheet
     */
    const sheetResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `'${SHEET_NAME}'!B${START_ROW}:B`,
    });

    const sheetIncidents = sheetResponse.data.values || [];

    const incidentMap = new Map<string, number>();

    sheetIncidents.forEach((row, index) => {
      const incident = row[0];

      if (incident && !incidentMap.has(incident)) {
        incidentMap.set(incident, index + START_ROW);
      }
    });

    const sheetRowCount = sheetIncidents.length + START_ROW - 1;

    console.log('[PUSH] Sheet rows:', sheetRowCount);

    /**
     * 3️⃣ Proteksi limit Google Sheets
     */

    const estimatedCells = sheetRowCount * 40;

    if (estimatedCells > MAX_SHEET_CELLS) {
      throw new Error(
        `Spreadsheet hampir mencapai limit ${MAX_SHEET_CELLS} cells`,
      );
    }

    /**
     * 4️⃣ Prepare batch update & insert
     */

    const updates: any[] = [];
    const inserts: any[] = [];

    const seenIncident = new Set<string>();

    for (const row of dbRows) {
      if (seenIncident.has(row.INCIDENT)) continue;
      seenIncident.add(row.INCIDENT);

      const rowNumber = incidentMap.get(row.INCIDENT);

      if (rowNumber) {
        updates.push({
          range: `'${SHEET_NAME}'!W${rowNumber}:AG${rowNumber}`,
          values: [
            [
              row.NAMA_TEKNISI ?? '',
              '',
              '',
              '',
              '',
              '',
              '',
              row.HASIL_VISIT ?? '',
              row.PENDING_REASON ?? '',
              row.rca ?? '',
              row.sub_rca ?? '',
            ],
          ],
        });
      } else {
        inserts.push([
          row.INCIDENT,
          row.HASIL_VISIT ?? '',
          row.PENDING_REASON ?? '',
          row.NAMA_TEKNISI ?? '',
          row.rca ?? '',
          row.sub_rca ?? '',
        ]);
      }
    }

    /**
     * 5️⃣ Batch UPDATE dengan chunk
     */

    let updatedRows = 0;

    for (let i = 0; i < updates.length; i += BATCH_UPDATE_CHUNK) {
      const chunk = updates.slice(i, i + BATCH_UPDATE_CHUNK);

      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId,
        requestBody: {
          valueInputOption: 'RAW',
          data: chunk,
        },
      });

      updatedRows += chunk.length;
    }

    /**
     * 6️⃣ Insert row baru (limited)
     */

    const limitedInserts = inserts.slice(0, MAX_INSERT_PER_RUN);

    if (limitedInserts.length > 0) {
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: `'${SHEET_NAME}'!B${START_ROW}`,
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        requestBody: {
          values: limitedInserts,
        },
      });
    }

    console.log(
      `[PUSH] Update ${updatedRows} rows, Insert ${limitedInserts.length} rows`,
    );

    result.success = true;
    result.count = updatedRows + limitedInserts.length;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    console.error('[PUSH] ERROR ❌', message);

    result.error = message;
  } finally {
    isPushRunning = false;
  }

  return result;
}
