// ==========================================
// Window planner — nossa_closed backfill
// ==========================================
// Bridge tidak punya keyset cursor (beda total dari MySQL langsung). Untuk
// nossa_closed, satu-satunya cara scan tanpa `incident` adalah date_from/date_to
// (maks 31 hari) DAN offset paging di dalam window itu maks 5.000 baris.
//
// Kalau sebuah window > ~5.000 baris, window itu HARUS dipecah lebih kecil
// (bukan menaikkan offset) — sesuai instruksi eksplisit di dokumentasi bridge:
// "Persempit filter alih-alih menaikkan offset terus".
//
// API mendukung format `YYYY-MM-DD HH:mm:ss` untuk date_from/date_to (level
// detik), sehingga window 1 hari yang masih overflow bisa dipecah lebih kecil
// hingga tingkat detik saat satu jam pun melebihi kapasitas pagination.
//
// Strategi: date-window splitting rekursif berbasis actual row count (probe
// dengan limit kecil dulu), bukan asumsi distribusi tiket rata.

import { logger } from '@/lib/observability/logger';

export const NOSSA_CLOSED_MAX_WINDOW_DAYS = 7; // default aman; hard cap API = 31 hari
export const NOSSA_CLOSED_MAX_OFFSET = 5_000;
export const NOSSA_CLOSED_PAGE_SIZE = 1_000; // limit maks per hit
export const NOSSA_CLOSED_MIN_WINDOW_SECONDS = 1;

export interface DateWindow {
  dateFrom: string; // 'YYYY-MM-DD' or 'YYYY-MM-DD HH:mm:ss'
  dateTo: string; // exclusive, 'YYYY-MM-DD' or 'YYYY-MM-DD HH:mm:ss'
}

function normalizeToDateTime(dateStr: string): string {
  if (dateStr.includes(' ')) return dateStr;
  return dateStr + ' 00:00:00';
}

function toDateTimeStr(d: Date): string {
  const iso = d.toISOString();
  return iso.slice(0, 10) + ' ' + iso.slice(11, 19);
}

function parseDateTime(dateTimeStr: string): Date {
  const normalized = normalizeToDateTime(dateTimeStr);
  return new Date(normalized + 'Z');
}

/**
 * Memecah [dateFrom, dateTo) menjadi window-window awal berukuran maks
 * `maxWindowDays` hari (default 7 — jauh di bawah cap 31 hari API supaya
 * probabilitas satu window > 5.000 baris kecil, mengurangi kebutuhan split
 * rekursif saat backfill volume tinggi seperti nossa_closed ~3,4 juta baris
 * total sejak 2026-01-01).
 */
export function splitIntoInitialWindows(
  dateFrom: string,
  dateTo: string,
  maxWindowDays: number = NOSSA_CLOSED_MAX_WINDOW_DAYS,
): DateWindow[] {
  const from = parseDateTime(dateFrom).getTime();
  const to = parseDateTime(dateTo).getTime();
  const spanSeconds = Math.floor(Math.min(maxWindowDays, 31) * 86_400);
  if (!Number.isFinite(from) || !Number.isFinite(to) || !Number.isFinite(spanSeconds) || spanSeconds < 1) {
    throw new RangeError('Invalid date window or window size.');
  }
  const windows: DateWindow[] = [];
  let cursor = from;
  while (cursor < to) {
    const end = Math.min(cursor + spanSeconds * 1000, to);
    windows.push({ dateFrom: toDateTimeStr(new Date(cursor)), dateTo: toDateTimeStr(new Date(end)) });
    cursor = end;
  }
  return windows;
}

/**
 * Membagi dua sebuah window (dipakai saat probe count menunjukkan window
 * masih > kapasitas offset). Satu detik adalah batas presisi API;
 * caller harus menolak overflow yang tidak dapat dipecah lagi.
 *
 * API mendukung format `YYYY-MM-DD HH:mm:ss` untuk date_from/date_to, sehingga
 * window dapat dipecah tanpa membuang sisa menit atau detik.
 */
export function bisectWindow(
  window: DateWindow,
): [DateWindow, DateWindow] | null {
  const from = parseDateTime(window.dateFrom).getTime();
  const to = parseDateTime(window.dateTo).getTime();
  const totalSeconds = Math.floor((to - from) / 1000);
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) throw new RangeError('Invalid date window.');
  if (totalSeconds <= NOSSA_CLOSED_MIN_WINDOW_SECONDS) {
    logger.warn('[QosmicBridge] Window sudah 1 detik, tidak bisa dipecah lagi', {
      window,
    });
    return null;
  }
  const mid = toDateTimeStr(new Date(from + Math.floor(totalSeconds / 2) * 1000));
  return [
    { dateFrom: window.dateFrom, dateTo: mid },
    { dateFrom: mid, dateTo: window.dateTo },
  ];
}

/**
 * PENTING (setelah OpenAPI dikonfirmasi): API bridge TIDAK mengembalikan
 * total count keseluruhan (hanya `meta.count` = jumlah baris di response
 * itu sendiri). Jadi kita tidak bisa "probe" total baris sebuah window
 * dengan murah — satu-satunya sinyal overflow adalah: halaman terakhir yang
 * masih penuh (`data.length === limit`) padahal offset berikutnya akan
 * melebihi `NOSSA_CLOSED_MAX_OFFSET`.
 *
 * Konsekuensi desain (lihat nossa.ts/iterateNossaClosedWindow): halaman-halaman
 * sebuah window HARUS di-buffer dulu (maks 6 halaman x 1.000 baris) sebelum
 * di-"commit" ke caller, supaya kalau window ternyata overflow, kita bisa
 * buang buffer itu dan bisect ulang dari nol TANPA baris duplikat ter-yield.
 */
export function isOverflowSignal(
  pageRowCount: number,
  limit: number,
  nextOffset: number,
): boolean {
  return pageRowCount === limit && nextOffset > NOSSA_CLOSED_MAX_OFFSET;
}
