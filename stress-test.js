/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║   DOMPIS TICKET SYSTEM — K6 STRESS TEST v4.0                    ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * CARA PAKAI — gunakan --env SCENARIO= (bukan --scenario):
 *
 *   # Smoke (2 VU x 2 menit — validasi dasar):
 *   k6 run stress-test.js \
 *     --env BASE_URL=http://localhost:3000 \
 *     --env ADMIN_USER=18920181 \
 *     --env ADMIN_PASS=18920181 \
 *     --env TEKNISI_USER=20850078 \
 *     --env TEKNISI_PASS=20850078 \
 *     --env SCENARIO=smoke
 *
 *   # Ramp to peak (0->200 VU, ~25 menit):
 *   k6 run stress-test.js ... --env SCENARIO=ramp_to_peak
 *
 *   # Spike (mendadak 200 VU, ~6 menit):
 *   k6 run stress-test.js ... --env SCENARIO=spike
 *
 *   # Soak (50 VU x 30 menit — deteksi memory leak):
 *   k6 run stress-test.js ... --env SCENARIO=soak
 *
 *   # Semua skenario sekaligus:
 *   k6 run stress-test.js ... --env SCENARIO=all
 *
 *   # Dengan ticket ID untuk test pickup (opsional):
 *   k6 run stress-test.js ... --env SCENARIO=smoke --env TICKET_ID=1234
 *
 *   # Debug — tampilkan response error:
 *   k6 run stress-test.js ... --env SCENARIO=smoke --env DEBUG=true
 *
 * NILAI SCENARIO yang valid: smoke | ramp_to_peak | spike | soak | all
 */

import http from 'k6/http';
import { check, group, sleep, fail } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
import exec from 'k6/execution';

// ════════════════════════════════════════════════════════════
// CONFIG
// ════════════════════════════════════════════════════════════

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const ADMIN_USER = __ENV.ADMIN_USER || 'admin';
const ADMIN_PASS = __ENV.ADMIN_PASS || 'admin123';
const TEKNISI_USER = __ENV.TEKNISI_USER || 'teknisi';
const TEKNISI_PASS = __ENV.TEKNISI_PASS || 'teknisi123';
const HELPDESK_USER = __ENV.HELPDESK_USER || ADMIN_USER;
const HELPDESK_PASS = __ENV.HELPDESK_PASS || ADMIN_PASS;
const FIXTURE_TICKET_ID = Number(__ENV.TICKET_ID || '0');
const DEBUG = __ENV.DEBUG === 'true';
const SCENARIO = __ENV.SCENARIO || 'all';
// Token reuse: simpan token per-VU, login ulang hanya jika expired
// Aktifkan dengan --env REUSE_TOKEN=true (lebih realistis, kurangi beban login)
const REUSE_TOKEN = __ENV.REUSE_TOKEN === 'true';

// ════════════════════════════════════════════════════════════
// VU-LEVEL TOKEN CACHE — reuse JWT, login ulang hanya jika expired
// ════════════════════════════════════════════════════════════

let _vuToken = null;
let _vuTokenExpiry = 0;

function getToken(creds) {
  if (!REUSE_TOKEN) return apiLogin(creds);
  const now = Date.now();
  if (_vuToken && now < _vuTokenExpiry) return _vuToken; // reuse
  _vuToken = apiLogin(creds);
  _vuTokenExpiry = now + 50 * 60 * 1000; // 50 menit (JWT expire 1 jam)
  return _vuToken;
}

// ════════════════════════════════════════════════════════════
// SCENARIO DEFINITIONS — difilter berdasarkan --env SCENARIO
// ════════════════════════════════════════════════════════════

