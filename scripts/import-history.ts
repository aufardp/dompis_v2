/**
 * Import History Script
 *
 * Purpose: Import historical ticket data from Excel file
 * Usage: npx tsx scripts/import-history.ts <filePath> [--batch-size=100] [--dry-run]
 *
 * Features:
 * - Batch insert with ON DUPLICATE KEY UPDATE
 * - Data integrity protection (rca, sub_rca, status_update)
 * - Sync date from DATEMODIFIED column
 * - Cache invalidation after import
 * - Dry-run mode for preview
 */

import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';

const BATCH_SIZE_DEFAULT = 100;

interface ImportResult {
  success: boolean;
  inserted: number;
  updated: number;
  skipped: number;
  errors: string[];
  duration: number;
}

const WORKFLOW_PROTECTED_STATUSES = new Set([
  'assigned',
  'on_progress',
  'pending',
  'close',
  'closed',
]);

function isWorkflowProtected(status: string | null | undefined): boolean {
  if (!status) return false;
  return WORKFLOW_PROTECTED_STATUSES.has(status.toLowerCase().trim());
}

/**
 * Parse Excel date serial number to YYYY-MM-DD string
 */
function parseExcelDate(value: any): string | null {
  if (!value) return null;

  if (typeof value === 'string') {
    const date = new Date(value);
    if (!isNaN(date.getTime())) {
      return date.toISOString().split('T')[0];
    }
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString().split('T')[0];
  }

  if (typeof value === 'number') {
    const date = XLSX.SSF.parse_date_code(value);
    if (date) {
      return `${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`;
    }
  }

  return null;
}

/**
 * Normalize cell value
 */
function normalizeValue(value: any): string | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  return String(value).trim();
}

/**
 * Build column map from Excel headers (case-insensitive)
 */
function buildColumnMap(header: string[]): Record<string, number> {
  const map: Record<string, number> = {};

  const columnMappings: Record<string, string[]> = {
    incident: ['incident', 'incident', 'Ticket ID', 'Ticket ID'],
    SUMMARY: ['SUMMARY', 'summary', 'Description', 'Description'],
    REPORTED_DATE: [
      'REPORTED DATE',
      'REPORTED_DATE',
      'REPORTED DATE',
      'Reported Date',
      'reported_date',
    ],
    STATUS: ['STATUS', 'status', 'Status'],
    OWNER_GROUP: ['OWNER GROUP', 'OWNER_GROUP', 'Owner Group', 'owner_group'],
    CUSTOMER_SEGMENT: [
      'CUSTOMER SEGMENT',
      'CUSTOMER_SEGMENT',
      'Customer Segment',
      'customer_segment',
    ],
    SERVICE_TYPE: [
      'SERVICE TYPE',
      'SERVICE_TYPE',
      'Service Type',
      'service_type',
    ],
    WORKZONE: ['WITEL', 'witel', 'Workzone', 'workzone'],
    TICKET_ID_GAMAS: [
      'TICKET ID GAMAS',
      'TICKET_ID_GAMAS',
      'Ticket ID Gamas',
      'ticket_id_gamas',
    ],
    CONTACT_PHONE: [
      'CONTACT PHONE',
      'CONTACT_PHONE',
      'Contact Phone',
      'contact_phone',
      'Phone',
    ],
    CONTACT_NAME: [
      'CUSTOMER NAME',
      'CUSTOMER_NAME',
      'Customer Name',
      'customer_name',
      'Contact Name',
    ],
    BOOKING_DATE: [
      'BOOKING DATE',
      'BOOKING_DATE',
      'Booking Date',
      'booking_date',
    ],
    SOURCE_TICKET: [
      'SOURCE TICKET',
      'SOURCE_TICKET',
      'Source Ticket',
      'source_ticket',
    ],
    CUSTOMER_TYPE: [
      'CUSTOMER TYPE',
      'CUSTOMER_TYPE',
      'Customer Type',
      'customer_type',
    ],
    SERVICE_NO: [
      'SERVICE NO',
      'SERVICE_NO',
      'Service No',
      'service_no',
      'SERVICE ID',
      'SERVICE_ID',
    ],
    SYMPTOM: ['SYMPTOM', 'symptom', 'Symptom'],
    DESCRIPTION_ACTUAL_SOLUTION: [
      'DESCRIPTION ACTUAL SOLUTION',
      'DESCRIPTION_ACTUAL_SOLUTION',
      'Description Actual Solution',
      'Actual Solution',
    ],
    DEVICE_NAME: ['DEVICE NAME', 'DEVICE_NAME', 'Device Name', 'device_name'],
    RK_INFORMATION: [
      'RK INFORMATION',
      'RK_INFORMATION',
      'RK Information',
      'rk_information',
    ],
    JENIS_TIKET: ['JENIS TIKET', 'JENIS_TIKET', 'Jenis Tiket', 'jenis_tiket'],
    PENDING_REASON: [
      'PENDING REASON',
      'PENDING_REASON',
      'Pending Reason',
      'pending_dompis',
    ],
    GUARANTE_STATUS: [
      'GUARANTE STATUS',
      'GUARANTE_STATUS',
      'Guarante Status',
      'guarante_status',
    ],
    FLAGGING_MANJA: [
      'FLAGGING MANJA',
      'FLAGGING_MANJA',
      'Flagging Manja',
      'flagging_manja',
    ],
    LAPUL: ['LAPUL', 'lapul'],
    GAUL: ['GAUL', 'gaul'],
    ONU_RX: ['ONU RX', 'ONU_RX', 'Onu Rx', 'onu_rx'],
    status_update: [
      'STATUS UPDATE',
      'status_update',
      'Status Update',
      'status_update',
    ],
    rca: ['rca', 'RCA'],
    sub_rca: ['sub_rca', 'SUB_RCA', 'Sub RCA'],
    DATEMODIFIED: [
      'DATEMODIFIED',
      'DATE MODIFIED',
      'Date Modified',
      'date_modified',
      'DateMod',
      'datemodified',
    ],
  };

  for (const [field, possibleNames] of Object.entries(columnMappings)) {
    for (const name of possibleNames) {
      const idx = header.findIndex(
        (h) => h.trim().toLowerCase() === name.toLowerCase(),
      );
      if (idx !== -1) {
        map[field] = idx;
        break;
      }
    }
  }

  return map;
}

