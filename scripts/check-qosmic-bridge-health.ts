import 'dotenv/config';

async function main() {
  const base = process.env.QOSMIC_BRIDGE_BASE_URL ?? 'https://qosmic.solusee.id/api/metabase-bridge';
  const token = process.env.QOSMIC_BRIDGE_TOKEN ?? '';
  if (!token) {
    console.log('QOSMIC_BRIDGE_TOKEN kosong — set di .env');
    process.exit(1);
  }
  const url = `${base.replace(/\/$/, '')}/nossa?incident=INC00000000&limit=1`;
  console.log(`[Check] GET ${url}`);
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10000),
    });
    console.log(`[Check] HTTP ${res.status} ${res.statusText}`);
    const text = await res.text();
    console.log(`[Check] Body (first 500): ${text.slice(0, 500)}`);
    if (res.status === 200) {
      console.log('[Check] ✅ Endpoint UP — bisa enable BRIDGE_JOB_INGESTION_ENABLED=true dan reload');
    } else if (res.status === 401 || res.status === 403) {
      console.log('[Check] ⚠️  Auth gagal — cek TOKEN');
    } else if (res.status >= 500) {
      console.log('[Check] ❌ Endpoint masih DOWN (5xx) — tetap freeze');
    } else {
      console.log('[Check] ? status tidak dikenal — cek manual');
    }
  } catch (e) {
    console.log(`[Check] ❌ DOWN / timeout: ${String(e)}`);
    console.log('[Check] Tetap freeze BRIDGE_JOB_INGESTION_ENABLED=false');
  }
}
main();