const ALL_SCENARIOS = {
  smoke: {
    executor: 'constant-vus',
    vus: 2,
    duration: '2m',
    tags: { scenario: 'smoke' },
    exec: 'scenarioSmoke',
  },

  ramp_to_peak: {
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [
      { duration: '2m', target: 20 },
      { duration: '3m', target: 80 },
      { duration: '5m', target: 200 },
      { duration: '10m', target: 200 },
      { duration: '3m', target: 50 },
      { duration: '2m', target: 0 },
    ],
    tags: { scenario: 'ramp_to_peak' },
    exec: 'scenarioMixed',
  },

  spike: {
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [
      { duration: '30s', target: 0 },
      { duration: '30s', target: 200 },
      { duration: '3m', target: 200 },
      { duration: '30s', target: 0 },
      { duration: '1m', target: 0 },
    ],
    tags: { scenario: 'spike' },
    exec: 'scenarioReadHeavy',
  },

  soak: {
    executor: 'constant-vus',
    vus: 50,
    duration: '30m',
    tags: { scenario: 'soak' },
    exec: 'scenarioSoak',
  },
};

// Pilih skenario berdasarkan env var SCENARIO
function buildScenarios() {
  if (SCENARIO === 'all') return ALL_SCENARIOS;
  if (ALL_SCENARIOS[SCENARIO]) return { [SCENARIO]: ALL_SCENARIOS[SCENARIO] };
  // Fallback: smoke
  console.warn(`[WARN] SCENARIO="${SCENARIO}" tidak dikenal — jalankan smoke`);
  return { smoke: ALL_SCENARIOS.smoke };
}

// ════════════════════════════════════════════════════════════
// CUSTOM METRICS
// ════════════════════════════════════════════════════════════

const loginSuccessRate = new Rate('custom_login_success');
const cacheHitRate = new Rate('custom_cache_hit');
const writeOkRate = new Rate('custom_write_success');
const errors5xx = new Counter('custom_5xx_errors');
const authErrors = new Counter('custom_auth_errors');

const durLogin = new Trend('dur_login', true);
const durTickets = new Trend('dur_tickets_list', true);
const durDaily = new Trend('dur_daily_tickets', true);
const durStats = new Trend('dur_stats', true);
const durPickup = new Trend('dur_pickup', true);
const durSearch = new Trend('dur_search', true);

// ════════════════════════════════════════════════════════════
// OPTIONS — scenarios dipilih dinamis
// ════════════════════════════════════════════════════════════

export const options = {
  scenarios: buildScenarios(),

  thresholds: {
    http_req_failed: ['rate<0.02'],
    http_req_duration: ['p(95)<3000'],
    dur_login: ['p(95)<2000'],
    dur_tickets_list: ['p(95)<1000'],
    dur_daily_tickets: ['p(95)<1200'],
    dur_stats: ['p(95)<1000'],
    dur_pickup: ['p(95)<3000'],
    custom_login_success: ['rate>0.95'],
    custom_cache_hit: ['rate>0.40'],
    custom_write_success: ['rate>0.90'],
    custom_5xx_errors: ['count<200'],
  },
};

// ════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════

function pickCredentials() {
  const n = exec.vu.idInTest % 10;
  if (n < 6)
    return { username: ADMIN_USER, password: ADMIN_PASS, role: 'admin' };
  if (n < 9)
    return { username: TEKNISI_USER, password: TEKNISI_PASS, role: 'teknisi' };
  return { username: HELPDESK_USER, password: HELPDESK_PASS, role: 'helpdesk' };
}

function bearerOpts(token) {
  return {
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: 'Bearer ' + token,
    },
  };
}

function trackCache(body) {
  try {
    cacheHitRate.add(JSON.parse(body).cached === true ? 1 : 0);
  } catch {
    cacheHitRate.add(0);
  }
}

function think(min, max) {
  min = min || 0.8;
  max = max || 2.5;
  sleep(Math.random() * (max - min) + min);
}

function micro() {
  sleep(Math.random() * 0.3 + 0.1);
}

// ════════════════════════════════════════════════════════════
// API LAYER
// ════════════════════════════════════════════════════════════

