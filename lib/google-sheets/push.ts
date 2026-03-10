import prisma from '@/app/libs/prisma';
import { getSheetsClient, getSpreadsheetId } from './client';
import { nowWIB } from './helpers';

const SHEET_NAME = 'Dummy_Dompis';
const START_ROW = 6;

const BATCH_SIZE = 200;
const RETRY_MAX = 3;

const MAX_READ_ROW = 50000;

let isPushRunning = false;

function hashRow(data: any[]) {
  return data.join('|');
}

async function retryGoogle(fn: () => Promise<any>) {
  let attempt = 0;

  while (attempt < RETRY_MAX) {
    try {
      return await fn();
    } catch (err) {
      attempt++;

      if (attempt >= RETRY_MAX) throw err;

      console.log(`Retry Google API ${attempt}`);
      await new Promise((r) => setTimeout(r, attempt * 1500));
    }
  }
}

export async function pushSpreadsheet() {
  if (isPushRunning) {
    console.log('PUSH skip — masih running');
    return { success: false };
  }

  isPushRunning = true;

  try {
    console.log('PUSH START', nowWIB());

    const sheets = getSheetsClient();
    const spreadsheetId = getSpreadsheetId();

    /**
     * 1️⃣ GET DB
     */

    const tickets = await prisma.ticket.findMany({
      select: {
        INCIDENT: true,
        STATUS_UPDATE: true,
        rca: true,
        sub_rca: true,
        users: {
          select: { nama: true },
        },
      },
    });

    /**
     * 2️⃣ GET SHEET
     */

    const sheetRes = await retryGoogle(() =>
      sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `'${SHEET_NAME}'!B${START_ROW}:AI${MAX_READ_ROW}`,
      }),
    );

    const sheetRows = sheetRes.data.values || [];

    const sheetMap = new Map<string, { row: number; hash: string }>();

    sheetRows.forEach((r: any[], i: number) => {
      const incident = r[0];
      if (!incident) return;

      const teknisi = r[22] || '';
      const hasilVisit = r[30] || '';
      const rca = r[33] || '';
      const subrca = r[34] || '';

      const hash = hashRow([hasilVisit, teknisi, rca, subrca]);

      sheetMap.set(incident, {
        row: START_ROW + i,
        hash,
      });
    });

    /**
     * 3️⃣ COMPARE
     */

    const updates: any[] = [];
    const inserts: any[] = [];

    let skipped = 0;

    for (const t of tickets) {
      const teknisi = t.users?.nama ?? '';

      const dbData = [
        t.STATUS_UPDATE ?? '',
        teknisi,
        t.rca ?? '',
        t.sub_rca ?? '',
      ];

      const dbHash = hashRow(dbData);

      const sheetRow = sheetMap.get(t.INCIDENT);

      if (!sheetRow) {
        inserts.push([
          t.INCIDENT,
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          t.STATUS_UPDATE ?? '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          t.STATUS_UPDATE ?? '',
          '',
          teknisi,
          t.rca ?? '',
          t.sub_rca ?? '',
        ]);

        continue;
      }

      if (sheetRow.hash === dbHash) {
        skipped++;
        continue;
      }

      const row = sheetRow.row;

      updates.push({
        range: `'${SHEET_NAME}'!AE${row}:AI${row}`,
        values: [
          [t.STATUS_UPDATE ?? '', '', teknisi, t.rca ?? '', t.sub_rca ?? ''],
        ],
      });
    }

    /**
     * 4️⃣ UPDATE
     */

    let updated = 0;

    for (let i = 0; i < updates.length; i += BATCH_SIZE) {
      const chunk = updates.slice(i, i + BATCH_SIZE);

      await retryGoogle(() =>
        sheets.spreadsheets.values.batchUpdate({
          spreadsheetId,
          requestBody: {
            valueInputOption: 'RAW',
            data: chunk,
          },
        }),
      );

      updated += chunk.length;
    }

    /**
     * 5️⃣ INSERT
     */

    if (inserts.length) {
      const startInsertRow = START_ROW + sheetRows.length;

      const insertBatch = inserts.map((row, i) => ({
        range: `'${SHEET_NAME}'!B${startInsertRow + i}`,
        values: [row],
      }));

      await retryGoogle(() =>
        sheets.spreadsheets.values.batchUpdate({
          spreadsheetId,
          requestBody: {
            valueInputOption: 'RAW',
            data: insertBatch,
          },
        }),
      );
    }

    console.log(`
      PUSH DONE
      updated : ${updated}
      inserted: ${inserts.length}
      skipped : ${skipped}
    `);

    return {
      success: true,
      updated,
      inserted: inserts.length,
      skipped,
    };
  } catch (err: any) {
    console.error('PUSH ERROR', err);

    return {
      success: false,
      error: err.message,
    };
  } finally {
    isPushRunning = false;
  }
}
