const sheets = require('../config/google');
const { getConnection } = require('../config/db');

const SHEET_NAME = 'Rekap_WO_Hi';
const RANGE = 'Rekap_WO_Hi!A2:HZ'; // mulai dari row 2 (header aman)

function mapRow(row) {
    return [
        row.INCIDENT ?? '',
        row.SERVICE_TYPE ?? '',
        row.WORKZONE ?? '',
        row.STATUS ?? '',
        row.PIC ?? '',
        row.CREATED_AT ?? ''
    ];
}

async function pushAllData() {
    console.log("🚀 Push dijalankan...");

    const connection = await getConnection();
    const SPREADSHEET_ID = process.env.SPREADSHEET_ID;

    try {
        // 1️⃣ Ambil semua data dari DB
        const [rows] = await connection.query("SELECT * FROM ticket");
        console.log("Jumlah data dari DB:", rows.length);

        if (rows.length === 0) {
            return 0;
        }

        // 2️⃣ Mapping semua data sekaligus
        const values = rows.map(row => mapRow(row));

        // 3️⃣ Clear data lama (optional)
        await sheets.spreadsheets.values.clear({
            spreadsheetId: SPREADSHEET_ID,
            range: RANGE
        });

        // 4️⃣ Push batch update
        await sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,
            range: `${SHEET_NAME}!A2`,
            valueInputOption: 'RAW',
            requestBody: { values }
        });

        console.log("✅ Push berhasil");
        return rows.length;

    } catch (error) {
        console.error("❌ Error push:", error);
        throw error;
    } finally {
        await connection.end();
    }
}


module.exports = { pushAllData };
