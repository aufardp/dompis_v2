import prisma from '@/app/libs/prisma';
import { getSheetsClient, getSpreadsheetId } from './client';
import { nowWIB } from './helpers';

// Expanded range to cover more rows — adjust based on actual sheet size
// If sheet has > 10000 rows, increase this number or use open-ended range
const RANGE = 'WO_B2B_B2C!A1:HZ10000';
const BATCH_SIZE = 500;
const RETRY_MAX = 3;

interface SyncResult {
  inserted: number;
  updated: number;
  errors: string[];
}

let isSyncRunning = false;

/* ----------------------------- RETRY GOOGLE API ----------------------------- */

async function fetchSheet(sheets: any, spreadsheetId: string) {
  let attempt = 0;

  while (attempt < RETRY_MAX) {
    try {
      return await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: RANGE,
      });
    } catch (err) {
      attempt++;
      if (attempt >= RETRY_MAX) throw err;
      await new Promise((r) => setTimeout(r, attempt * 1000));
    }
  }
}

/* ------------------------------ ARRAY CHUNKING ------------------------------ */

function chunkArray<T>(array: T[], size: number) {
  const result: T[][] = [];

  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size));
  }

  return result;
}

/* ---------------------------- BUILD COLUMN MAP ----------------------------- */

function buildColumnMap(header: string[]) {
  const find = (name: string) => header.indexOf(name);

  return {
    INCIDENT: find('INCIDENT'),
    SUMMARY: find('SUMMARY'),
    REPORTED_DATE: find('REPORTED_DATE'),
    OWNER_GROUP: find('OWNER_GROUP'),
    CUSTOMER_SEGMENT: find('CUSTOMER_SEGMENT'),
    SERVICE_TYPE: find('SERVICE_TYPE'),
    WORKZONE: find('WORKZONE'),
    STATUS: find('STATUS'),
    TICKET_ID_GAMAS: find('TICKET_ID_GAMAS'),
    CONTACT_PHONE: find('CONTACT_PHONE'),
    CONTACT_NAME: find('CONTACT_NAME'),
    BOOKING_DATE: find('BOOKING_DATE'),
    SOURCE_TICKET: find('SOURCE_TICKET'),
    CUSTOMER_TYPE: find('CUSTOMER_TYPE'),
    SERVICE_NO: find('SERVICE_NO'),
    SYMPTOM: find('SYMPTOM'),
    DESCRIPTION_ACTUAL_SOLUTION: find('DESCRIPTION_ACTUAL_SOLUTION'),
    DEVICE_NAME: find('DEVICE_NAME'),
    JENIS_TIKET: find('JENIS_TIKET2'),
    JAM_EXPIRED: find('JAM_EXPIRED'),
    REDAMAN: find('REDAMAN'),
    MANJA_EXPIRED: find('MANJA_EXPIRED'),
    ALAMAT: find('ALAMAT'),
    PENDING_REASON: find('PENDING_REASON'),
    GUARANTE_STATUS: find('GUARANTE_STATUS'),
    FLAGGING_MANJA: find('FLAGGING_MANJA'),
    LAPUL: find('LAPUL'),
    GAUL: find('GAUL'),
    ONU_RX: find('ONU_RX'),
    STATUS_UPDATE: find('STATUS_UPDATE'),
    STATUS_MANJA: find('STATUS_MANJA'),

    JAM_EXPIRED_12_JAM_GOLD: find('Jam_Expired_12_Jam_Gold'),
    STATUS_TTR_12_GOLD: find('STATUS_TTR_12_Gold'),
    JAM_EXPIRED_3_JAM_DIAMOND: find('Jam_Expired_3_Jam_Diamond'),
    STATUS_TTR_3_DIAMOND: find('STATUS_TTR_3_Diamond'),
    JAM_EXPIRED_24_JAM_REGULER: find('Jam_Expired_24_Jam_Reguler'),
    STATUS_TTR_24_REGULER: find('STATUS_TTR_24_Reguler'),
    JAM_EXPIRED_6_JAM_PLATINUM: find('Jam_Expired_6_Jam_Platinum'),
    STATUS_TTR_6_PLATINUM: find('STATUS_TTR_6_Platinum'),

    TTR_K1_DATIN_1_5_JAM: find('TTR_K1_DATIN_1,5_JAM'),
    TTR_K1_REPAIR_K2_DATIN_3_6_JAM: find('TTR_K1_REPAIR_DAN_K2_DATIN_3.6_JAM'),
    TTR_K3_DATIN_7_2_JAM: find('TTR_K3_DATIN_7.2_JAM'),
    TTR_INDIBIZ_4_JAM: find('TTR_INDIBIZ_4_JAM'),
    TTR_INDIBIZ_24_JAM: find('TTR_INDIBIZ_24_JAM'),
    TTR_INDIHOME_RESELLER_6_JAM: find('TTR_INDIHOME_RESELLER_6_JAM'),
    TTR_INDIHOME_RESELLER_36_JAM: find('TTR_INDIHOME_RESELLER_36_JAM'),
    TTR_WIFI_24_JAM: find('TTR_WIFI_24_JAM'),

    rca: find('rca'),
    sub_rca: find('sub_rca'),
  };
}

