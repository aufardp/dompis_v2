import prisma from '@/app/libs/prisma';
import { getSheetsClient, getSpreadsheetId } from './client';
import { nowWIB } from './helpers';

const RANGE = 'WO_B2B_B2C!A1:HZ10000';
const BATCH_SIZE = 25;
const RETRY_MAX = 3;

interface SyncResult {
  inserted: number;
  updated: number;
  errors: string[];
}

let isSyncRunning = false;

const WORKFLOW_PROTECTED_STATUSES = new Set([
  'assigned',
  'on_progress',
  'pending',
  'close',
  'closed', // legacy value, tetap dilindungi
]);

function isWorkflowProtected(status: string | null | undefined): boolean {
  if (!status) return false;
  return WORKFLOW_PROTECTED_STATUSES.has(status.toLowerCase().trim());
}

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
    get('INCIDENT'), // [0]
    get('SUMMARY'), // [1]
    get('REPORTED_DATE'), // [2]
    get('OWNER_GROUP'), // [3]
    get('CUSTOMER_SEGMENT'), // [4]
    get('SERVICE_TYPE'), // [5]
    get('WORKZONE'), // [6]
    get('STATUS'), // [7]
    get('TICKET_ID_GAMAS'), // [8]
    get('CONTACT_PHONE'), // [9]
    get('CONTACT_NAME'), // [10]
    get('BOOKING_DATE'), // [11]
    get('SOURCE_TICKET'), // [12]
    get('CUSTOMER_TYPE'), // [13]
    get('SERVICE_NO'), // [14]
    get('SYMPTOM'), // [15]
    get('DESCRIPTION_ACTUAL_SOLUTION'), // [16]
    get('DEVICE_NAME'), // [17]
    get('JENIS_TIKET'), // [18]
    get('JAM_EXPIRED'), // [19]
    get('REDAMAN'), // [20]
    get('MANJA_EXPIRED'), // [21]
    get('ALAMAT'), // [22]
    get('PENDING_REASON'), // [23]
    get('GUARANTE_STATUS'), // [24]
    get('FLAGGING_MANJA'), // [25]
    get('LAPUL'), // [26]
    get('GAUL'), // [27]
    get('ONU_RX'), // [28]
    get('STATUS_UPDATE'), // [29] ← nilai dari sheet, bisa null/empty/'open'
    get('STATUS_MANJA'), // [30]
    get('JAM_EXPIRED_12_JAM_GOLD'), // [31]
    get('STATUS_TTR_12_GOLD'), // [32]
    get('JAM_EXPIRED_3_JAM_DIAMOND'), // [33]
    get('STATUS_TTR_3_DIAMOND'), // [34]
    get('JAM_EXPIRED_24_JAM_REGULER'), // [35]
    get('STATUS_TTR_24_REGULER'), // [36]
    get('JAM_EXPIRED_6_JAM_PLATINUM'), // [37]
    get('STATUS_TTR_6_PLATINUM'), // [38]
    get('TTR_K1_DATIN_1_5_JAM'), // [39]
    get('TTR_K1_REPAIR_K2_DATIN_3_6_JAM'), // [40]
    get('TTR_K3_DATIN_7_2_JAM'), // [41]
    get('TTR_INDIBIZ_4_JAM'), // [42]
    get('TTR_INDIBIZ_24_JAM'), // [43]
    get('TTR_INDIHOME_RESELLER_6_JAM'), // [44]
    get('TTR_INDIHOME_RESELLER_36_JAM'), // [45]
    get('TTR_WIFI_24_JAM'), // [46]
    get('rca'), // [47]
    get('sub_rca'), // [48]
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

    /* ------------------- CHECK EXISTING INCIDENTS ------------------- */

    const incidentList = mappedRows.map((r) => r[0]);

    const existing = await prisma.ticket.findMany({
      select: {
        INCIDENT: true,
        STATUS_UPDATE: true, // ← fetch current DB status untuk proteksi
      },
      where: {
        INCIDENT: { in: incidentList },
      },
    });

    // Map: INCIDENT → STATUS_UPDATE saat ini di DB
    const existingMap = new Map(
      existing.map((r) => [r.INCIDENT, r.STATUS_UPDATE]),
    );

    /* -------------------------- PREPARE FINAL DATA -------------------------- */

    const newRows: any[] = []; // INSERT baru
    const safeRows: any[] = []; // UPDATE aman (status belum di-workflow)
    const protectedRows: any[] = []; // UPDATE dengan STATUS_UPDATE dikunci

    const syncDate = new Date().toISOString().split('T')[0];
    const batchId = `SYNC_${syncDate}_${Date.now()}`;

    for (const row of mappedRows) {
      const incident = row[0];
      const sheetStatusUpdate = row[29]; // nilai STATUS_UPDATE dari Google Sheet
      const dbStatusUpdate = existingMap.get(incident); // nilai saat ini di DB

      if (!existingMap.has(incident)) {
        // ── INSERT baru: ticket belum ada di DB ────────────────────────────
        // Gunakan nilai dari sheet apa adanya (normalkan ke null jika kosong)
        row[29] = sheetStatusUpdate?.trim() || null;
        result.inserted++;
        newRows.push([...row, syncDate, batchId]);
      } else if (isWorkflowProtected(dbStatusUpdate)) {
        result.updated++;
        protectedRows.push([...row, syncDate, batchId]);
      } else {
        row[29] = sheetStatusUpdate?.trim() || null;
        result.updated++;
        safeRows.push([...row, syncDate, batchId]);
      }
    }

    /* ------------------------------ INSERT BATCH ----------------------------- */

    // INSERT baru: semua kolom termasuk STATUS_UPDATE dari sheet
    if (newRows.length > 0) {
      const batches = chunkArray(newRows, BATCH_SIZE);

      for (const batch of batches) {
        const columnCount = batch[0].length;
        const placeholders = batch
          .map(() => `(${Array(columnCount).fill('?').join(',')})`)
          .join(',');

        const values: any[] = batch.flat();

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
        `;

        await prisma.$executeRawUnsafe(query, ...values);
        await new Promise((r) => setTimeout(r, 50));
      }
    }

    /* -------------------- UPDATE SAFE (status masih open/null) -------------------- */

    // UPDATE normal: STATUS_UPDATE boleh di-overwrite dari sheet
    if (safeRows.length > 0) {
      const batches = chunkArray(safeRows, BATCH_SIZE);

      for (const batch of batches) {
        const columnCount = batch[0].length;
        const placeholders = batch
          .map(() => `(${Array(columnCount).fill('?').join(',')})`)
          .join(',');

        const values: any[] = batch.flat();

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
        await new Promise((r) => setTimeout(r, 50));
      }
    }

    /* -------------------- UPDATE PROTECTED (status sudah di-workflow) -------------------- */

    // UPDATE terlindungi: STATUS_UPDATE TIDAK di-update, hanya metadata teknis
    if (protectedRows.length > 0) {
      const batches = chunkArray(protectedRows, BATCH_SIZE);

      for (const batch of batches) {
        const columnCount = batch[0].length;
        const placeholders = batch
          .map(() => `(${Array(columnCount).fill('?').join(',')})`)
          .join(',');

        const values: any[] = batch.flat();

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
        -- ✅ STATUS_UPDATE tidak disentuh: workflow app yang pegang kendali
        -- STATUS_UPDATE = VALUES(STATUS_UPDATE),
        sync_date     = VALUES(sync_date),
        import_batch  = VALUES(import_batch),
        synced_at     = NOW()
        `;

        await prisma.$executeRawUnsafe(query, ...values);
        await new Promise((r) => setTimeout(r, 50));
      }
    }

    console.log(
      `SYNC DONE | INSERT ${result.inserted} | UPDATE ${result.updated}` +
        ` (safe: ${safeRows.length}, protected: ${protectedRows.length})`,
    );
  } catch (err: any) {
    result.errors.push(err.message);
    console.error(err);
  } finally {
    isSyncRunning = false;
  }

  return result;
}