/**
 * Map Excel row to ticket data array
 */
function mapRowToTicketData(
  row: any[],
  col: Record<string, number>,
): (string | null)[] {
  const get = (key: string): string | null => {
    const idx = col[key];
    if (idx === undefined || idx === -1) return null;
    return normalizeValue(row[idx]);
  };

  const syncDate =
    get('DATEMODIFIED') || new Date().toISOString().split('T')[0];

  return [
    get('incident'), // [0] incident - Primary Key
    get('SUMMARY'), // [1] SUMMARY
    get('REPORTED_DATE'), // [2] REPORTED_DATE
    get('OWNER_GROUP'), // [3] OWNER_GROUP
    get('CUSTOMER_SEGMENT'), // [4] CUSTOMER_SEGMENT
    get('SERVICE_TYPE'), // [5] SERVICE_TYPE
    get('WORKZONE'), // [6] WORKZONE
    get('STATUS'), // [7] STATUS
    get('TICKET_ID_GAMAS'), // [8] TICKET_ID_GAMAS
    get('CONTACT_PHONE'), // [9] CONTACT_PHONE
    get('CONTACT_NAME'), // [10] CONTACT_NAME
    get('BOOKING_DATE'), // [11] BOOKING_DATE
    get('SOURCE_TICKET'), // [12] SOURCE_TICKET
    get('CUSTOMER_TYPE'), // [13] CUSTOMER_TYPE
    get('SERVICE_NO'), // [14] SERVICE_NO
    get('SYMPTOM'), // [15] SYMPTOM
    get('DESCRIPTION_ACTUAL_SOLUTION'), // [16] DESCRIPTION_ACTUAL_SOLUTION
    get('DEVICE_NAME'), // [17] DEVICE_NAME
    get('JENIS_TIKET'), // [18] JENIS_TIKET
    null, // [19] JAM_EXPIRED - skip
    null, // [20] REDAMAN - skip
    null, // [21] MANJA_EXPIRED - skip
    null, // [22] ALAMAT - skip
    get('PENDING_REASON'), // [23] PENDING_REASON
    get('GUARANTE_STATUS'), // [24] GUARANTE_STATUS
    get('FLAGGING_MANJA'), // [25] FLAGGING_MANJA
    get('LAPUL'), // [26] LAPUL
    get('GAUL'), // [27] GAUL
    get('ONU_RX'), // [28] ONU_RX
    get('status_update'), // [29] status_update
    null, // [30] STATUS_MANJA - skip
    null, // [31] JAM_EXPIRED_12_JAM_GOLD - skip
    null, // [32] STATUS_TTR_12_GOLD - skip
    null, // [33] JAM_EXPIRED_3_JAM_DIAMOND - skip
    null, // [34] STATUS_TTR_3_DIAMOND - skip
    null, // [35] JAM_EXPIRED_24_JAM_REGULER - skip
    null, // [36] STATUS_TTR_24_REGULER - skip
    null, // [37] JAM_EXPIRED_6_JAM_PLATINUM - skip
    null, // [38] STATUS_TTR_6_PLATINUM - skip
    null, // [39] TTR_K1_DATIN_1_5_JAM - skip
    null, // [40] TTR_K1_REPAIR_K2_DATIN_3_6_JAM - skip
    null, // [41] TTR_K3_DATIN_7_2_JAM - skip
    null, // [42] TTR_INDIBIZ_4_JAM - skip
    null, // [43] TTR_INDIBIZ_24_JAM - skip
    null, // [44] TTR_INDIHOME_RESELLER_6_JAM - skip
    null, // [45] TTR_INDIHOME_RESELLER_36_JAM - skip
    null, // [46] TTR_WIFI_24_JAM - skip
    null, // [47] rca - will be handled separately (protected)
    null, // [48] sub_rca - will be handled separately (protected)
    get('RK_INFORMATION'), // [49] RK_INFORMATION
    syncDate, // [50] sync_date
  ];
}