function apiLogin(creds) {
  const t0 = Date.now();
  const res = http.post(
    BASE_URL + '/api/auth/login',
    JSON.stringify({ username: creds.username, password: creds.password }),
    {
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      tags: { name: 'POST /auth/login' },
      timeout: '15s',
    },
  );
  durLogin.add(Date.now() - t0);

  if (DEBUG && res.status !== 200) {
    console.log(
      '[DEBUG] Login FAIL | user=' +
        creds.username +
        ' status=' +
        res.status +
        ' | ' +
        (res.body || '').substring(0, 200),
    );
  }

  let token = null;
  let tokenOk = false;
  try {
    const body = JSON.parse(res.body);
    token = body.accessToken || null;
    tokenOk = typeof token === 'string' && token.length > 0;
  } catch (e) {}

  const ok = check(res, {
    'login: HTTP 200': function (r) {
      return r.status === 200;
    },
    'login: accessToken': function () {
      return tokenOk;
    },
  });

  loginSuccessRate.add(ok && tokenOk ? 1 : 0);
  if (res.status === 401 || res.status === 403) authErrors.add(1);
  if (res.status >= 500) errors5xx.add(1);

  return ok && tokenOk ? token : null;
}

function apiHealth() {
  const res = http.get(BASE_URL + '/api/health', {
    tags: { name: 'GET /health' },
    timeout: '10s',
  });
  check(res, {
    'health: 200': function (r) {
      return r.status === 200;
    },
    'health: db connected': function (r) {
      try {
        return JSON.parse(r.body).services.database === 'connected';
      } catch (e) {
        return false;
      }
    },
  });
  if (res.status >= 500) errors5xx.add(1);
  return res;
}

function apiGetMe(token) {
  const res = http.get(BASE_URL + '/api/users/me', {
    headers: bearerOpts(token).headers,
    tags: { name: 'GET /users/me' },
  });
  check(res, {
    'me: 200': function (r) {
      return r.status === 200;
    },
  });
  if (res.status >= 500) errors5xx.add(1);
  if (res.status === 401) authErrors.add(1);
  return res;
}

function apiGetTickets(token, qs) {
  qs = qs || '';
  const t0 = Date.now();
  const res = http.get(BASE_URL + '/api/tickets?limit=50' + qs, {
    headers: bearerOpts(token).headers,
    tags: { name: 'GET /tickets' },
  });
  durTickets.add(Date.now() - t0);
  trackCache(res.body);
  check(res, {
    'tickets: 200': function (r) {
      return r.status === 200;
    },
  });
  if (res.status >= 500) errors5xx.add(1);
  if (res.status === 401) authErrors.add(1);
  return res;
}

function apiGetDailyTickets(token, qs) {
  qs = qs || '';
  const t0 = Date.now();
  const res = http.get(BASE_URL + '/api/tickets/daily?limit=50' + qs, {
    headers: bearerOpts(token).headers,
    tags: { name: 'GET /tickets/daily' },
  });
  durDaily.add(Date.now() - t0);
  trackCache(res.body);
  check(res, {
    'daily: 200': function (r) {
      return r.status === 200;
    },
  });
  if (res.status >= 500) errors5xx.add(1);
  return res;
}

function apiGetStats(token) {
  const t0 = Date.now();
  const res = http.get(BASE_URL + '/api/tickets/stats', {
    headers: bearerOpts(token).headers,
    tags: { name: 'GET /tickets/stats' },
  });
  durStats.add(Date.now() - t0);
  trackCache(res.body);
  check(res, {
    'stats: not 5xx': function (r) {
      return r.status < 500;
    },
  });
  if (res.status >= 500) errors5xx.add(1);
  return res;
}

function apiSearch(token, q) {
  const t0 = Date.now();
  const res = http.get(
    BASE_URL +
      '/api/tickets/search?q=' +
      encodeURIComponent(q) +
      '&type=incident',
    {
      headers: bearerOpts(token).headers,
      tags: { name: 'GET /tickets/search' },
    },
  );
  durSearch.add(Date.now() - t0);
  check(res, {
    'search: not 5xx': function (r) {
      return r.status < 500;
    },
  });
  if (res.status >= 500) errors5xx.add(1);
  return res;
}

