import prisma from '@/app/libs/prisma';
import { getSheetsClient, getSpreadsheetId } from './client';
import { nowWIB, nowWIBTimestamp, todayWIB } from './helpers';
import { formatInTimeZone } from 'date-fns-tz';
import { sheetsQueue, sleep } from '@/lib/worker-queue';

const MAX_ROWS = parseInt(process.env.SYNC_MAX_ROWS || '20000', 10);
const RANGE = `WO_B2B_B2C!A1:HZ${MAX_ROWS}`;
const BATCH_SIZE = 100;
const RETRY_MAX = 3;
const WIB = 'Asia/Jakarta';

interface SyncResult {
  inserted: number;
  updated: number;
  errors: string[];
}

let isSyncRunning = false;

// ── Proteksi KERAS: status ini TIDAK PERNAH direset oleh sync, ganti hari sekalipun ──
// pending → tetap muncul sesuai teknisi terakhir
// close/closed → tetap muncul all tiap teknisi
const HARD_PROTECTED_STATUSES = new Set(['pending', 'close', 'closed']);

// ── Proteksi HARI: status ini direset ke null jika sudah ganti hari ──
// assigned → hilang ganti hari
// on_progress → hilang ganti hari
const DAY_PROTECTED_STATUSES = new Set(['assigned', 'on_progress']);

function normalizeStatus(status: string | null | undefined): string {
  return status?.toLowerCase().trim() ?? '';
}

function isHardProtected(status: string | null | undefined): boolean {
  return HARD_PROTECTED_STATUSES.has(normalizeStatus(status));
}

function isDayProtected(status: string | null | undefined): boolean {
  return DAY_PROTECTED_STATUSES.has(normalizeStatus(status));
}

/**
 * Convert sync_date (MySQL DATE) to WIB date string for consistent comparison.
 * MySQL DATE stores calendar date without TZ, so convert from UTC Date to WIB string.
 */
function syncDateToWibString(syncDate: Date | null): string | null {
  if (!syncDate) return null;
  return formatInTimeZone(syncDate, WIB, 'yyyy-MM-dd');
}

/* ----------------------------- RETRY GOOGLE API ----------------------------- */

