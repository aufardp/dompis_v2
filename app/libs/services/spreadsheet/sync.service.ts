const sheets = require('../config/google');
const { getConnection } = require('../config/db');

const SHEET_NAME = 'Rekap_WO_Hi';
const RANGE = 'Rekap_WO_Hi!A1:HZ1000';

function mapRow(row) {
    return [
        row[0] ?? '',
        row[2] ?? '',
        row[3] ?? '',
        row[4] ?? '',
        row[6] ?? '',
        row[7] ?? '',
        row[9] ?? '',
        row[10] ?? '',
        row[12] ?? '',
        row[14] ?? '',
        row[15] ?? '',
        row[17] ?? '',
        row[20] ?? '',
        row[24] ?? '',
        row[30] ?? '',
        row[40] ?? '',
        row[43] ?? '',
        row[47] ?? '',
        row[113] ?? '',
        row[114] ?? '',
        row[115] ?? '',
        row[116] ?? '',
        row[117] ?? '',
        row[118] ?? '',
        row[119] ?? '',
        row[120] ?? '',
        row[121] ?? '',
        row[84] ?? '',
        row[85] ?? '',
        row[102] ?? ''
    ];
}

async function syncData() {
    const connection = await getConnection();
    const SPREADSHEET_ID = process.env.SPREADSHEET_ID;

    const sheetResponse = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: RANGE
    });

    const sheetData = sheetResponse.data.values || [];

    const incidentMap = {};
    for (let i = 1; i < sheetData.length; i++) {
        const incident = sheetData[i][0];
        if (incident) incidentMap[incident] = i + 1;
    }

    const [rows] = await connection.query("SELECT * FROM ticket");

    let updated = 0;
    let inserted = 0;

    for (const row of rows) {
        const values = [mapRow(row)];
        const incident = row[0] ?? '';

        if (incidentMap[incident]) {
            await sheets.spreadsheets.values.update({
                spreadsheetId: SPREADSHEET_ID,
                range: `${SHEET_NAME}!A${incidentMap[incident]}`,
                valueInputOption: 'RAW',
                requestBody: { values }
            });
            updated++;
        } else {
            await sheets.spreadsheets.values.append({
                spreadsheetId: SPREADSHEET_ID,
                range: `${SHEET_NAME}!A:HZ`,
                valueInputOption: 'RAW',
                requestBody: { values }
            });
            inserted++;
        }
    }

    await connection.end();

    return { updated, inserted };
}

module.exports = { syncData };