/* ------------------------------- MAP ROW -------------------------------- */

function mapRow(row: string[], col: any) {
  const get = (key: string) => {
    const idx = col[key];
    if (idx === -1 || idx === undefined) return null;
    return row[idx] ?? null;
  };

  return [
    get('INCIDENT'),
    get('SUMMARY'),
    get('REPORTED_DATE'),
    get('OWNER_GROUP'),
    get('CUSTOMER_SEGMENT'),
    get('SERVICE_TYPE'),
    get('WORKZONE'),
    get('STATUS'),
    get('TICKET_ID_GAMAS'),
    get('CONTACT_PHONE'),
    get('CONTACT_NAME'),
    get('BOOKING_DATE'),
    get('SOURCE_TICKET'),
    get('CUSTOMER_TYPE'),
    get('SERVICE_NO'),
    get('SYMPTOM'),
    get('DESCRIPTION_ACTUAL_SOLUTION'),
    get('DEVICE_NAME'),
    get('JENIS_TIKET'),
    get('JAM_EXPIRED'),
    get('REDAMAN'),
    get('MANJA_EXPIRED'),
    get('ALAMAT'),
    get('PENDING_REASON'),
    get('GUARANTE_STATUS'),
    get('FLAGGING_MANJA'),
    get('LAPUL'),
    get('GAUL'),
    get('ONU_RX'),
    get('STATUS_UPDATE'),
    get('STATUS_MANJA'),
    get('JAM_EXPIRED_12_JAM_GOLD'),
    get('STATUS_TTR_12_GOLD'),
    get('JAM_EXPIRED_3_JAM_DIAMOND'),
    get('STATUS_TTR_3_DIAMOND'),
    get('JAM_EXPIRED_24_JAM_REGULER'),
    get('STATUS_TTR_24_REGULER'),
    get('JAM_EXPIRED_6_JAM_PLATINUM'),
    get('STATUS_TTR_6_PLATINUM'),
    get('TTR_K1_DATIN_1_5_JAM'),
    get('TTR_K1_REPAIR_K2_DATIN_3_6_JAM'),
    get('TTR_K3_DATIN_7_2_JAM'),
    get('TTR_INDIBIZ_4_JAM'),
    get('TTR_INDIBIZ_24_JAM'),
    get('TTR_INDIHOME_RESELLER_6_JAM'),
    get('TTR_INDIHOME_RESELLER_36_JAM'),
    get('TTR_WIFI_24_JAM'),
    get('rca'),
    get('sub_rca'),
  ];
}

/* ------------------------------- SYNC -------------------------------- */

