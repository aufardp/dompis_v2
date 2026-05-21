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
    incident: findColumnIndex(header, ['incident']),
    summary: findColumnIndex(header, ['SUMMARY']),
    reported_date: findColumnIndex(header, ['REPORTED_DATE']),
    owner_group: findColumnIndex(header, ['OWNER_GROUP']),
    customer_segment: findColumnIndex(header, ['CUSTOMER_SEGMENT']),
    service_type: findColumnIndex(header, ['SERVICE_TYPE']),
    workzone: findColumnIndex(header, ['WORKZONE']),
    status: findColumnIndex(header, ['STATUS']),
    ticket_id_gamas: findColumnIndex(header, ['TICKET_ID_GAMAS']),
    contact_phone: findColumnIndex(header, ['CONTACT_PHONE']),
    contact_name: findColumnIndex(header, ['CONTACT_NAME']),
    booking_date: findColumnIndex(header, ['BOOKING_DATE']),
    source_ticket: findColumnIndex(header, ['SOURCE_TICKET']),
    customer_type: findColumnIndex(header, ['CUSTOMER_TYPE']),
    service_no: findColumnIndex(header, [
      'SERVICE_NO',
      'Service_No',
      'service_no',
      'SERVICE_ID',
    ]),
    symptom: findColumnIndex(header, ['SYMPTOM']),
    description_solution_dompis: findColumnIndex(header, [
      'DESCRIPTION_ACTUAL_SOLUTION',
    ]),
    device_name: findColumnIndex(header, ['DEVICE_NAME', 'PERANGKAT']),
    rk_information: findColumnIndex(header, ['ODC_FIX']),
    jenis_tiket: findColumnIndex(header, ['JENIS_TIKET2']),
    jam_expired: findColumnIndex(header, ['JAM_EXPIRED']),
    redaman: findColumnIndex(header, ['REDAMAN']),
    manja_expired: findColumnIndex(header, ['MANJA_EXPIRED']),
    alamat: findColumnIndex(header, ['ALAMAT']),
    pending_dompis: findColumnIndex(header, ['PENDING_DOMPIS', 'PENDING_REASON']),
    guarantee_status: findColumnIndex(header, ['GUARANTE_STATUS']),
    flagging_manja: findColumnIndex(header, ['FLAGGING_MANJA']),
    lapul: findColumnIndex(header, ['LAPUL']),
    gaul: findColumnIndex(header, ['GAUL']),
    onu_rx: findColumnIndex(header, ['ONU_RX']),
    status_update: findColumnIndex(header, ['STATUS_UPDATE']),
    status_manja: findColumnIndex(header, ['STATUS_MANJA']),

    // TTR fields
    jam_expired_12_jam_gold: findColumnIndex(header, [
      'Jam_Expired_12_Jam_Gold',
    ]),
    status_ttr_12_gold: findColumnIndex(header, [
      'STATUS_TTR_12_Gold',
      'STATUS_TTR',
    ]),
    jam_expired_3_jam_diamond: findColumnIndex(header, [
      'Jam_Expired_3_Jam_Diamond',
    ]),
    status_ttr_3_diamond: findColumnIndex(header, ['STATUS_TTR_3_Diamond']),
    jam_expired_24_jam_reguler: findColumnIndex(header, [
      'Jam_Expired_24_Jam_Reguler',
    ]),
    status_ttr_24_reguler: findColumnIndex(header, ['STATUS_TTR_24_Reguler']),
    jam_expired_6_jam_platinum: findColumnIndex(header, [
      'Jam_Expired_6_Jam_Platinum',
    ]),
    status_ttr_6_platinum: findColumnIndex(header, ['STATUS_TTR_6_Platinum']),

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
    get('incident'), // [0]
    get('summary'), // [1]
    get('reported_date'), // [2]
    get('owner_group'), // [3]
    get('customer_segment'), // [4]
    get('service_type'), // [5]
    get('workzone'), // [6]
    get('status'), // [7]
    get('ticket_id_gamas'), // [8]
    get('contact_phone'), // [9]
    get('contact_name'), // [10]
    get('booking_date'), // [11]
    get('source_ticket'), // [12]
    get('customer_type'), // [13]
    get('service_no'), // [14]
    get('symptom'), // [15]
    get('description_solution_dompis'), // [16]
    get('device_name'), // [17]
    get('jenis_tiket'), // [18]
    get('jam_expired'), // [19]
    get('redaman'), // [20]
    get('manja_expired'), // [21]
    get('alamat'), // [22]
    get('pending_dompis'), // [23]
    get('guarantee_status'), // [24]
    get('flagging_manja'), // [25]
    get('lapul'), // [26]
    get('gaul'), // [27]
    get('onu_rx'), // [28]
    get('status_update'), // [29] ← nilai dari sheet, bisa null/empty/'open'
    get('status_manja'), // [30]
    get('jam_expired_12_jam_gold'), // [31]
    get('status_ttr_12_gold'), // [32]
    get('jam_expired_3_jam_diamond'), // [33]
    get('status_ttr_3_diamond'), // [34]
    get('jam_expired_24_jam_reguler'), // [35]
    get('status_ttr_24_reguler'), // [36]
    get('jam_expired_6_jam_platinum'), // [37]
    get('status_ttr_6_platinum'), // [38]
    get('ttr_k1_datin_1_5_jam'), // [39]
    get('ttr_k1_repair_k2_datin_3_6_jam'), // [40]
    get('ttr_k3_datin_7_2_jam'), // [41]
    get('ttr_indibiz_4_jam'), // [42]
    get('ttr_indibiz_24_jam'), // [43]
    get('ttr_indihome_reseller_6_jam'), // [44]
    get('ttr_indihome_reseller_36_jam'), // [45]
    get('ttr_wifi_24_jam'), // [46]
    get('rca'), // [47]
    get('sub_rca'), // [48]
    get('rk_information'), // [49]
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
      incident: col.incident,
      ticket_id_gamas: col.ticket_id_gamas,
      service_no: col.service_no,
      alamat: col.alamat,
      status: col.status,
      status_update: col.status_update,
      symptom: col.symptom,
      contact_name: col.contact_name,
      contact_phone: col.contact_phone,
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
        incident: firstRow[0],
        service_no:
          col.service_no !== -1 ? firstRow[col.service_no] : 'NOT_FOUND',
        alamat: col.alamat !== -1 ? firstRow[col.alamat] : 'NOT_FOUND',
        ticket_id_gamas:
          col.ticket_id_gamas !== -1
            ? firstRow[col.ticket_id_gamas]
            : 'NOT_FOUND',
        status: firstRow[7],
        symptom: col.symptom !== -1 ? firstRow[col.symptom] : 'NOT_FOUND',
        contact_phone:
          col.contact_phone !== -1 ? firstRow[col.contact_phone] : 'NOT_FOUND',
        contact_name:
          col.contact_name !== -1 ? firstRow[col.contact_name] : 'NOT_FOUND',
        ROW_LENGTH: firstRow.length,
      });
    }

    /* ------------------- CHECK EXISTING incidentS ------------------- */

    const incidentList = mappedRows.map((r) => r[0]);

    // Pre-fetch teknisi_user_id + status_update + sync_date for all existing tickets
    // This resolves race conditions with concurrent auto-assign
    const techAssignments = await prisma.ticket.findMany({
      where: { incident: { in: incidentList } },
      select: {
        incident: true,
        teknisi_user_id: true,
        status_update: true,
        sync_date: true,
      },
    });

    // Map: incident → { status, syncDate, teknisiUserId }
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
        r.incident,
        {
          status: r.status_update,
          syncDate: r.sync_date ? r.sync_date.toISOString().slice(0, 10) : null,
          teknisiUserId: r.teknisi_user_id,
        },
      ]),
    );

    // Three category buckets for batch INSERT
    const newRows: any[] = []; // brand-new tickets (not in DB)
    const safeRows: any[] = []; // tickets with open/null status → safe to update
    const protectedRows: any[] = []; // tickets with protected status → update but protect status_update

    for (const row of mappedRows) {
      const incident = row[0];
      const sheetStatusUpdate = row[29]; // status_update from Google Sheet
      const dbEntry = existingMap.get(incident); // { status, syncDate, teknisiUserId }

      // ── MAIN LOGIC: status_update protection ──────────────────────────
      // If teknisi is already assigned, status_update is NEVER overwritten.
      // This is the final safeguard against race conditions with auto-assign/manual assign.
      const hasAssignedTeknisi = dbEntry?.teknisiUserId != null;

      if (!existingMap.has(incident)) {
        // ── INSERT: ticket not yet in DB ────────────────────────────────
        // New ticket → status_update stays null (auto-assign will set it)
        row[29] = null;
        result.inserted++;
        newRows.push([...row, todayWibStr, batchId]);
} else if (hasAssignedTeknisi) {
        // ── PROTECT: teknisi already assigned → keep existing status_update ──
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

    // INSERT baru: semua kolom termasuk status_update dari sheet
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
        incident,summary,reported_date,owner_group,
        customer_segment,service_type,workzone,status,
        ticket_id_gamas,contact_phone,contact_name,
        booking_date,source_ticket,customer_type,
        service_no,symptom,description_solution_dompis,
        device_name,jenis_tiket,jam_expired,redaman,
        manja_expired,alamat,pending_dompis,
        guarantee_status,flagging_manja,
        lapul,gaul,onu_rx,status_update,
        status_manja,
        jam_expired_12_jam_gold,status_ttr_12_gold,
        jam_expired_3_jam_diamond,status_ttr_3_diamond,
        jam_expired_24_jam_reguler,status_ttr_24_reguler,
        jam_expired_6_jam_platinum,status_ttr_6_platinum,
        ttr_k1_datin_1_5_jam,ttr_k1_repair_k2_datin_3_6_jam,
        ttr_k3_datin_7_2_jam,ttr_indibiz_4_jam,
        ttr_indibiz_24_jam,ttr_indihome_reseller_6_jam,
        ttr_indihome_reseller_36_jam,ttr_wifi_24_jam,
        rca,sub_rca,rk_information,
        sync_date,import_batch
        ) VALUES ${placeholders}

        ON DUPLICATE KEY UPDATE
        summary       = VALUES(summary),
        reported_date = VALUES(reported_date),
        owner_group   = VALUES(owner_group),
        customer_segment = VALUES(customer_segment),
        service_type = VALUES(service_type),
        workzone      = VALUES(workzone),
        status       = VALUES(status),
        ticket_id_gamas = VALUES(ticket_id_gamas),
        contact_phone = VALUES(contact_phone),
        contact_name  = VALUES(contact_name),
        booking_date = VALUES(booking_date),
        source_ticket = VALUES(source_ticket),
        customer_type = VALUES(customer_type),
        service_no   = VALUES(service_no),
        symptom       = VALUES(symptom),
        description_solution_dompis = VALUES(description_solution_dompis),
        device_name  = VALUES(device_name),
        jenis_tiket  = VALUES(jenis_tiket),
        jam_expired  = VALUES(jam_expired),
        redaman      = VALUES(redaman),
        manja_expired = VALUES(manja_expired),
        alamat       = VALUES(alamat),
        pending_dompis = VALUES(pending_dompis),
        guarantee_status = VALUES(guarantee_status),
        flagging_manja = VALUES(flagging_manja),
        lapul        = VALUES(lapul),
        gaul         = VALUES(gaul),
        onu_rx       = VALUES(onu_rx),
        -- ✅ status_update DILINDUNGI: tidak pernah di-overwrite dari sheet
        -- Ini safeguard utama untuk mencegah race condition dengan auto-assign / manual assign
        -- App workflow yang bertanggung jawab penuh atas status_update
        -- status_update = VALUES(status_update),
        status_manja = VALUES(status_manja),
        jam_expired_12_jam_gold = VALUES(jam_expired_12_jam_gold),
        status_ttr_12_gold = VALUES(status_ttr_12_gold),
        jam_expired_3_jam_diamond = VALUES(jam_expired_3_jam_diamond),
        status_ttr_3_diamond = VALUES(status_ttr_3_diamond),
        jam_expired_24_jam_reguler = VALUES(jam_expired_24_jam_reguler),
        status_ttr_24_reguler = VALUES(status_ttr_24_reguler),
        jam_expired_6_jam_platinum = VALUES(jam_expired_6_jam_platinum),
        status_ttr_6_platinum = VALUES(status_ttr_6_platinum),
        ttr_k1_datin_1_5_jam = VALUES(ttr_k1_datin_1_5_jam),
        ttr_k1_repair_k2_datin_3_6_jam = VALUES(ttr_k1_repair_k2_datin_3_6_jam),
        ttr_k3_datin_7_2_jam = VALUES(ttr_k3_datin_7_2_jam),
        ttr_indibiz_4_jam = VALUES(ttr_indibiz_4_jam),
        ttr_indibiz_24_jam = VALUES(ttr_indibiz_24_jam),
        ttr_indihome_reseller_6_jam = VALUES(ttr_indihome_reseller_6_jam),
        ttr_indihome_reseller_36_jam = VALUES(ttr_indihome_reseller_36_jam),
        ttr_wifi_24_jam = VALUES(ttr_wifi_24_jam),
        rk_information = VALUES(rk_information),
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

    // UPDATE normal: status_update TIDAK di-update dari sheet
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
        incident,summary,reported_date,owner_group,
        customer_segment,service_type,workzone,status,
        ticket_id_gamas,contact_phone,contact_name,
        booking_date,source_ticket,customer_type,
        service_no,symptom,description_solution_dompis,
        device_name,jenis_tiket,jam_expired,redaman,
        manja_expired,alamat,pending_dompis,
        guarantee_status,flagging_manja,
        lapul,gaul,onu_rx,status_update,
        status_manja,
        jam_expired_12_jam_gold,status_ttr_12_gold,
        jam_expired_3_jam_diamond,status_ttr_3_diamond,
        jam_expired_24_jam_reguler,status_ttr_24_reguler,
        jam_expired_6_jam_platinum,status_ttr_6_platinum,
        ttr_k1_datin_1_5_jam,ttr_k1_repair_k2_datin_3_6_jam,
        ttr_k3_datin_7_2_jam,ttr_indibiz_4_jam,
        ttr_indibiz_24_jam,ttr_indihome_reseller_6_jam,
        ttr_indihome_reseller_36_jam,ttr_wifi_24_jam,
        rca,sub_rca,rk_information,
        sync_date,import_batch
        ) VALUES ${placeholders}

        ON DUPLICATE KEY UPDATE
        summary       = VALUES(summary),
        reported_date = VALUES(reported_date),
        owner_group   = VALUES(owner_group),
        customer_segment = VALUES(customer_segment),
        service_type = VALUES(service_type),
        workzone      = VALUES(workzone),
        status       = VALUES(status),
        ticket_id_gamas = VALUES(ticket_id_gamas),
        contact_phone = VALUES(contact_phone),
        contact_name  = VALUES(contact_name),
        booking_date = VALUES(booking_date),
        source_ticket = VALUES(source_ticket),
        customer_type = VALUES(customer_type),
        service_no   = VALUES(service_no),
        symptom       = VALUES(symptom),
        description_solution_dompis = VALUES(description_solution_dompis),
        device_name  = VALUES(device_name),
        jenis_tiket  = VALUES(jenis_tiket),
        jam_expired  = VALUES(jam_expired),
        redaman      = VALUES(redaman),
        manja_expired = VALUES(manja_expired),
        alamat       = VALUES(alamat),
        pending_dompis = VALUES(pending_dompis),
        guarantee_status = VALUES(guarantee_status),
        flagging_manja = VALUES(flagging_manja),
        lapul        = VALUES(lapul),
        gaul         = VALUES(gaul),
        onu_rx       = VALUES(onu_rx),
        -- ✅ status_update TIDAK di-update: biarkan apa adanya (app workflow yang pegang)
        -- status_update = VALUES(status_update),
        status_manja = VALUES(status_manja),
        jam_expired_12_jam_gold = VALUES(jam_expired_12_jam_gold),
        status_ttr_12_gold = VALUES(status_ttr_12_gold),
        jam_expired_3_jam_diamond = VALUES(jam_expired_3_jam_diamond),
        status_ttr_3_diamond = VALUES(status_ttr_3_diamond),
        jam_expired_24_jam_reguler = VALUES(jam_expired_24_jam_reguler),
        status_ttr_24_reguler = VALUES(status_ttr_24_reguler),
        jam_expired_6_jam_platinum = VALUES(jam_expired_6_jam_platinum),
        status_ttr_6_platinum = VALUES(status_ttr_6_platinum),
        ttr_k1_datin_1_5_jam = VALUES(ttr_k1_datin_1_5_jam),
        ttr_k1_repair_k2_datin_3_6_jam = VALUES(ttr_k1_repair_k2_datin_3_6_jam),
        ttr_k3_datin_7_2_jam = VALUES(ttr_k3_datin_7_2_jam),
        ttr_indibiz_4_jam = VALUES(ttr_indibiz_4_jam),
        ttr_indibiz_24_jam = VALUES(ttr_indibiz_24_jam),
        ttr_indihome_reseller_6_jam = VALUES(ttr_indihome_reseller_6_jam),
        ttr_indihome_reseller_36_jam = VALUES(ttr_indihome_reseller_36_jam),
        ttr_wifi_24_jam = VALUES(ttr_wifi_24_jam),
        rk_information = VALUES(rk_information),
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

    // UPDATE terlindungi: status_update TIDAK di-update, hanya metadata teknis
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
        incident,summary,reported_date,owner_group,
        customer_segment,service_type,workzone,status,
        ticket_id_gamas,contact_phone,contact_name,
        booking_date,source_ticket,customer_type,
        service_no,symptom,description_solution_dompis,
        device_name,jenis_tiket,jam_expired,redaman,
        manja_expired,alamat,pending_dompis,
        guarantee_status,flagging_manja,
        lapul,gaul,onu_rx,status_update,
        status_manja,
        jam_expired_12_jam_gold,status_ttr_12_gold,
        jam_expired_3_jam_diamond,status_ttr_3_diamond,
        jam_expired_24_jam_reguler,status_ttr_24_reguler,
        jam_expired_6_jam_platinum,status_ttr_6_platinum,
        ttr_k1_datin_1_5_jam,ttr_k1_repair_k2_datin_3_6_jam,
        ttr_k3_datin_7_2_jam,ttr_indibiz_4_jam,
        ttr_indibiz_24_jam,ttr_indihome_reseller_6_jam,
        ttr_indihome_reseller_36_jam,ttr_wifi_24_jam,
        rca,sub_rca,rk_information,
        sync_date,import_batch
        ) VALUES ${placeholders}

        ON DUPLICATE KEY UPDATE
        summary       = VALUES(summary),
        reported_date = VALUES(reported_date),
        owner_group   = VALUES(owner_group),
        customer_segment = VALUES(customer_segment),
        service_type = VALUES(service_type),
        workzone      = VALUES(workzone),
        status       = VALUES(status),
        ticket_id_gamas = VALUES(ticket_id_gamas),
        contact_phone = VALUES(contact_phone),
        contact_name  = VALUES(contact_name),
        booking_date = VALUES(booking_date),
        source_ticket = VALUES(source_ticket),
        customer_type = VALUES(customer_type),
        service_no   = VALUES(service_no),
        symptom       = VALUES(symptom),
        description_solution_dompis = VALUES(description_solution_dompis),
        device_name  = VALUES(device_name),
        jenis_tiket  = VALUES(jenis_tiket),
        jam_expired  = VALUES(jam_expired),
        redaman      = VALUES(redaman),
        manja_expired = VALUES(manja_expired),
        alamat       = VALUES(alamat),
        -- ✅ PENDING_REASON tidak disentuh: teknisi mungkin sudah mengisi ini
        -- pending_dompis = VALUES(pending_dompis),
        guarantee_status = VALUES(guarantee_status),
        flagging_manja = VALUES(flagging_manja),
        lapul        = VALUES(lapul),
        gaul         = VALUES(gaul),
        onu_rx       = VALUES(onu_rx),
        -- ✅ status_update tidak disentuh: workflow app yang pegang kendali
        -- status_update = VALUES(status_update),
        -- ✅ RCA dan Sub_RCA tidak disentuh: teknisi yang pegang kendali
        -- rca = VALUES(rca),
        -- sub_rca = VALUES(sub_rca),
        status_manja = VALUES(status_manja),
        jam_expired_12_jam_gold = VALUES(jam_expired_12_jam_gold),
        status_ttr_12_gold = VALUES(status_ttr_12_gold),
        jam_expired_3_jam_diamond = VALUES(jam_expired_3_jam_diamond),
        status_ttr_3_diamond = VALUES(status_ttr_3_diamond),
        jam_expired_24_jam_reguler = VALUES(jam_expired_24_jam_reguler),
        status_ttr_24_reguler = VALUES(status_ttr_24_reguler),
        jam_expired_6_jam_platinum = VALUES(jam_expired_6_jam_platinum),
        status_ttr_6_platinum = VALUES(status_ttr_6_platinum),
        ttr_k1_datin_1_5_jam = VALUES(ttr_k1_datin_1_5_jam),
        ttr_k1_repair_k2_datin_3_6_jam = VALUES(ttr_k1_repair_k2_datin_3_6_jam),
        ttr_k3_datin_7_2_jam = VALUES(ttr_k3_datin_7_2_jam),
        ttr_indibiz_4_jam = VALUES(ttr_indibiz_4_jam),
        ttr_indibiz_24_jam = VALUES(ttr_indibiz_24_jam),
        ttr_indihome_reseller_6_jam = VALUES(ttr_indihome_reseller_6_jam),
        ttr_indihome_reseller_36_jam = VALUES(ttr_indihome_reseller_36_jam),
        ttr_wifi_24_jam = VALUES(ttr_wifi_24_jam),
        rk_information = VALUES(rk_information),
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
