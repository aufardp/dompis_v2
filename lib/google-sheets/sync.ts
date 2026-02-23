import pool, { RowDataPacket } from '../../lib/db';
import { getSheetsClient, getSpreadsheetId } from './client';
import { nowWIB } from './helpers';

const RANGE = 'Rekap_WO_Hi!A1:HZ5000';

interface SyncResult {
  inserted: number;
  updated: number;
  errors: string[];
}

/**
 * Mapping kolom spreadsheet ke field DB (0-based index)
 *
 *  0   = INCIDENT
 *  2   = SUMMARY
 *  3   = REPORTED_DATE
 *  4   = OWNER_GROUP
 *  6   = CUSTOMER_SEGMENT
 *  7   = SERVICE_TYPE
 *  9   = WORKZONE
 *  10  = STATUS
 *  12  = TICKET_ID_GAMAS
 *  14  = CONTACT_PHONE
 *  15  = CONTACT_NAME
 *  17  = BOOKING_DATE
 *  20  = SOURCE_TICKET
 *  24  = CUSTOMER_TYPE
 *  30  = SERVICE_NO
 *  36  = PENDING_REASON
 *  40  = SYMPTOM
 *  43  = DESCRIPTION_ACTUAL_SOLUTION
 *  47  = DEVICE_NAME
 *  84  = JENIS_TIKET
 *  85  = JAM_EXPIRED
 *  102 = MANJA_EXPIRED
 *  113 = JAM_EXPIRED_12_JAM_GOLD
 *  114 = STATUS_TTR_12_GOLD
 *  115 = JAM_EXPIRED_3_JAM_DIAMOND
 *  116 = STATUS_TTR_3_DIAMOND
 *  117 = JAM_EXPIRED_24_JAM_REGULER
 *  118 = STATUS_TTR_24_REGULER
 *  119 = REDAMAN
 *  120 = JAM_EXPIRED_6_JAM_PLATINUM
 *  121 = STATUS_TTR_6_PLATINUM
 *  122 = ALAMAT
 *  124 = HASIL_VISIT
 *  125 = rca
 *  126 = sub_rca
 *
 * Kolom tidak dari spreadsheet (tidak di-sync):
 *  id_ticket       → AUTO_INCREMENT
 *  teknisi_user_id → diisi manual / sistem lain
 *  closed_at       → diisi manual / sistem lain
 */
function mapRow(row: (string | undefined)[]): (string | null)[] {
  const mapped = [
    row[0] ?? null, // INCIDENT
    row[2] ?? null, // SUMMARY
    row[3] ?? null, // REPORTED_DATE
    row[4] ?? null, // OWNER_GROUP
    row[6] ?? null, // CUSTOMER_SEGMENT
    row[7] ?? null, // SERVICE_TYPE
    row[9] ?? null, // WORKZONE
    row[10] ?? null, // STATUS
    row[12] ?? null, // TICKET_ID_GAMAS
    row[14] ?? null, // CONTACT_PHONE
    row[15] ?? null, // CONTACT_NAME
    row[17] ?? null, // BOOKING_DATE
    row[20] ?? null, // SOURCE_TICKET
    row[24] ?? null, // CUSTOMER_TYPE
    row[30] ?? null, // SERVICE_NO
    row[40] ?? null, // SYMPTOM
    row[43] ?? null, // DESCRIPTION_ACTUAL_SOLUTION
    row[47] ?? null, // DEVICE_NAME
    row[124] ?? null, // HASIL_VISIT
    row[113] ?? null, // JAM_EXPIRED_12_JAM_GOLD
    row[114] ?? null, // STATUS_TTR_12_GOLD
    row[115] ?? null, // JAM_EXPIRED_3_JAM_DIAMOND
    row[116] ?? null, // STATUS_TTR_3_DIAMOND
    row[117] ?? null, // JAM_EXPIRED_24_JAM_REGULER
    row[118] ?? null, // STATUS_TTR_24_REGULER
    row[120] ?? null, // JAM_EXPIRED_6_JAM_PLATINUM
    row[121] ?? null, // STATUS_TTR_6_PLATINUM
    row[84] ?? null, // JENIS_TIKET
    row[85] ?? null, // JAM_EXPIRED
    row[119] ?? null, // REDAMAN
    row[102] ?? null, // MANJA_EXPIRED
    row[122] ?? null, // ALAMAT
    row[36] ?? null, // PENDING_REASON
    row[125] ?? null, // rca
    row[126] ?? null, // sub_rca
  ];
  return mapped.map((v) => v ?? '');
}

