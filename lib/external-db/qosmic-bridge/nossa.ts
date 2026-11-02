// ==========================================
// QOSMIC Bridge — fungsi level tinggi utk nossa & nossa_closed
// ==========================================

import { qosmicBridgeGet, QosmicBridgeError, RATE_LIMIT_KEY_BACKFILL } from './client';
import { QosmicQueryResponse, QosmicRawRow, QosmicResource } from './types';
import {
  DateWindow,
  NOSSA_CLOSED_MAX_OFFSET,
  bisectWindow,
  isOverflowSignal,
  splitIntoInitialWindows,
} from './window-planner';
import { logger } from '@/lib/observability/logger';

const DEFAULT_PAGE_SIZE = 1000; // hard cap API

export interface ListQueryParams {
  status?: string;
  dateFrom?: string; // YYYY-MM-DD, dipetakan ke date_from
  dateTo?: string; // YYYY-MM-DD, dipetakan ke date_to
  limit?: number;
}

function resourcePath(resource: QosmicResource): string {
  return resource === 'nossa' ? '/nossa' : '/nossa-closed';
}

async function listPage<T = QosmicRawRow>(
  resource: QosmicResource,
  params: ListQueryParams & { offset: number },
  label: string,
  rateLimitKey?: string,
): Promise<QosmicQueryResponse<T>> {
  const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, DEFAULT_PAGE_SIZE);
  return qosmicBridgeGet<QosmicQueryResponse<T>>(resourcePath(resource), {
    label,
    query: {
      status: params.status,
      date_from: params.dateFrom,
      date_to: params.dateTo,
      limit,
      offset: params.offset,
    },
    rateLimitKey,
  });
}

/**
 * Cari SATU incident persis, di nossa ATAU nossa_closed. Tidak terkena batas
 * window tanggal (sesuai docs: "cari via incident, tanpa batas rentang").
 * Dipakai utk status-refresh/active-refresh (pengganti `WHERE incident IN (...)`
 * — tapi sekarang HARUS satu-per-satu, lihat catatan rate limit di client.ts)
 * dan utk fitur pencarian tiket real-time di UI.
 */
export async function fetchByIncident<T = QosmicRawRow>(
  resource: QosmicResource,
  incident: string,
): Promise<T | null> {
  try {
    const res = await qosmicBridgeGet<QosmicQueryResponse<T>>(
      resourcePath(resource),
      {
        label: `${resource}.by_incident`,
        query: { incident },
      },
    );
    return res.data[0] ?? null;
  } catch (error) {
    if (error instanceof QosmicBridgeError && error.status === 422) {
      // format incident tidak valid (bukan "tidak ditemukan") — beda kasus,
      // biar caller yang putuskan mau treat sbg not-found atau error validasi.
      logger.warn('[QosmicBridge] Format incident ditolak (422)', {
        resource,
        incident,
      });
    }
    throw error;
  }
}

/**
 * Cari 1 incident, coba nossa (open) dulu, fallback ke nossa_closed kalau
 * tidak ketemu. Berguna utk lookup UI dimana caller tidak tahu status tiket.
 * Menghabiskan MAKS 2 request dari budget 20/menit per pencarian.
 */
export async function fetchByIncidentAnyStatus<T = QosmicRawRow>(
  incident: string,
): Promise<{ row: T; resource: QosmicResource } | null> {
  const openRow = await fetchByIncident<T>('nossa', incident);
  if (openRow) return { row: openRow, resource: 'nossa' };

  const closedRow = await fetchByIncident<T>('nossa_closed', incident);
  if (closedRow) return { row: closedRow, resource: 'nossa_closed' };

  return null;
}

async function* iterateNossaOpenByStatus<T = QosmicRawRow>(
  status: string | undefined,
  params: ListQueryParams,
  seen: Set<string> = new Set(),
): AsyncGenerator<T[], void, void> {
  const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, DEFAULT_PAGE_SIZE);
  let offset = 0;
  const buffer: T[][] = [];
  const uniqueRows = (rows: T[]) => rows.filter(row => {
    const raw = row as QosmicRawRow;
    const key = String(raw.Incident ?? raw.incident ?? JSON.stringify(raw));
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  while (offset <= NOSSA_CLOSED_MAX_OFFSET) {
    const res = await listPage<T>(
      'nossa',
      { ...params, status, limit, offset },
      'nossa.list_by_status',
    );
    if (res.data.length === 0) break;
    buffer.push(res.data);

    if (res.data.length < limit) break;

    const nextOffset = offset + limit;
    if (nextOffset > NOSSA_CLOSED_MAX_OFFSET) {
      if (params.dateFrom && params.dateTo) {
        const halves = bisectWindow({ dateFrom: params.dateFrom, dateTo: params.dateTo });
        if (!halves) throw new Error('Nossa open coverage incomplete: window overflow, data terpotong.');
        for (const window of halves) {
          yield* iterateNossaOpenByStatus<T>(status, { ...params, ...window }, seen);
        }
      } else {
        for (const rows of buffer) {
          const unique = uniqueRows(rows);
          if (unique.length) yield unique;
        }
        const tomorrow = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(Date.now() + 86400000));
        for (const window of splitIntoInitialWindows(params.dateFrom ?? '2026-01-01', params.dateTo ?? tomorrow, 31)) {
          yield* iterateNossaOpenByStatus<T>(status, { ...params, ...window }, seen);
        }
      }
      return;
    }
    offset = nextOffset;
  }
  for (const rows of buffer) {
    const unique = uniqueRows(rows);
    if (unique.length) yield unique;
  }
}