function apiPickup(token, ticketId) {
  if (!ticketId || ticketId <= 0) return null;
  const t0 = Date.now();
  const res = http.post(
    BASE_URL + '/api/tickets/pickup',
    JSON.stringify({ ticketId: ticketId }),
    {
      headers: bearerOpts(token).headers,
      tags: { name: 'POST /tickets/pickup' },
      timeout: '20s',
    },
  );
  durPickup.add(Date.now() - t0);
  // 200=berhasil, 400=sudah diambil, 409=Redis lock — semua valid
  const ok = res.status === 200 || res.status === 400 || res.status === 409;
  writeOkRate.add(ok ? 1 : 0);
  if (res.status >= 500) errors5xx.add(1);
  if (DEBUG) {
    console.log(
      '[DEBUG] pickup id=' +
        ticketId +
        ' -> ' +
        res.status +
        ' | ' +
        (res.body || '').substring(0, 100),
    );
  }
  return res;
}

// ════════════════════════════════════════════════════════════
// SCENARIO FUNCTIONS
// ════════════════════════════════════════════════════════════

export function scenarioSmoke() {
  const creds = pickCredentials();
  group('smoke', function () {
    apiHealth();
    micro();
    const token = getToken(creds);
    if (!token) {
      think(1, 2);
      return;
    }
    micro();
    apiGetMe(token);
    micro();
    apiGetTickets(token);
    micro();
    apiGetDailyTickets(token);
    micro();
    apiGetTickets(token); // 2nd call -> harus hit Redis cache
    micro();
    apiGetStats(token);
  });
  think(1, 2);
}

export function scenarioReadHeavy() {
  const creds = pickCredentials();
  const token = getToken(creds);
  if (!token) {
    think(2, 4);
    return;
  }
  micro();
  group('read: dashboard', function () {
    apiGetStats(token);
    micro();
    apiGetTickets(token);
    micro();
    apiGetTickets(token); // cache hit
  });
  think();
  group('read: daily board', function () {
    apiGetDailyTickets(token);
    micro();
    apiGetDailyTickets(token); // cache hit
  });
  think();
  if (Math.random() < 0.5) {
    var statuses = ['open', 'assigned', 'on_progress', 'pending'];
    var s = statuses[Math.floor(Math.random() * statuses.length)];
    apiGetTickets(token, '&statusUpdate=' + s);
  }
  if (Math.random() < 0.25) {
    var queries = ['INC4', 'LOS', 'GANGGUAN', 'SQM'];
    var q = queries[Math.floor(Math.random() * queries.length)];
    apiSearch(token, q);
  }
  think();
}

export function scenarioMixed() {
  const creds = pickCredentials();
  const token = getToken(creds);
  if (!token) {
    think(2, 4);
    return;
  }
  micro();
  if (creds.role === 'teknisi') {
    group('teknisi: workflow', function () {
      apiGetTickets(token, '&statusUpdate=assigned&limit=20');
      think(0.5, 1.5);
      apiGetDailyTickets(token);
      think(0.5, 1.5);
      if (FIXTURE_TICKET_ID > 0) {
        apiPickup(token, FIXTURE_TICKET_ID);
        micro();
      }
      apiGetTickets(token, '&statusUpdate=on_progress&limit=20');
    });
  } else if (creds.role === 'admin') {
    group('admin: monitoring', function () {
      apiGetStats(token);
      think(0.5, 1);
      apiGetTickets(token, '&statusUpdate=open&limit=50');
      think(0.5, 1);
      apiGetTickets(token, '&statusUpdate=assigned&limit=50');
      think(0.5, 1);
      apiGetTickets(token); // cache hit
    });
  } else {
    group('helpdesk: daily ops', function () {
      apiGetDailyTickets(token, '&limit=100');
      think(0.5, 1.5);
      apiSearch(token, 'INC4');
      micro();
      apiGetDailyTickets(token); // cache hit
    });
  }
  think();
}

export function scenarioSoak() {
  const creds = pickCredentials();
  const token = getToken(creds);
  if (!token) {
    sleep(15);
    return;
  }
  const iters = Math.floor(Math.random() * 4) + 3;
  for (var i = 0; i < iters; i++) {
    group('soak iter ' + (i + 1), function () {
      apiGetTickets(token);
      sleep(0.3);
      apiGetDailyTickets(token);
      sleep(0.3);
      if (i % 4 === 0) apiHealth();
    });
    sleep(Math.random() * 12 + 8);
  }
}

