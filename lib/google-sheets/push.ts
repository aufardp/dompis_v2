import pool, { RowDataPacket } from '../../lib/db';
import { getSheetsClient, getSpreadsheetId } from './client';
import { nowWIB } from './helpers';

interface PushResult {
  success: boolean;
  count: number;
  error?: string;
}

interface TicketRow extends RowDataPacket {
  INCIDENT: string;
  SUMMARY: string;
  REPORTED_DATE: string;
  OWNER_GROUP: string;
  SERVICE_TYPE: string;
  WORKZONE: string;
  STATUS: string;
  TICKET_ID_GAMAS: string;
  CONTACT_PHONE: string;
  CONTACT_NAME: string;
  CUSTOMER_TYPE: string;
  SERVICE_NO: string;
  SYMPTOM: string;
  DESCRIPTION_ACTUAL_SOLUTION: string;
  DEVICE_NAME: string;
  HASIL_VISIT: string;
  JENIS_TIKET: string;
  PENDING_REASON: string;
  ALAMAT: string;
  NAMA_TEKNISI: string;
  rca: string;
  sub_rca: string;
}

const columnMap: Record<string, string> = {
  B: 'INCIDENT',
  C: 'SUMMARY',
  D: 'REPORTED_DATE',
  E: 'OWNER_GROUP',
  F: 'SERVICE_TYPE',
  G: 'WORKZONE',
  K: 'STATUS',
  M: 'TICKET_ID_GAMAS',
  H: 'CONTACT_PHONE',
  I: 'CONTACT_NAME',
  J: 'CUSTOMER_TYPE',
  L: 'SERVICE_NO',
  N: 'SYMPTOM',
  O: 'DESCRIPTION_ACTUAL_SOLUTION',
  P: 'DEVICE_NAME',
  V: 'ALAMAT', // ← kolom baru
  AD: 'HASIL_VISIT', // ← kolom spreadsheet untuk HASIL_VISIT
  AE: 'PENDING_REASON', // ← kolom spreadsheet untuk PENDING_REASON
  AF: 'rca', // ← kolom spreadsheet untuk rca
  AG: 'sub_rca', // ← kolom spreadsheet untuk sub_rca
  Q: 'JENIS_TIKET',
  W: 'NAMA_TEKNISI',
};

let isPushRunning = false;

export async function pushSpreadsheet(): Promise<PushResult> {
  const result: PushResult = {
    success: false,
    count: 0,
  };

  if (isPushRunning) {
    console.log('Push masih berjalan... skip');
    return result;
  }

  isPushRunning = true;

  try {
    console.log('Auto Push mulai:', nowWIB());

    const [rows] = await pool.query<TicketRow[]>(`
      SELECT 
        t.*,
        u.nama AS NAMA_TEKNISI
      FROM ticket t
      LEFT JOIN users u
        ON t.teknisi_user_id = u.id_user
    `);

    if (rows.length === 0) {
      console.log('Tidak ada data untuk dipush');
      result.success = true;
      result.count = 0;
      return result;
    }

    const batchData = Object.entries(columnMap).map(([column, field]) => ({
      range: `'WorkOrder_SO_1'!${column}8:${column}10000`,
      values: rows.map((row) => [String(row[field as keyof TicketRow] ?? '')]),
    }));

    const sheets = getSheetsClient();
    const spreadsheetId = getSpreadsheetId();

    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: {
        valueInputOption: 'RAW',
        data: batchData,
      },
    });

    result.success = true;
    result.count = rows.length;

    console.log(`Push selesai ${rows.length} data ✅`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Push gagal ❌', errorMessage);
    result.error = errorMessage;
  } finally {
    isPushRunning = false;
  }

  return result;
}
