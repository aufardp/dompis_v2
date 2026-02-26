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

export async function pushSpreadsheet(): Promise<PushResult> {
  const result: PushResult = {
    success: false,
    count: 0,
  };

  if (isPushRunning) {
    console.log('[PUSH] Masih berjalan... skip');
    return result;
  }

  isPushRunning = true;

  try {
    console.log('[PUSH] Mulai:', nowWIB());

    const sheets = getSheetsClient();
    const spreadsheetId = getSpreadsheetId();

    // 🔹 1️⃣ Ambil semua ticket dari DB
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
    `);

    if (dbRows.length === 0) {
      result.success = true;
      return result;
    }

    // 🔹 2️⃣ Ambil INCIDENT dari spreadsheet
    const sheetResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `'WorkOrder_SO_1'!B8:B10000`,
    });

    const sheetIncidents = sheetResponse.data.values || [];

    const incidentMap = new Map<string, number>();

    sheetIncidents.forEach((row, index) => {
      const incident = row[0];
      if (incident) {
        incidentMap.set(incident, index + 8); // row number di sheet
      }
    });

    const updates: any[] = [];
    const inserts: any[] = [];

    for (const row of dbRows) {
      const rowNumber = incidentMap.get(row.INCIDENT);

      if (rowNumber) {
        // 🔥 UPDATE hanya 5 kolom
        updates.push(
          {
            range: `'WorkOrder_SO_1'!AD${rowNumber}`,
            values: [[row.HASIL_VISIT ?? '']],
          },
          {
            range: `'WorkOrder_SO_1'!AE${rowNumber}`,
            values: [[row.PENDING_REASON ?? '']],
          },
          {
            range: `'WorkOrder_SO_1'!W${rowNumber}`,
            values: [[row.NAMA_TEKNISI ?? '']],
          },
          {
            range: `'WorkOrder_SO_1'!AF${rowNumber}`,
            values: [[row.rca ?? '']],
          },
          {
            range: `'WorkOrder_SO_1'!AG${rowNumber}`,
            values: [[row.sub_rca ?? '']],
          },
        );
      } else {
        // 🔥 INSERT row baru (append)
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

    // 🔹 3️⃣ Jalankan UPDATE batch
    if (updates.length > 0) {
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId,
        requestBody: {
          valueInputOption: 'RAW',
          data: updates,
        },
      });
    }

    // 🔹 4️⃣ Append row baru jika ada
    if (inserts.length > 0) {
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: `'WorkOrder_SO_1'!B8`,
        valueInputOption: 'RAW',
        requestBody: {
          values: inserts,
        },
      });
    }

    result.success = true;
    result.count = dbRows.length;

    console.log(
      `[PUSH] Update ${updates.length / 5} rows, Insert ${inserts.length} rows`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[PUSH] Gagal ❌', message);
    result.error = message;
  } finally {
    isPushRunning = false;
  }

  return result;
}
