import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { writeFile, unlink } from 'fs/promises';
import { join } from 'path';
import { protectApi } from '@/app/libs/protectApi';

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

function normalizeValue(value: any): string | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  return String(value).trim();
}

function buildColumnMap(header: string[]): Record<string, number> {
  const map: Record<string, number> = {};

  const columnMappings: Record<string, string[]> = {
    INCIDENT: ['INCIDENT', 'incident', 'Ticket ID', 'Ticket ID'],
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
      'pending_reason',
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
    STATUS_UPDATE: [
      'STATUS UPDATE',
      'STATUS_UPDATE',
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
    null,
    null,
    null,
    null,
    get('PENDING_REASON'),
    get('GUARANTE_STATUS'),
    get('FLAGGING_MANJA'),
    get('LAPUL'),
    get('GAUL'),
    get('ONU_RX'),
    get('STATUS_UPDATE'),
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    get('rca'),
    get('sub_rca'),
    get('RK_INFORMATION'),
    syncDate,
  ];
}

async function batchInsert(
  prisma: any,
  rows: (string | null)[][],
  batchSize: number,
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

    await prisma.$executeRawUnsafe(query, ...values);
    await new Promise((r) => setTimeout(r, 50));
  }
}

async function processImport(filePath: string): Promise<ImportResult> {
  const startTime = Date.now();
  const result: ImportResult = {
    success: false,
    inserted: 0,
    updated: 0,
    skipped: 0,
    errors: [],
    duration: 0,
  };

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

  const incidentIdx = col['INCIDENT'];
  if (incidentIdx === undefined) {
    result.errors.push('Column INCIDENT not found in Excel file');
    return result;
  }

  const mappedRows: (string | null)[][] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const incident = row[incidentIdx];

    if (!incident || String(incident).trim() === '') {
      result.skipped++;
      continue;
    }

    const mapped = mapRowToTicketData(row, col);
    mappedRows.push(mapped);
  }

  if (mappedRows.length === 0) {
    result.errors.push('No valid data to import');
    return result;
  }

  const { default: prisma } = await import('@/app/libs/prisma');

  const incidentList = mappedRows.map((r) => r[0] as string);

  const existing = await prisma.ticket.findMany({
    select: {
      INCIDENT: true,
      STATUS_UPDATE: true,
      rca: true,
      sub_rca: true,
    },
    where: {
      INCIDENT: { in: incidentList },
    },
  });

  const existingMap = new Map<
    string,
    { STATUS_UPDATE: string | null; rca: string | null; sub_rca: string | null }
  >(
    existing.map((r: any) => [
      r.INCIDENT,
      { STATUS_UPDATE: r.STATUS_UPDATE, rca: r.rca, sub_rca: r.sub_rca },
    ]),
  );

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
    } else if (isWorkflowProtected(existingData.STATUS_UPDATE)) {
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

  if (newRows.length > 0) {
    await batchInsert(prisma, newRows, BATCH_SIZE_DEFAULT);
  }

  if (safeRows.length > 0) {
    await batchInsert(prisma, safeRows, BATCH_SIZE_DEFAULT);
  }

  try {
    const { invalidateTicketsCache } = await import('@/lib/cache');
    await invalidateTicketsCache();
  } catch (err) {
    console.warn('Cache invalidation failed:', err);
  }

  result.success = true;
  result.duration = Date.now() - startTime;

  return result;
}

export async function POST(req: NextRequest) {
  try {
    await protectApi(['admin', 'superadmin', 'super_admin']);

    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json(
        { success: false, message: 'No file uploaded' },
        { status: 400 },
      );
    }

    const allowedTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/csv',
    ];

    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        {
          success: false,
          message: 'Invalid file type. Please upload Excel or CSV file.',
        },
        { status: 400 },
      );
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const tempDir = process.env.TEMP || '/tmp';
    const tempPath = join(tempDir, `import_${Date.now()}_${file.name}`);

    await writeFile(tempPath, buffer);

    try {
      const result = await processImport(tempPath);

      return NextResponse.json({
        success: result.success,
        message: result.success
          ? `Import completed: ${result.inserted} inserted, ${result.updated} updated, ${result.skipped} skipped`
          : 'Import failed',
        inserted: result.inserted,
        updated: result.updated,
        skipped: result.skipped,
        errors: result.errors,
        duration: result.duration,
      });
    } finally {
      await unlink(tempPath).catch(() => {});
    }
  } catch (err: any) {
    console.error('Import error:', err);
    return NextResponse.json(
      { success: false, message: err.message || 'Import failed' },
      { status: 500 },
    );
  }
}
