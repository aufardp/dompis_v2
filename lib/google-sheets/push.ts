import prisma from '@/app/libs/prisma';
import { getSheetsClient, getSpreadsheetId } from './client';
import { nowWIB } from './helpers';

const SHEET_NAME = 'Dummy_Dompis';
const START_ROW = 2;
const BATCH_SIZE = 400;

let isPushRunning = false;

function buildColumnMap(header: string[]) {
  const find = (name: string) => header.indexOf(name);

  return {
    INCIDENT: find('INCIDENT'),
    SUMMARY: find('SUMMARY'),
    REPORTED_DATE: find('REPORTED DATE'),
    OWNER_GROUP: find('OWNER GROUP'),
    SERVICE_TYPE: find('SERVICE TYPE'),
    WORKZONE: find('WORKZONE'),
    CONTACT_PHONE: find('CONTACT PHONE'),
    CONTACT_NAME: find('CONTACT NAME'),
    CUSTOMER_TYPE: find('CUSTOMER TYPE'),
    SERVICE_NO: find('SERVICE NO'),
    SYMPTOM: find('SYMPTOM'),
    DEVICE_NAME: find('DEVICE NAME'),
    STATUS_UPDATE: find('STATUS UPDATE'),
    HASIL_VISIT: find('HASIL VISIT'),
    TEKNISI: find('TEKNISI'),
    RCA: find('RCA'),
    SUB_RCA: find('SUB_RCA'),
    ALAMAT: find('ALAMAT'),
  };
}

export async function pushSpreadsheet() {
  if (isPushRunning) {
    return { success: false, message: 'Push sedang berjalan' };
  }

  isPushRunning = true;

  try {
    console.log('PUSH START', nowWIB());

    const sheets = getSheetsClient();
    const spreadsheetId = getSpreadsheetId();

    /**
     * 1️⃣ Load header
     */

    const headerRes = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `'${SHEET_NAME}'!B6:AZ6`,
    });

    const header = headerRes.data.values?.[0] || [];

    const col = buildColumnMap(header);

    /**
     * 2️⃣ Load INCIDENT dari sheet
     */

    const sheetRes = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `'${SHEET_NAME}'!A${START_ROW}:A`,
    });

    const sheetRows = sheetRes.data.values || [];

    const incidentMap = new Map<string, number>();

    sheetRows.forEach((r, i) => {
      const incident = r[0];
      if (incident) {
        incidentMap.set(incident, i + START_ROW);
      }
    });

    /**
     * 3️⃣ Load data DB
     */

    const tickets = await prisma.ticket.findMany({
      select: {
        INCIDENT: true,
        SUMMARY: true,
        REPORTED_DATE: true,
        OWNER_GROUP: true,
        SERVICE_TYPE: true,
        WORKZONE: true,
        CONTACT_PHONE: true,
        CONTACT_NAME: true,
        CUSTOMER_TYPE: true,
        SERVICE_NO: true,
        SYMPTOM: true,
        DEVICE_NAME: true,
        STATUS_UPDATE: true,
        ALAMAT: true,
        rca: true,
        sub_rca: true,
        users: {
          select: { nama: true },
        },
      },
    });

    const updates: any[] = [];
    const inserts: any[] = [];

    /**
     * 4️⃣ Mapping row
     */

    for (const t of tickets) {
      const teknisi = t.users?.nama ?? '';

      const row = new Array(header.length).fill('');

      row[col.INCIDENT] = t.INCIDENT;
      row[col.SUMMARY] = t.SUMMARY ?? '';
      row[col.REPORTED_DATE] = t.REPORTED_DATE ?? '';
      row[col.OWNER_GROUP] = t.OWNER_GROUP ?? '';
      row[col.SERVICE_TYPE] = t.SERVICE_TYPE ?? '';
      row[col.WORKZONE] = t.WORKZONE ?? '';
      row[col.CONTACT_PHONE] = t.CONTACT_PHONE ?? '';
      row[col.CONTACT_NAME] = t.CONTACT_NAME ?? '';
      row[col.CUSTOMER_TYPE] = t.CUSTOMER_TYPE ?? '';
      row[col.SERVICE_NO] = t.SERVICE_NO ?? '';
      row[col.SYMPTOM] = t.SYMPTOM ?? '';
      row[col.DEVICE_NAME] = t.DEVICE_NAME ?? '';
      row[col.STATUS_UPDATE] = t.STATUS_UPDATE ?? '';
      row[col.HASIL_VISIT] = t.STATUS_UPDATE ?? '';
      row[col.TEKNISI] = teknisi;
      row[col.RCA] = t.rca ?? '';
      row[col.SUB_RCA] = t.sub_rca ?? '';
      row[col.ALAMAT] = t.ALAMAT ?? '';

      const sheetRow = incidentMap.get(t.INCIDENT);

      if (!sheetRow) {
        inserts.push(row);
      } else {
        updates.push({
          range: `'${SHEET_NAME}'!A${sheetRow}`,
          values: [row],
        });
      }
    }

    /**
     * 5️⃣ UPDATE
     */

    for (let i = 0; i < updates.length; i += BATCH_SIZE) {
      const chunk = updates.slice(i, i + BATCH_SIZE);

      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId,
        requestBody: {
          valueInputOption: 'RAW',
          data: chunk,
        },
      });
    }

    /**
     * 6️⃣ INSERT
     */

    if (inserts.length) {
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: `'${SHEET_NAME}'!A${START_ROW}`,
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        requestBody: {
          values: inserts,
        },
      });
    }

    console.log(
      `PUSH DONE | update:${updates.length} insert:${inserts.length}`,
    );

    return {
      success: true,
      updated: updates.length,
      inserted: inserts.length,
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
