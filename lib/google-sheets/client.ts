import { JWT } from 'google-auth-library';
import 'dotenv/config';

const GOOGLE_SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const GOOGLE_PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY;

function getSpreadsheetIdOrThrow(): string {
  const id = process.env.SPREADSHEET_ID;
  if (!id) {
    throw new Error('SPREADSHEET_ID is not set in environment');
  }
  return id;
}

let jwtClient: JWT | null = null;
let sheetsClient: SheetsClient | null = null;

const SHEETS_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';

function getJwtClient(): JWT {
  if (jwtClient) return jwtClient;
  if (!GOOGLE_SERVICE_ACCOUNT_EMAIL || !GOOGLE_PRIVATE_KEY) {
    throw new Error(
      'GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY must be set in environment',
    );
  }
  jwtClient = new JWT({
    email: GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return jwtClient;
}

async function getAccessToken(): Promise<string> {
  const client = getJwtClient();
  const token = await client.getAccessToken();
  if (!token.token) throw new Error('Failed to get Google API access token');
  return token.token;
}

async function fetchWithRetry(
  url: string,
  options: RequestInit,
): Promise<Response> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url, options);
      if (response.ok) return response;
      lastError = new Error(
        `Google Sheets API error ${response.status}: ${(
          await response.text().catch(() => '')
        ).slice(0, 200)}`,
      );
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
    if (attempt < 2) {
      await new Promise((resolve) =>
        setTimeout(resolve, Math.pow(2, attempt) * 1000 + Math.random() * 1000),
      );
    }
  }
  throw lastError ?? new Error('Google Sheets API request failed');
}

interface SheetsClient {
  spreadsheets: {
    values: {
      get: (params: {
        spreadsheetId: string;
        range: string;
        valueRenderOption?: string;
      }) => Promise<{ data: any }>;
      update: (params: {
        spreadsheetId: string;
        range: string;
        valueInputOption?: string;
        requestBody: any;
      }) => Promise<{ data: any }>;
      batchUpdate: (params: {
        spreadsheetId: string;
        requestBody: {
          valueInputOption?: string;
          data: Array<{ range: string; values: any[][] }>;
        };
      }) => Promise<{ data: any }>;
    };
    get: (params: {
      spreadsheetId: string;
      ranges?: string[];
      includeGridData?: boolean;
    }) => Promise<{ data: any }>;
  };
}

export function getSheetsClient(): SheetsClient {
  if (sheetsClient) return sheetsClient;

  sheetsClient = {
    spreadsheets: {
      values: {
        get: async ({ spreadsheetId, range, valueRenderOption }) => {
          const token = await getAccessToken();
          let url = `${SHEETS_BASE}/${spreadsheetId}/values/${range}`;
          if (valueRenderOption) {
            url += `?valueRenderOption=${valueRenderOption}`;
          }
          const response = await fetchWithRetry(url, {
            headers: { Authorization: `Bearer ${token}` },
          });
          return { data: await response.json() };
        },
        update: async ({
          spreadsheetId,
          range,
          valueInputOption = 'USER_ENTERED',
          requestBody,
        }) => {
          const token = await getAccessToken();
          const url = `${SHEETS_BASE}/${spreadsheetId}/values/${range}?valueInputOption=${valueInputOption}`;
          const response = await fetchWithRetry(url, {
            method: 'PUT',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
          });
          return { data: await response.json() };
        },
        batchUpdate: async ({ spreadsheetId, requestBody }) => {
          const token = await getAccessToken();
          const url = `${SHEETS_BASE}/${spreadsheetId}/values:batchUpdate`;
          const response = await fetchWithRetry(url, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
          });
          return { data: await response.json() };
        },
      },
      get: async ({ spreadsheetId, ranges, includeGridData }) => {
        const token = await getAccessToken();
        let url = `${SHEETS_BASE}/${spreadsheetId}`;
        const params = new URLSearchParams();
        if (ranges) {
          for (const r of ranges) params.append('ranges', r);
        }
        if (includeGridData) params.set('includeGridData', 'true');
        const qs = params.toString();
        if (qs) url += `?${qs}`;
        const response = await fetchWithRetry(url, {
          headers: { Authorization: `Bearer ${token}` },
        });
        return { data: await response.json() };
      },
    },
  };

  return sheetsClient;
}

export function getSpreadsheetId(): string {
  return getSpreadsheetIdOrThrow();
}