export async function syncSpreadsheet(): Promise<SyncResult> {
  const result: SyncResult = {
    inserted: 0,
    updated: 0,
    errors: [],
  };

  if (isSyncRunning) return result;

  isSyncRunning = true;

  try {
    console.log('SYNC START', nowWIB());

    const sheets = getSheetsClient();
    const spreadsheetId = getSpreadsheetId();

    const response = await fetchSheet(sheets, spreadsheetId);

    const rows = response.data.values || [];

    if (rows.length <= 1) return result;

    const header = rows[0];
    const col = buildColumnMap(header);

    const mappedRows: any[] = [];

    for (let i = 1; i < rows.length; i++) {
      const mapped = mapRow(rows[i], col);
      if (!mapped[0]) continue;
      mappedRows.push(mapped);
    }

    const existing = await prisma.ticket.findMany({
      select: { INCIDENT: true },
    });

    const existingSet = new Set(existing.map((r) => r.INCIDENT));

    const finalRows: any[] = [];

    const syncDate = new Date().toISOString().split('T')[0];
    const batchId = `SYNC_${syncDate}_${Date.now()}`;

    for (const row of mappedRows) {
      const incident = row[0];
      const statusUpdate = row[29];
      const status = row[6];

      row[29] = statusUpdate ?? null;

      if (existingSet.has(incident)) result.updated++;
      else result.inserted++;

      finalRows.push([...row, syncDate, batchId]);
    }

    const batches = chunkArray(finalRows, BATCH_SIZE);

    for (const batch of batches) {
      const columnCount = batch[0].length;

      const placeholders = batch
        .map(() => `(${Array(columnCount).fill('?').join(',')})`)
        .join(',');

      const values: any[] = [];

      for (const row of batch) {
        for (const v of row) {
          values.push(v);
        }
      }

      const query = `
INSERT INTO ticket (
INCIDENT,SUMMARY,REPORTED_DATE,OWNER_GROUP,
CUSTOMER_SEGMENT,SERVICE_TYPE,WORKZONE,STATUS,
TICKET_ID_GAMAS,CONTACT_PHONE,CONTACT_NAME,
BOOKING_DATE,SOURCE_TICKET,CUSTOMER_TYPE,
SERVICE_NO,SYMPTOM,DESCRIPTION_ACTUAL_SOLUTION,
DEVICE_NAME,JENIS_TIKET,JAM_EXPIRED,REDAMAN,
MANJA_EXPIRED,ALAMAT,PENDING_REASON,
GUARANTE_STATUS,FLAGGING_MANJA,
LAPUL,GAUL,ONU_RX,STATUS_UPDATE,
STATUS_MANJA,
JAM_EXPIRED_12_JAM_GOLD,STATUS_TTR_12_GOLD,
JAM_EXPIRED_3_JAM_DIAMOND,STATUS_TTR_3_DIAMOND,
JAM_EXPIRED_24_JAM_REGULER,STATUS_TTR_24_REGULER,
JAM_EXPIRED_6_JAM_PLATINUM,STATUS_TTR_6_PLATINUM,
TTR_K1_DATIN_1_5_JAM,TTR_K1_REPAIR_K2_DATIN_3_6_JAM,
TTR_K3_DATIN_7_2_JAM,TTR_INDIBIZ_4_JAM,
TTR_INDIBIZ_24_JAM,TTR_INDIHOME_RESELLER_6_JAM,
TTR_INDIHOME_RESELLER_36_JAM,TTR_WIFI_24_JAM,
rca,sub_rca,
sync_date,import_batch
) VALUES ${placeholders}

ON DUPLICATE KEY UPDATE
SUMMARY       = VALUES(SUMMARY),
STATUS        = VALUES(STATUS),
WORKZONE      = VALUES(WORKZONE),
OWNER_GROUP   = VALUES(OWNER_GROUP),
STATUS_UPDATE = VALUES(STATUS_UPDATE),
sync_date     = VALUES(sync_date),
import_batch  = VALUES(import_batch),
synced_at     = NOW()
`;

      await prisma.$executeRawUnsafe(query, ...values);
    }

    console.log(
      `SYNC DONE | INSERT ${result.inserted} | UPDATE ${result.updated}`,
    );
  } catch (err: any) {
    result.errors.push(err.message);
    console.error(err);
  } finally {
    isSyncRunning = false;
  }

  return result;
}