/**
 * Import tickets from Excel file
 */
async function importFromExcel(
  filePath: string,
  batchSize: number = BATCH_SIZE_DEFAULT,
  dryRun: boolean = false,
): Promise<ImportResult> {
  const startTime = Date.now();
  const result: ImportResult = {
    success: false,
    inserted: 0,
    updated: 0,
    skipped: 0,
    errors: [],
    duration: 0,
  };

  if (!fs.existsSync(filePath)) {
    result.errors.push(`File not found: ${filePath}`);
    return result;
  }

  console.log(`📂 Reading Excel file: ${filePath}`);

  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];

  if (rows.length < 2) {
    result.errors.push('File is empty or has no data rows');
    return result;
  }

  const header = rows[0].map((h: any) => String(h).trim());
  const col = buildColumnMap(header);

  console.log(`📊 Found ${rows.length - 1} data rows`);
  console.log(
    `🔍 Column mapping:`,
    Object.keys(col).filter((k) => col[k] !== undefined),
  );

  const incidentIdx = col['incident'];
  if (incidentIdx === undefined) {
    result.errors.push('Column incident not found in Excel file');
    return result;
  }

  const mappedRows: (string | null)[][] = [];
  const skippedRows: string[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const incident = row[incidentIdx];

    if (!incident || String(incident).trim() === '') {
      skippedRows.push(`Row ${i + 1}: incident is empty`);
      result.skipped++;
      continue;
    }

    const mapped = mapRowToTicketData(row, col);
    mappedRows.push(mapped);
  }

  console.log(`✅ Valid rows: ${mappedRows.length}`);
  console.log(`⏭️ Skipped rows: ${result.skipped}`);

  if (mappedRows.length === 0) {
    result.errors.push('No valid data to import');
    return result;
  }

  if (dryRun) {
    console.log('\n🟡 DRY RUN MODE - No data will be inserted');
    console.log('Sample rows (first 3):');
    mappedRows.slice(0, 3).forEach((row, i) => {
      console.log(`  ${i + 1}. incident: ${row[0]}, sync_date: ${row[50]}`);
    });
    result.success = true;
    result.duration = Date.now() - startTime;
    return result;
  }

  // Dynamic import Prisma (avoid loading in non-TS context)
  const { default: prisma } = await import('@/app/libs/prisma');

  const incidentList = mappedRows.map((r) => r[0] as string);

  console.log('\n🔍 Checking existing incidents in database...');
  const existing = await prisma.ticket.findMany({
    select: {
      incident: true,
      status_update: true,
      rca: true,
      sub_rca: true,
    },
    where: {
      incident: { in: incidentList },
    },
  });

  const existingMap = new Map<
    string,
    { status_update: string | null; rca: string | null; sub_rca: string | null }
  >(
    existing.map((r: any) => [
      r.incident,
      { status_update: r.status_update, rca: r.rca, sub_rca: r.sub_rca },
    ]),
  );

  console.log(`📦 Found ${existingMap.size} existing tickets`);

  const newRows: (string | null)[][] = [];
  const safeRows: (string | null)[][] = [];

  const syncDate = new Date().toISOString().split('T')[0];
  const batchId = `HISTORY_${new Date().toISOString().slice(0, 7)}`;

  for (const row of mappedRows) {
    const incident = row[0];
    const existingData = existingMap.get(incident as string);

    if (!existingData) {
      result.inserted++;
      newRows.push([...row, batchId]);
    } else if (isWorkflowProtected(existingData.status_update)) {
      result.updated++;
      const protectedRow = [...row];
      protectedRow[47] = existingData.rca;
      protectedRow[48] = existingData.sub_rca;
      protectedRow[50] = syncDate;
      safeRows.push([...protectedRow, batchId]);
    } else {
      result.updated++;
      const updatedRow = [...row];
      if (existingData.rca) updatedRow[47] = existingData.rca;
      if (existingData.sub_rca) updatedRow[48] = existingData.sub_rca;
      safeRows.push([...updatedRow, batchId]);
    }
  }

  console.log(`📝 To insert: ${newRows.length}, To update: ${safeRows.length}`);

  // Batch insert new rows
  if (newRows.length > 0) {
    console.log('\n📥 Inserting new tickets...');
    await batchInsert(prisma, newRows, batchSize, 'INSERT');
  }

  // Batch update existing rows
  if (safeRows.length > 0) {
    console.log('\n📝 Updating existing tickets...');
    await batchInsert(prisma, safeRows, batchSize, 'UPDATE');
  }

  // Invalidate cache
  console.log('\n🗑️ Invalidating cache...');
  try {
    const { invalidateTicketsCache } = await import('@/lib/cache');
    await invalidateTicketsCache();
    console.log('✅ Cache invalidated');
  } catch (err) {
    console.warn('⚠️ Cache invalidation failed (non-critical):', err);
  }

  result.success = true;
  result.duration = Date.now() - startTime;
  console.log(`\n✅ Import completed in ${result.duration}ms`);

  return result;
}