async function fetchSheet(sheets: any, spreadsheetId: string, signal?: AbortSignal) {
  if (signal?.aborted) throw new Error('Sync cancelled');

  return sheetsQueue.enqueue('sync:fetchSheet', async () => {
    if (signal?.aborted) throw new Error('Sync cancelled');

    let attempt = 0;
    while (attempt < RETRY_MAX) {
      if (signal?.aborted) throw new Error('Sync cancelled');
      try {
        return await sheets.spreadsheets.values.get({
          spreadsheetId,
          range: RANGE,
        });
      } catch (err) {
        attempt++;
        if (attempt >= RETRY_MAX) throw err;
        await sleep(attempt * 1000);
      }
    }
  });
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

function findColumnIndex(header: string[], names: string[]): number {
  for (const name of names) {
    const idx = header.indexOf(name);
    if (idx !== -1) return idx;
  }
  return -1;
}

function buildColumnMap(header: string[]) {
  return {
    INCIDENT: findColumnIndex(header, ['INCIDENT']),
    SUMMARY: findColumnIndex(header, ['SUMMARY']),
    REPORTED_DATE: findColumnIndex(header, ['REPORTED_DATE']),
    OWNER_GROUP: findColumnIndex(header, ['OWNER_GROUP']),
    CUSTOMER_SEGMENT: findColumnIndex(header, ['CUSTOMER_SEGMENT']),
    SERVICE_TYPE: findColumnIndex(header, ['SERVICE_TYPE']),
    WORKZONE: findColumnIndex(header, ['WORKZONE']),
    STATUS: findColumnIndex(header, ['STATUS']),
    TICKET_ID_GAMAS: findColumnIndex(header, ['TICKET_ID_GAMAS']),
    CONTACT_PHONE: findColumnIndex(header, ['CONTACT_PHONE']),
    CONTACT_NAME: findColumnIndex(header, ['CONTACT_NAME']),
    BOOKING_DATE: findColumnIndex(header, ['BOOKING_DATE']),
    SOURCE_TICKET: findColumnIndex(header, ['SOURCE_TICKET']),
    CUSTOMER_TYPE: findColumnIndex(header, ['CUSTOMER_TYPE']),
    SERVICE_NO: findColumnIndex(header, [
      'SERVICE_NO',
      'Service_No',
      'service_no',
      'SERVICE_ID',
    ]),
    SYMPTOM: findColumnIndex(header, ['SYMPTOM']),
    DESCRIPTION_ACTUAL_SOLUTION: findColumnIndex(header, [
      'DESCRIPTION_ACTUAL_SOLUTION',
    ]),
    DEVICE_NAME: findColumnIndex(header, ['DEVICE_NAME', 'PERANGKAT']),
    RK_INFORMATION: findColumnIndex(header, ['ODC_FIX']),
    JENIS_TIKET: findColumnIndex(header, ['JENIS_TIKET2']),
    JAM_EXPIRED: findColumnIndex(header, ['JAM_EXPIRED']),
    REDAMAN: findColumnIndex(header, ['REDAMAN']),
    MANJA_EXPIRED: findColumnIndex(header, ['MANJA_EXPIRED']),
    ALAMAT: findColumnIndex(header, ['ALAMAT']),
    PENDING_REASON: findColumnIndex(header, ['PENDING_REASON']),
    GUARANTE_STATUS: findColumnIndex(header, ['GUARANTE_STATUS']),
    FLAGGING_MANJA: findColumnIndex(header, ['FLAGGING_MANJA']),
    LAPUL: findColumnIndex(header, ['LAPUL']),
    GAUL: findColumnIndex(header, ['GAUL']),
    ONU_RX: findColumnIndex(header, ['ONU_RX']),
    STATUS_UPDATE: findColumnIndex(header, ['STATUS_UPDATE']),
    STATUS_MANJA: findColumnIndex(header, ['STATUS_MANJA']),

    // TTR fields
    JAM_EXPIRED_12_JAM_GOLD: findColumnIndex(header, [
      'Jam_Expired_12_Jam_Gold',
    ]),
    STATUS_TTR_12_GOLD: findColumnIndex(header, [
      'STATUS_TTR_12_Gold',
      'STATUS_TTR',
    ]),
    JAM_EXPIRED_3_JAM_DIAMOND: findColumnIndex(header, [
      'Jam_Expired_3_Jam_Diamond',
    ]),
    STATUS_TTR_3_DIAMOND: findColumnIndex(header, ['STATUS_TTR_3_Diamond']),
    JAM_EXPIRED_24_JAM_REGULER: findColumnIndex(header, [
      'Jam_Expired_24_Jam_Reguler',
    ]),
    STATUS_TTR_24_REGULER: findColumnIndex(header, ['STATUS_TTR_24_Reguler']),
    JAM_EXPIRED_6_JAM_PLATINUM: findColumnIndex(header, [
      'Jam_Expired_6_Jam_Platinum',
    ]),
    STATUS_TTR_6_PLATINUM: findColumnIndex(header, ['STATUS_TTR_6_Platinum']),

    TTR_K1_DATIN_1_5_JAM: findColumnIndex(header, ['TTR_K1_DATIN_1,5_JAM']),
    TTR_K1_REPAIR_K2_DATIN_3_6_JAM: findColumnIndex(header, [
      'TTR_K1_REPAIR_DAN_K2_DATIN_3.6_JAM',
      'TTR_K1_REPAIR_..._3.6_JAM',
      'TTR_K1_REPAIR_K2_DATIN_3_6_JAM',
    ]),
    TTR_K3_DATIN_7_2_JAM: findColumnIndex(header, ['TTR_K3_DATIN_7.2_JAM']),
    TTR_INDIBIZ_4_JAM: findColumnIndex(header, ['TTR_INDIBIZ_4_JAM']),
    TTR_INDIBIZ_24_JAM: findColumnIndex(header, ['TTR_INDIBIZ_24_JAM']),
    TTR_INDIHOME_RESELLER_6_JAM: findColumnIndex(header, [
      'TTR_INDIHOME_RESELLER_6_JAM',
    ]),
    TTR_INDIHOME_RESELLER_36_JAM: findColumnIndex(header, [
      'TTR_INDIHOME_RESELLER_36_JAM',
    ]),
    TTR_WIFI_24_JAM: findColumnIndex(header, ['TTR_WIFI_24_JAM']),
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
    get('RK_INFORMATION'), // [49]
  ];
}

/* ------------------------------- SYNC -------------------------------- */

export async function syncSpreadsheet(signal?: AbortSignal): Promise<SyncResult> {
  const result: SyncResult = {
    inserted: 0,
    updated: 0,
    errors: [],
  };

  if (isSyncRunning) return result;

  if (signal?.aborted) {
    console.log('[SYNC] Cancelled before start');
    return result;
  }

  isSyncRunning = true;

  try {
    console.log('SYNC START', nowWIB());

    const sheets = getSheetsClient();
    const spreadsheetId = getSpreadsheetId();

    const response = await fetchSheet(sheets, spreadsheetId, signal);
    const rows = response.data.values || [];

    if (rows.length <= 1) return result;

    const header = rows[0];
    const col = buildColumnMap(header);

    // Today's date string in WIB — used for sync_date and day-reset comparison
    const todayWibStr = todayWIB();
    // Unique batch ID for this sync run
    const batchId = `sync-${todayWibStr}-${Date.now()}`;
    // Timestamp for synced_at field
    const syncedAtWIB = nowWIBTimestamp();

    console.log('[SYNC] Column indices - CORE:', {
      INCIDENT: col.INCIDENT,
      TICKET_ID_GAMAS: col.TICKET_ID_GAMAS,
      SERVICE_NO: col.SERVICE_NO,
      ALAMAT: col.ALAMAT,
      STATUS: col.STATUS,
      STATUS_UPDATE: col.STATUS_UPDATE,
      SYMPTOM: col.SYMPTOM,
      CONTACT_NAME: col.CONTACT_NAME,
      CONTACT_PHONE: col.CONTACT_PHONE,
    });

    const mappedRows: any[] = [];

    for (let i = 1; i < rows.length; i++) {
      const mapped = mapRow(rows[i], col);
      if (!mapped[0]) continue;
      mappedRows.push(mapped);
    }

    if (mappedRows.length > 0) {
      const firstRow = mappedRows[0];
      console.log('[SYNC] Sample mapped row (first ticket):', {
        INCIDENT: firstRow[0],
        SERVICE_NO:
          col.SERVICE_NO !== -1 ? firstRow[col.SERVICE_NO] : 'NOT_FOUND',
        ALAMAT: col.ALAMAT !== -1 ? firstRow[col.ALAMAT] : 'NOT_FOUND',
        TICKET_ID_GAMAS:
          col.TICKET_ID_GAMAS !== -1
            ? firstRow[col.TICKET_ID_GAMAS]
            : 'NOT_FOUND',
        STATUS: firstRow[7],
        SYMPTOM: col.SYMPTOM !== -1 ? firstRow[col.SYMPTOM] : 'NOT_FOUND',
        CONTACT_PHONE:
          col.CONTACT_PHONE !== -1 ? firstRow[col.CONTACT_PHONE] : 'NOT_FOUND',
        CONTACT_NAME:
          col.CONTACT_NAME !== -1 ? firstRow[col.CONTACT_NAME] : 'NOT_FOUND',
        ROW_LENGTH: firstRow.length,
      });
    }

    /* ------------------- CHECK EXISTING INCIDENTS ------------------- */

    const incidentList = mappedRows.map((r) => r[0]);

    // Pre-fetch teknisi_user_id + STATUS_UPDATE + sync_date for all existing tickets
    // This resolves race conditions with concurrent auto-assign
    const techAssignments = await prisma.ticket.findMany({
      where: { INCIDENT: { in: incidentList } },
      select: {
        INCIDENT: true,
        teknisi_user_id: true,
        STATUS_UPDATE: true,
        sync_date: true,
      },
    });

    // Map: INCIDENT → { status, syncDate, teknisiUserId }
    // syncDate stored as YYYY-MM-DD string for accurate comparison
    const existingMap = new Map<
      string,
      {
        status: string | null;
        syncDate: string | null;
        teknisiUserId: number | null;
      }
    >(
      techAssignments.map((r) => [
        r.INCIDENT,
        {
          status: r.STATUS_UPDATE,
          syncDate: r.sync_date ? r.sync_date.toISOString().slice(0, 10) : null,
          teknisiUserId: r.teknisi_user_id,
        },
      ]),
    );

    // Three category buckets for batch INSERT
    const newRows: any[] = []; // brand-new tickets (not in DB)
    const safeRows: any[] = []; // tickets with open/null status → safe to update
    const protectedRows: any[] = []; // tickets with protected status → update but protect STATUS_UPDATE

    for (const row of mappedRows) {
      const incident = row[0];
      const sheetStatusUpdate = row[29]; // STATUS_UPDATE from Google Sheet
      const dbEntry = existingMap.get(incident); // { status, syncDate, teknisiUserId }

      // ── MAIN LOGIC: STATUS_UPDATE protection ──────────────────────────
      // If teknisi is already assigned, STATUS_UPDATE is NEVER overwritten.
      // This is the final safeguard against race conditions with auto-assign/manual assign.
      const hasAssignedTeknisi = dbEntry?.teknisiUserId != null;

      if (!existingMap.has(incident)) {
        // ── INSERT: ticket not yet in DB ────────────────────────────────
        // New ticket → STATUS_UPDATE stays null (auto-assign will set it)
        row[29] = null;
        result.inserted++;
        newRows.push([...row, todayWibStr, batchId]);
} else if (hasAssignedTeknisi) {
        // ── PROTECT: teknisi already assigned → keep existing STATUS_UPDATE ──
        row[29] = dbEntry!.status || null;
        result.updated++;
        protectedRows.push([...row, todayWibStr, batchId]);
      } else if (isHardProtected(dbEntry?.status)) {
        // ── HARD PROTECT: pending / close / closed → never reset ──────────
        result.updated++;
        protectedRows.push([...row, todayWibStr, batchId]);
      } else if (isDayProtected(dbEntry?.status)) {
        // ── DAY PROTECT: assigned / on_progress → reset if different day ──
        const isSameDay = dbEntry!.syncDate === todayWibStr;
if (isSameDay) {
          result.updated++;
          protectedRows.push([...row, todayWibStr, batchId]);
        } else {
          row[29] = null;
          result.updated++;
          safeRows.push([...row, todayWibStr, batchId]);
        }
      } else {
        // ── SAFE: null / open / unknown → accept from sheet if not 'open'
        const trimmedSheetStatus = sheetStatusUpdate?.trim()?.toLowerCase();
        if (
          trimmedSheetStatus &&
          trimmedSheetStatus !== 'open' &&
          trimmedSheetStatus !== 'null' &&
          trimmedSheetStatus !== ''
        ) {
          row[29] = sheetStatusUpdate?.trim() || null;
        } else {
          row[29] = dbEntry?.status || null;
        }
        result.updated++;
        safeRows.push([...row, todayWibStr, batchId]);
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
        rca,sub_rca,RK_INFORMATION,
        sync_date,import_batch
        ) VALUES ${placeholders}

        ON DUPLICATE KEY UPDATE
        SUMMARY       = VALUES(SUMMARY),
        REPORTED_DATE = VALUES(REPORTED_DATE),
        OWNER_GROUP   = VALUES(OWNER_GROUP),
        CUSTOMER_SEGMENT = VALUES(CUSTOMER_SEGMENT),
        SERVICE_TYPE = VALUES(SERVICE_TYPE),
        WORKZONE      = VALUES(WORKZONE),
        STATUS       = VALUES(STATUS),
        TICKET_ID_GAMAS = VALUES(TICKET_ID_GAMAS),
        CONTACT_PHONE = VALUES(CONTACT_PHONE),
        CONTACT_NAME  = VALUES(CONTACT_NAME),
        BOOKING_DATE = VALUES(BOOKING_DATE),
        SOURCE_TICKET = VALUES(SOURCE_TICKET),
        CUSTOMER_TYPE = VALUES(CUSTOMER_TYPE),
        SERVICE_NO   = VALUES(SERVICE_NO),
        SYMPTOM       = VALUES(SYMPTOM),
        DESCRIPTION_ACTUAL_SOLUTION = VALUES(DESCRIPTION_ACTUAL_SOLUTION),
        DEVICE_NAME  = VALUES(DEVICE_NAME),
        JENIS_TIKET  = VALUES(JENIS_TIKET),
        JAM_EXPIRED  = VALUES(JAM_EXPIRED),
        REDAMAN      = VALUES(REDAMAN),
        MANJA_EXPIRED = VALUES(MANJA_EXPIRED),
        ALAMAT       = VALUES(ALAMAT),
        PENDING_REASON = VALUES(PENDING_REASON),
        GUARANTE_STATUS = VALUES(GUARANTE_STATUS),
        FLAGGING_MANJA = VALUES(FLAGGING_MANJA),
        LAPUL        = VALUES(LAPUL),
        GAUL         = VALUES(GAUL),
        ONU_RX       = VALUES(ONU_RX),
        -- ✅ STATUS_UPDATE DILINDUNGI: tidak pernah di-overwrite dari sheet
        -- Ini safeguard utama untuk mencegah race condition dengan auto-assign / manual assign
        -- App workflow yang bertanggung jawab penuh atas STATUS_UPDATE
        -- STATUS_UPDATE = VALUES(STATUS_UPDATE),
        STATUS_MANJA = VALUES(STATUS_MANJA),
        JAM_EXPIRED_12_JAM_GOLD = VALUES(JAM_EXPIRED_12_JAM_GOLD),
        STATUS_TTR_12_GOLD = VALUES(STATUS_TTR_12_GOLD),
        JAM_EXPIRED_3_JAM_DIAMOND = VALUES(JAM_EXPIRED_3_JAM_DIAMOND),
        STATUS_TTR_3_DIAMOND = VALUES(STATUS_TTR_3_DIAMOND),
        JAM_EXPIRED_24_JAM_REGULER = VALUES(JAM_EXPIRED_24_JAM_REGULER),
        STATUS_TTR_24_REGULER = VALUES(STATUS_TTR_24_REGULER),
        JAM_EXPIRED_6_JAM_PLATINUM = VALUES(JAM_EXPIRED_6_JAM_PLATINUM),
        STATUS_TTR_6_PLATINUM = VALUES(STATUS_TTR_6_PLATINUM),
        TTR_K1_DATIN_1_5_JAM = VALUES(TTR_K1_DATIN_1_5_JAM),
        TTR_K1_REPAIR_K2_DATIN_3_6_JAM = VALUES(TTR_K1_REPAIR_K2_DATIN_3_6_JAM),
        TTR_K3_DATIN_7_2_JAM = VALUES(TTR_K3_DATIN_7_2_JAM),
        TTR_INDIBIZ_4_JAM = VALUES(TTR_INDIBIZ_4_JAM),
        TTR_INDIBIZ_24_JAM = VALUES(TTR_INDIBIZ_24_JAM),
        TTR_INDIHOME_RESELLER_6_JAM = VALUES(TTR_INDIHOME_RESELLER_6_JAM),
        TTR_INDIHOME_RESELLER_36_JAM = VALUES(TTR_INDIHOME_RESELLER_36_JAM),
        TTR_WIFI_24_JAM = VALUES(TTR_WIFI_24_JAM),
        RK_INFORMATION = VALUES(RK_INFORMATION),
        -- rca = VALUES(rca),
        -- sub_rca = VALUES(sub_rca),
        sync_date     = VALUES(sync_date),
        import_batch  = VALUES(import_batch),
        synced_at     = ?
        `;

        await prisma.$executeRawUnsafe(query, ...values, syncedAtWIB);
      }
    }

    /* -------------------- UPDATE SAFE (status masih open/null) -------------------- */

    // UPDATE normal: STATUS_UPDATE TIDAK di-update dari sheet
    // Ini mencegah sheet menimpa status yang sudah diset oleh app workflow
    if (safeRows.length > 0) {
      const batches = chunkArray(safeRows, BATCH_SIZE);

      for (const batch of batches) {
        if (signal?.aborted) {
          console.log('[SYNC] Cancelled during safe update');
          break;
        }
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
        rca,sub_rca,RK_INFORMATION,
        sync_date,import_batch
        ) VALUES ${placeholders}

        ON DUPLICATE KEY UPDATE
        SUMMARY       = VALUES(SUMMARY),
        REPORTED_DATE = VALUES(REPORTED_DATE),
        OWNER_GROUP   = VALUES(OWNER_GROUP),
        CUSTOMER_SEGMENT = VALUES(CUSTOMER_SEGMENT),
        SERVICE_TYPE = VALUES(SERVICE_TYPE),
        WORKZONE      = VALUES(WORKZONE),
        STATUS       = VALUES(STATUS),
        TICKET_ID_GAMAS = VALUES(TICKET_ID_GAMAS),
        CONTACT_PHONE = VALUES(CONTACT_PHONE),
        CONTACT_NAME  = VALUES(CONTACT_NAME),
        BOOKING_DATE = VALUES(BOOKING_DATE),
        SOURCE_TICKET = VALUES(SOURCE_TICKET),
        CUSTOMER_TYPE = VALUES(CUSTOMER_TYPE),
        SERVICE_NO   = VALUES(SERVICE_NO),
        SYMPTOM       = VALUES(SYMPTOM),
        DESCRIPTION_ACTUAL_SOLUTION = VALUES(DESCRIPTION_ACTUAL_SOLUTION),
        DEVICE_NAME  = VALUES(DEVICE_NAME),
        JENIS_TIKET  = VALUES(JENIS_TIKET),
        JAM_EXPIRED  = VALUES(JAM_EXPIRED),
        REDAMAN      = VALUES(REDAMAN),
        MANJA_EXPIRED = VALUES(MANJA_EXPIRED),
        ALAMAT       = VALUES(ALAMAT),
        PENDING_REASON = VALUES(PENDING_REASON),
        GUARANTE_STATUS = VALUES(GUARANTE_STATUS),
        FLAGGING_MANJA = VALUES(FLAGGING_MANJA),
        LAPUL        = VALUES(LAPUL),
        GAUL         = VALUES(GAUL),
        ONU_RX       = VALUES(ONU_RX),
        -- ✅ STATUS_UPDATE TIDAK di-update: biarkan apa adanya (app workflow yang pegang)
        -- STATUS_UPDATE = VALUES(STATUS_UPDATE),
        STATUS_MANJA = VALUES(STATUS_MANJA),
        JAM_EXPIRED_12_JAM_GOLD = VALUES(JAM_EXPIRED_12_JAM_GOLD),
        STATUS_TTR_12_GOLD = VALUES(STATUS_TTR_12_GOLD),
        JAM_EXPIRED_3_JAM_DIAMOND = VALUES(JAM_EXPIRED_3_JAM_DIAMOND),
        STATUS_TTR_3_DIAMOND = VALUES(STATUS_TTR_3_DIAMOND),
        JAM_EXPIRED_24_JAM_REGULER = VALUES(JAM_EXPIRED_24_JAM_REGULER),
        STATUS_TTR_24_REGULER = VALUES(STATUS_TTR_24_REGULER),
        JAM_EXPIRED_6_JAM_PLATINUM = VALUES(JAM_EXPIRED_6_JAM_PLATINUM),
        STATUS_TTR_6_PLATINUM = VALUES(STATUS_TTR_6_PLATINUM),
        TTR_K1_DATIN_1_5_JAM = VALUES(TTR_K1_DATIN_1_5_JAM),
        TTR_K1_REPAIR_K2_DATIN_3_6_JAM = VALUES(TTR_K1_REPAIR_K2_DATIN_3_6_JAM),
        TTR_K3_DATIN_7_2_JAM = VALUES(TTR_K3_DATIN_7_2_JAM),
        TTR_INDIBIZ_4_JAM = VALUES(TTR_INDIBIZ_4_JAM),
        TTR_INDIBIZ_24_JAM = VALUES(TTR_INDIBIZ_24_JAM),
        TTR_INDIHOME_RESELLER_6_JAM = VALUES(TTR_INDIHOME_RESELLER_6_JAM),
        TTR_INDIHOME_RESELLER_36_JAM = VALUES(TTR_INDIHOME_RESELLER_36_JAM),
        TTR_WIFI_24_JAM = VALUES(TTR_WIFI_24_JAM),
        RK_INFORMATION = VALUES(RK_INFORMATION),
        -- rca = VALUES(rca),
        -- sub_rca = VALUES(sub_rca),
        sync_date     = VALUES(sync_date),
        import_batch  = VALUES(import_batch),
        synced_at     = ?
        `;

        await prisma.$executeRawUnsafe(query, ...values, syncedAtWIB);
      }
    }

    /* -------------------- UPDATE PROTECTED (status sudah di-workflow) -------------------- */

    // UPDATE terlindungi: STATUS_UPDATE TIDAK di-update, hanya metadata teknis
    if (protectedRows.length > 0) {
      const batches = chunkArray(protectedRows, BATCH_SIZE);

      for (const batch of batches) {
        if (signal?.aborted) {
          console.log('[SYNC] Cancelled during protected update');
          break;
        }
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
        rca,sub_rca,RK_INFORMATION,
        sync_date,import_batch
        ) VALUES ${placeholders}

        ON DUPLICATE KEY UPDATE
        SUMMARY       = VALUES(SUMMARY),
        REPORTED_DATE = VALUES(REPORTED_DATE),
        OWNER_GROUP   = VALUES(OWNER_GROUP),
        CUSTOMER_SEGMENT = VALUES(CUSTOMER_SEGMENT),
        SERVICE_TYPE = VALUES(SERVICE_TYPE),
        WORKZONE      = VALUES(WORKZONE),
        STATUS       = VALUES(STATUS),
        TICKET_ID_GAMAS = VALUES(TICKET_ID_GAMAS),
        CONTACT_PHONE = VALUES(CONTACT_PHONE),
        CONTACT_NAME  = VALUES(CONTACT_NAME),
        BOOKING_DATE = VALUES(BOOKING_DATE),
        SOURCE_TICKET = VALUES(SOURCE_TICKET),
        CUSTOMER_TYPE = VALUES(CUSTOMER_TYPE),
        SERVICE_NO   = VALUES(SERVICE_NO),
        SYMPTOM       = VALUES(SYMPTOM),
        DESCRIPTION_ACTUAL_SOLUTION = VALUES(DESCRIPTION_ACTUAL_SOLUTION),
        DEVICE_NAME  = VALUES(DEVICE_NAME),
        JENIS_TIKET  = VALUES(JENIS_TIKET),
        JAM_EXPIRED  = VALUES(JAM_EXPIRED),
        REDAMAN      = VALUES(REDAMAN),
        MANJA_EXPIRED = VALUES(MANJA_EXPIRED),
        ALAMAT       = VALUES(ALAMAT),
        -- ✅ PENDING_REASON tidak disentuh: teknisi mungkin sudah mengisi ini
        -- PENDING_REASON = VALUES(PENDING_REASON),
        GUARANTE_STATUS = VALUES(GUARANTE_STATUS),
        FLAGGING_MANJA = VALUES(FLAGGING_MANJA),
        LAPUL        = VALUES(LAPUL),
        GAUL         = VALUES(GAUL),
        ONU_RX       = VALUES(ONU_RX),
        -- ✅ STATUS_UPDATE tidak disentuh: workflow app yang pegang kendali
        -- STATUS_UPDATE = VALUES(STATUS_UPDATE),
        -- ✅ RCA dan Sub_RCA tidak disentuh: teknisi yang pegang kendali
        -- rca = VALUES(rca),
        -- sub_rca = VALUES(sub_rca),
        STATUS_MANJA = VALUES(STATUS_MANJA),
        JAM_EXPIRED_12_JAM_GOLD = VALUES(JAM_EXPIRED_12_JAM_GOLD),
        STATUS_TTR_12_GOLD = VALUES(STATUS_TTR_12_GOLD),
        JAM_EXPIRED_3_JAM_DIAMOND = VALUES(JAM_EXPIRED_3_JAM_DIAMOND),
        STATUS_TTR_3_DIAMOND = VALUES(STATUS_TTR_3_DIAMOND),
        JAM_EXPIRED_24_JAM_REGULER = VALUES(JAM_EXPIRED_24_JAM_REGULER),
        STATUS_TTR_24_REGULER = VALUES(STATUS_TTR_24_REGULER),
        JAM_EXPIRED_6_JAM_PLATINUM = VALUES(JAM_EXPIRED_6_JAM_PLATINUM),
        STATUS_TTR_6_PLATINUM = VALUES(STATUS_TTR_6_PLATINUM),
        TTR_K1_DATIN_1_5_JAM = VALUES(TTR_K1_DATIN_1_5_JAM),
        TTR_K1_REPAIR_K2_DATIN_3_6_JAM = VALUES(TTR_K1_REPAIR_K2_DATIN_3_6_JAM),
        TTR_K3_DATIN_7_2_JAM = VALUES(TTR_K3_DATIN_7_2_JAM),
        TTR_INDIBIZ_4_JAM = VALUES(TTR_INDIBIZ_4_JAM),
        TTR_INDIBIZ_24_JAM = VALUES(TTR_INDIBIZ_24_JAM),
        TTR_INDIHOME_RESELLER_6_JAM = VALUES(TTR_INDIHOME_RESELLER_6_JAM),
        TTR_INDIHOME_RESELLER_36_JAM = VALUES(TTR_INDIHOME_RESELLER_36_JAM),
        TTR_WIFI_24_JAM = VALUES(TTR_WIFI_24_JAM),
        RK_INFORMATION = VALUES(RK_INFORMATION),
        -- rca = VALUES(rca),
        -- sub_rca = VALUES(sub_rca),
        sync_date     = VALUES(sync_date),
        import_batch  = VALUES(import_batch),
        synced_at     = ?
        `;

        await prisma.$executeRawUnsafe(query, ...values, syncedAtWIB);
      }
    }

    console.log(
      `SYNC DONE | INSERT ${result.inserted} | UPDATE ${result.updated}` +
        ` (safe: ${safeRows.length}, protected: ${protectedRows.length})`,
    );
  } catch (err: any) {
    if (err.message === 'Sync cancelled') {
      console.log('[SYNC] Gracefully cancelled');
    } else {
      result.errors.push(err.message);
      console.error(err);
    }
  } finally {
    isSyncRunning = false;
  }

  return result;
}