/**
 * Status tidak dibatasi whitelist. Scan yang melewati batas offset dipecah
 * per tanggal; incident dideduplikasi, termasuk sampel lama dari scan awal.
 */
export async function* iterateNossaOpen<T = QosmicRawRow>(
  params: ListQueryParams = {},
): AsyncGenerator<T[], void, void> {
  yield* iterateNossaOpenByStatus<T>(params.status, params);
}

/**
 * Iterasi nossa_closed dalam SATU window tanggal. Meng-handle overflow
 * (window ternyata > 5.000 baris) dengan cara: buffer semua halaman window
 * ini dulu, dan HANYA di-yield kalau window ini tidak overflow. Kalau
 * overflow terdeteksi, buffer dibuang (tidak di-yield sama sekali) dan
 * window di-bisect lalu di-retry secara rekursif — supaya tidak ada baris
 * yang ke-yield dua kali.
 *
 * Ini query LIVE ke Metabase (menurut docs) — setiap panggilan memakan
 * budget rate-limit 20/menit yang dipakai bersama semua konsumen lain.
 */
export async function* iterateNossaClosedWindow<T = QosmicRawRow>(
  window: DateWindow,
  params: Omit<ListQueryParams, 'dateFrom' | 'dateTo'> = {},
  rateLimitKey?: string,
): AsyncGenerator<T[], void, void> {
  const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, DEFAULT_PAGE_SIZE);
  const buffer: T[][] = [];
  let offset = 0;
  let overflowed = false;

  while (true) {
    const res = await listPage<T>(
      'nossa_closed',
      {
        ...params,
        dateFrom: window.dateFrom,
        dateTo: window.dateTo,
        limit,
        offset,
      },
      'nossa_closed.window',
      rateLimitKey,
    );

    if (res.data.length === 0) break;
    buffer.push(res.data);

    const nextOffset = offset + limit;

    if (isOverflowSignal(res.data.length, limit, nextOffset)) {
      overflowed = true;
      break;
    }

    if (res.data.length < limit) break; // halaman terakhir, tidak overflow
    offset = nextOffset;
  }

  if (!overflowed) {
    for (const page of buffer) yield page;
    return;
  }

  // Overflow: buang buffer (JANGAN di-yield, mencegah duplikat), bisect, retry.
  const halves = bisectWindow(window);
  if (!halves) {
    throw new Error(`Nossa closed coverage incomplete: window overflow, data terpotong (${window.dateFrom} - ${window.dateTo}).`);
  }

  logger.info(
    '[QosmicBridge] Window nossa_closed overflow (>5.000 baris), di-split jadi 2',
    {
      window,
      halves,
    },
  );
  for (const half of halves) {
    yield* iterateNossaClosedWindow<T>(half, params, rateLimitKey);
  }
}

/**
 * Sinkronisasi incremental nossa_closed — dipakai worker ingestion tiap
 * `INGESTION_INTERVAL_MINUTES`. Window kecil (default kemarin s/d besok)
 * supaya jauh di bawah cap 5.000 baris & 31 hari.
 */
export async function* iterateNossaClosedIncremental<T = QosmicRawRow>(
  daysBack: number = 1,
  params: Omit<ListQueryParams, 'dateFrom' | 'dateTo'> = {},
): AsyncGenerator<T[], void, void> {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const from = new Date(`${today}T00:00:00Z`);
  const to = new Date(from);
  to.setUTCDate(to.getUTCDate() + 1);
  from.setUTCDate(from.getUTCDate() - daysBack);
  const dateTo = to.toISOString().slice(0, 10);
  const dateFrom = from.toISOString().slice(0, 10);

  yield* iterateNossaClosedWindow<T>({ dateFrom, dateTo }, params);
}

/**
 * Backfill historis penuh (one-off script, BUKAN untuk dipanggil worker
 * interval-menit). Dari `fromDate` (di-clamp otomatis oleh API ke
 * 2026-01-01 kalau lebih awal) s/d `toDate`.
 * Menggunakan budget rate-limit terpisah (6 req/min) agar tidak mengganggu
 * ingestion dan status refresh yang berjalan di process yang sama.
 */
export async function* iterateNossaClosedBackfill<T = QosmicRawRow>(
  fromDate: string,
  toDate: string,
  params: Omit<ListQueryParams, 'dateFrom' | 'dateTo'> = {},
  maxWindowDays?: number,
): AsyncGenerator<{ window: DateWindow; rows: T[] }, void, void> {
  const windows = splitIntoInitialWindows(fromDate, toDate, maxWindowDays);
  logger.info('[QosmicBridge] Backfill nossa_closed dimulai', {
    fromDate,
    toDate,
    totalWindows: windows.length,
  });

  for (const window of windows) {
    for await (const rows of iterateNossaClosedWindow<T>(window, params, RATE_LIMIT_KEY_BACKFILL)) {
      yield { window, rows };
    }
  }
}