/**
 * Batch insert with ON DUPLICATE KEY UPDATE
 */
async function batchInsert(
  prisma: any,
  rows: (string | null)[][],
  batchSize: number,
  mode: 'INSERT' | 'UPDATE',
): Promise<void> {
  const columnCount = 52;

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const placeholders = batch
      .map(() => `(${Array(columnCount).fill('?').join(',')})`)
      .join(',');
    const values: any[] = batch.flat();

    const query = `
      INSERT INTO ticket (
        incident,SUMMARY,REPORTED_DATE,OWNER_GROUP,
        CUSTOMER_SEGMENT,SERVICE_TYPE,WORKZONE,STATUS,
        TICKET_ID_GAMAS,CONTACT_PHONE,CONTACT_NAME,
        BOOKING_DATE,SOURCE_TICKET,CUSTOMER_TYPE,
        SERVICE_NO,SYMPTOM,DESCRIPTION_ACTUAL_SOLUTION,
        DEVICE_NAME,JENIS_TIKET,JAM_EXPIRED,REDAMAN,
        MANJA_EXPIRED,ALAMAT,PENDING_REASON,
        GUARANTE_STATUS,FLAGGING_MANJA,
        LAPUL,GAUL,ONU_RX,status_update,
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
        STATUS        = VALUES(STATUS),
        WORKZONE      = VALUES(WORKZONE),
        OWNER_GROUP   = VALUES(OWNER_GROUP),
        CUSTOMER_SEGMENT = VALUES(CUSTOMER_SEGMENT),
        SERVICE_TYPE  = VALUES(SERVICE_TYPE),
        CONTACT_PHONE = VALUES(CONTACT_PHONE),
        CONTACT_NAME  = VALUES(CONTACT_NAME),
        BOOKING_DATE  = VALUES(BOOKING_DATE),
        SOURCE_TICKET = VALUES(SOURCE_TICKET),
        CUSTOMER_TYPE = VALUES(CUSTOMER_TYPE),
        SERVICE_NO    = VALUES(SERVICE_NO),
        SYMPTOM       = VALUES(SYMPTOM),
        DESCRIPTION_ACTUAL_SOLUTION = VALUES(DESCRIPTION_ACTUAL_SOLUTION),
        DEVICE_NAME   = VALUES(DEVICE_NAME),
        PENDING_REASON = VALUES(PENDING_REASON),
        GUARANTE_STATUS = VALUES(GUARANTE_STATUS),
        FLAGGING_MANJA = VALUES(FLAGGING_MANJA),
        LAPUL         = VALUES(LAPUL),
        GAUL          = VALUES(GAUL),
        ONU_RX        = VALUES(ONU_RX),
        RK_INFORMATION = VALUES(RK_INFORMATION),
        sync_date     = VALUES(sync_date),
        import_batch  = VALUES(import_batch),
        synced_at     = NOW()
    `;

    try {
      await prisma.$executeRawUnsafe(query, ...values);
      console.log(
        `  Processed ${Math.min(i + batchSize, rows.length)}/${rows.length} rows`,
      );
    } catch (err: any) {
      console.error(`  Error at batch ${i}:`, err.message);
      throw err;
    }

    await new Promise((r) => setTimeout(r, 50));
  }
}