let isSyncRunning = false;

export async function syncSpreadsheet(): Promise<SyncResult> {
  const result: SyncResult = {
    inserted: 0,
    updated: 0,
    errors: [],
  };

  if (isSyncRunning) {
    console.log('Sync masih berjalan... skip');
    return result;
  }

  isSyncRunning = true;

  try {
    console.log('Auto Sync mulai:', nowWIB());

    const sheets = getSheetsClient();
    const spreadsheetId = getSpreadsheetId();

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: RANGE,
    });

    const rows = response.data.values || [];

    console.log('Total rows from spreadsheet:', rows.length);
    console.log('First row (headers):', rows[0]?.slice(0, 10));
    console.log('Second row sample:', rows[1]?.slice(0, 10));

    if (rows.length <= 1) {
      console.log('Tidak ada data');
      return result;
    }

    const [existingRows] = await pool.query<RowDataPacket[]>(
      'SELECT INCIDENT FROM ticket',
    );

    const existingSet = new Set(
      (existingRows as RowDataPacket[]).map((r) => r.INCIDENT),
    );

    console.log('Existing tickets in DB:', existingRows.length);
    console.log(
      'Sample existing INCIDENT:',
      Array.from(existingSet).slice(0, 5),
    );

    let inserted = 0;
    let updated = 0;
    const mappedData: (string | null)[][] = [];

    for (let i = 1; i < rows.length; i++) {
      const data = mapRow(rows[i]);
      const incident = data[0] as string;

      if (!incident) {
        console.log(`Row ${i} skipped: no INCIDENT value`);
        continue;
      }

      if (existingSet.has(incident)) {
        updated++;
      } else {
        inserted++;
      }
      mappedData.push(data);
    }

    console.log(
      `Processed ${rows.length - 1} spreadsheet rows: ${inserted} new, ${updated} existing`,
    );
    console.log('Sample mapped data (first row):', mappedData[0]);

    if (mappedData.length === 0) {
      return result;
    }

    // 35 kolom dari spreadsheet
    // (id_ticket=AUTO_INCREMENT, teknisi_user_id & closed_at tidak di-sync)
    const COLUMN_COUNT = 35;
    const placeholders = mappedData
      .map(() => `(${Array(COLUMN_COUNT).fill('?').join(',')})`)
      .join(',');

    const flatValues = mappedData.flat();

    const query = `
      INSERT INTO ticket (
        INCIDENT, SUMMARY, REPORTED_DATE, OWNER_GROUP,
        CUSTOMER_SEGMENT, SERVICE_TYPE, WORKZONE, STATUS,
        TICKET_ID_GAMAS, CONTACT_PHONE, CONTACT_NAME,
        BOOKING_DATE, SOURCE_TICKET, CUSTOMER_TYPE,
        SERVICE_NO, SYMPTOM, DESCRIPTION_ACTUAL_SOLUTION,
        DEVICE_NAME, HASIL_VISIT, JAM_EXPIRED_12_JAM_GOLD,
        STATUS_TTR_12_GOLD, JAM_EXPIRED_3_JAM_DIAMOND,
        STATUS_TTR_3_DIAMOND, JAM_EXPIRED_24_JAM_REGULER,
        STATUS_TTR_24_REGULER, JAM_EXPIRED_6_JAM_PLATINUM,
        STATUS_TTR_6_PLATINUM, JENIS_TIKET, JAM_EXPIRED,
        REDAMAN, MANJA_EXPIRED, ALAMAT, PENDING_REASON,
        rca, sub_rca
      ) VALUES ${placeholders}
      ON DUPLICATE KEY UPDATE
        SUMMARY                     = VALUES(SUMMARY),
        REPORTED_DATE               = VALUES(REPORTED_DATE),
        OWNER_GROUP                 = VALUES(OWNER_GROUP),
        CUSTOMER_SEGMENT            = VALUES(CUSTOMER_SEGMENT),
        SERVICE_TYPE                = VALUES(SERVICE_TYPE),
        WORKZONE                    = VALUES(WORKZONE),
        STATUS                      = VALUES(STATUS),
        TICKET_ID_GAMAS             = VALUES(TICKET_ID_GAMAS),
        CONTACT_PHONE               = VALUES(CONTACT_PHONE),
        CONTACT_NAME                = VALUES(CONTACT_NAME),
        BOOKING_DATE                = VALUES(BOOKING_DATE),
        SOURCE_TICKET               = VALUES(SOURCE_TICKET),
        CUSTOMER_TYPE               = VALUES(CUSTOMER_TYPE),
        SERVICE_NO                  = VALUES(SERVICE_NO),
        SYMPTOM                     = VALUES(SYMPTOM),
        DESCRIPTION_ACTUAL_SOLUTION = VALUES(DESCRIPTION_ACTUAL_SOLUTION),
        DEVICE_NAME                 = VALUES(DEVICE_NAME),
        HASIL_VISIT                 = VALUES(HASIL_VISIT),
        JAM_EXPIRED_12_JAM_GOLD     = VALUES(JAM_EXPIRED_12_JAM_GOLD),
        STATUS_TTR_12_GOLD          = VALUES(STATUS_TTR_12_GOLD),
        JAM_EXPIRED_3_JAM_DIAMOND   = VALUES(JAM_EXPIRED_3_JAM_DIAMOND),
        STATUS_TTR_3_DIAMOND        = VALUES(STATUS_TTR_3_DIAMOND),
        JAM_EXPIRED_24_JAM_REGULER  = VALUES(JAM_EXPIRED_24_JAM_REGULER),
        STATUS_TTR_24_REGULER       = VALUES(STATUS_TTR_24_REGULER),
        JAM_EXPIRED_6_JAM_PLATINUM  = VALUES(JAM_EXPIRED_6_JAM_PLATINUM),
        STATUS_TTR_6_PLATINUM       = VALUES(STATUS_TTR_6_PLATINUM),
        JENIS_TIKET                 = VALUES(JENIS_TIKET),
        JAM_EXPIRED                 = VALUES(JAM_EXPIRED),
        REDAMAN                     = VALUES(REDAMAN),
        MANJA_EXPIRED               = VALUES(MANJA_EXPIRED),
        ALAMAT                      = VALUES(ALAMAT),
        PENDING_REASON              = VALUES(PENDING_REASON),
        rca                         = VALUES(rca),
        sub_rca                     = VALUES(sub_rca)
        -- teknisi_user_id & closed_at TIDAK di-update dari spreadsheet
    `;

    console.log(`Executing bulk insert for ${mappedData.length} rows...`);
    const insertResult = await pool.query(query, flatValues);
    console.log('Bulk insert result:', insertResult);

    result.inserted = inserted;
    result.updated = updated;

    console.log(`Sync selesai | Insert: ${inserted} | Update: ${updated}`);

    if (inserted > 0) {
      console.log(`✅ ${inserted} DATA BARU MASUK`);
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error('Sync error:', errorMessage);
    result.errors.push(errorMessage);
  } finally {
    isSyncRunning = false;
  }

  return result;
}
