import { google, sheets_v4 } from 'googleapis';
import 'dotenv/config';

const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
if (!SPREADSHEET_ID) {
  throw new Error('SPREADSHEET_ID is not set in environment');
}
const SPREADSHEET_ID_STR: string = SPREADSHEET_ID;

const KEYFILE_PATH = process.env.GOOGLE_KEYFILE || './dompis-266f3e00621f.json';

let sheetsClient: sheets_v4.Sheets | null = null;

export function getSheetsClient(): sheets_v4.Sheets {
  if (sheetsClient) {
    return sheetsClient;
  }

  const auth = new google.auth.GoogleAuth({
    keyFile: KEYFILE_PATH,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  sheetsClient = google.sheets({ version: 'v4', auth });
  return sheetsClient;
}

export function getSpreadsheetId(): string {
  return SPREADSHEET_ID_STR;
}