/**
 * CLI Entry Point
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log(`
╔═══════════════════════════════════════════════════════════╗
║           IMPORT HISTORY - Ticket Data from Excel          ║
╠═══════════════════════════════════════════════════════════╣
║  Usage:                                                    ║
║    npx tsx scripts/import-history.ts <file> [options]      ║
║                                                            ║
║  Options:                                                  ║
║    --batch-size=<n>    Batch size (default: 100)          ║
║    --dry-run           Preview without inserting          ║
║                                                            ║
║  Example:                                                  ║
║    npx tsx scripts/import-history.xlsx data.xlsx          ║
║    npx tsx scripts/import-history.xlsx data.xlsx --dry-run║
╚═══════════════════════════════════════════════════════════╝
    `);
    process.exit(1);
  }

  const filePath = args[0];
  let batchSize = BATCH_SIZE_DEFAULT;
  let dryRun = false;

  for (const arg of args.slice(1)) {
    if (arg.startsWith('--batch-size=')) {
      batchSize = parseInt(arg.split('=')[1], 10) || BATCH_SIZE_DEFAULT;
    } else if (arg === '--dry-run') {
      dryRun = true;
    }
  }

  console.log('═══════════════════════════════════════════════════════════');
  console.log('IMPORT HISTORY - Starting');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`File: ${filePath}`);
  console.log(`Batch size: ${batchSize}`);
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log('');

  try {
    const result = await importFromExcel(filePath, batchSize, dryRun);

    console.log('');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('RESULT');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`Status: ${result.success ? '✅ SUCCESS' : '❌ FAILED'}`);
    console.log(`Inserted: ${result.inserted}`);
    console.log(`Updated: ${result.updated}`);
    console.log(`Skipped: ${result.skipped}`);
    console.log(`Duration: ${result.duration}ms`);

    if (result.errors.length > 0) {
      console.log('\nErrors:');
      result.errors.forEach((e) => console.log(`  - ${e}`));
    }

    if (!result.success) {
      process.exit(1);
    }
  } catch (err: any) {
    console.error('');
    console.error(
      '═══════════════════════════════════════════════════════════',
    );
    console.error('IMPORT FAILED');
    console.error(
      '═══════════════════════════════════════════════════════════',
    );
    console.error(`Error: ${err.message}`);
    console.error(err.stack);
    process.exit(1);
  }
}

main().catch(console.error);