export default function () {
  scenarioMixed();
}

// ════════════════════════════════════════════════════════════
// SETUP — validasi credentials SEBELUM test dimulai
// ════════════════════════════════════════════════════════════

export function setup() {
  console.log('\n' + '='.repeat(62));
  console.log('  DOMPIS STRESS TEST v4.0');
  console.log('  URL      : ' + BASE_URL);
  console.log('  Scenario : ' + SCENARIO);
  console.log('  Admin    : ' + ADMIN_USER);
  console.log('  Teknisi  : ' + TEKNISI_USER);
  console.log(
    '  Ticket   : ' +
      (FIXTURE_TICKET_ID > 0 ? FIXTURE_TICKET_ID : '(skip pickup)'),
  );
  console.log('='.repeat(62));

  // 1. Health check
  const healthRes = http.get(BASE_URL + '/api/health', { timeout: '10s' });
  if (healthRes.status !== 200) {
    fail(
      '[SETUP] Server tidak bisa dijangkau HTTP ' +
        healthRes.status +
        ' — Pastikan BASE_URL benar: ' +
        BASE_URL,
    );
  }
  try {
    const h = JSON.parse(healthRes.body);
    console.log('  DB     : ' + h.services.database);
    console.log('  Redis  : ' + h.services.redis);
    console.log('  Ping   : ' + h.responseTime);
    if (h.services.database !== 'connected') {
      fail('[SETUP] Database tidak connected — batalkan test');
    }
  } catch (e) {
    fail('[SETUP] Gagal parse health response: ' + e);
  }

  // 2. Validasi login admin
  console.log('\n  Cek login ' + ADMIN_USER + '...');
  const loginRes = http.post(
    BASE_URL + '/api/auth/login',
    JSON.stringify({ username: ADMIN_USER, password: ADMIN_PASS }),
    { headers: { 'Content-Type': 'application/json' }, timeout: '15s' },
  );
  if (loginRes.status !== 200) {
    fail(
      '[SETUP] Login GAGAL: HTTP ' +
        loginRes.status +
        '\n' +
        '  User   : ' +
        ADMIN_USER +
        '\n' +
        '  Respon : ' +
        (loginRes.body || '').substring(0, 300) +
        '\n\n' +
        '  Solusi : k6 run stress-test.js --env ADMIN_USER=xxx --env ADMIN_PASS=yyy',
    );
  }
  let adminToken;
  try {
    adminToken = JSON.parse(loginRes.body).accessToken;
  } catch (e) {
    fail('[SETUP] Gagal parse login response: ' + e);
  }
  if (!adminToken)
    fail('[SETUP] accessToken tidak ditemukan di response login');
  console.log('  OK: Login admin berhasil');

  // 3. Validasi GET /api/tickets
  const ticketsRes = http.get(BASE_URL + '/api/tickets?limit=1', {
    headers: {
      Authorization: 'Bearer ' + adminToken,
      Accept: 'application/json',
    },
    timeout: '15s',
  });
  if (ticketsRes.status !== 200) {
    fail(
      '[SETUP] GET /api/tickets gagal: HTTP ' +
        ticketsRes.status +
        ' — ' +
        (ticketsRes.body || '').substring(0, 200),
    );
  }
  console.log('  OK: GET /api/tickets berhasil');
  console.log(
    '\n  SEMUA VALIDASI PASS — memulai test\n' + '='.repeat(62) + '\n',
  );

  return { adminToken: adminToken };
}

export function teardown() {
  console.log('\n' + '='.repeat(62));
  console.log('  TEST SELESAI — Panduan membaca hasil:');
  console.log(
    '  custom_login_success < 95%  -> credential salah / server overload',
  );
  console.log('  dur_tickets_list p95 > 1s   -> Redis tidak efektif');
  console.log('  custom_5xx_errors > 100     -> server perlu di-scale');
  console.log('  custom_cache_hit < 40%      -> Redis miss tinggi (cek TTL)');
  console.log('='.repeat(62) + '\n');
}
