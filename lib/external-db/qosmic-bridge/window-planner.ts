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
// (12 jam → 6 jam → 3 jam → 1 jam).
//
// Strategi: date-window splitting rekursif berbasis actual row count (probe
// dengan limit kecil dulu), bukan asumsi distribusi tiket rata.

import { logger } from '@/lib/observability/logger';

export const NOSSA_CLOSED_MAX_WINDOW_DAYS = 7; // default aman; hard cap API = 31 hari
export const NOSSA_CLOSED_MAX_OFFSET = 5_000;
export const NOSSA_CLOSED_PAGE_SIZE = 1_000; // limit maks per hit
export const NOSSA_CLOSED_MIN_WINDOW_HOURS = 1; // window minimal 1 jam

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

function addHours(dateTimeStr: string, hours: number): string {
  const d = parseDateTime(dateTimeStr);
  d.setUTCHours(d.getUTCHours() + hours);
  return toDateTimeStr(d);
}

function diffHours(fromStr: string, toStr: string): number {
  const from = parseDateTime(fromStr).getTime();
  const to = parseDateTime(toStr).getTime();
  return Math.round((to - from) / 3_600_000);
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
  const from = normalizeToDateTime(dateFrom);
  const to = normalizeToDateTime(dateTo);
  const windows: DateWindow[] = [];
  let cursor = from;
  while (diffHours(cursor, to) > 0) {
    const totalHours = diffHours(cursor, to);
    const windowHours = Math.min(maxWindowDays * 24, totalHours);
    const end = addHours(cursor, windowHours);
    windows.push({ dateFrom: cursor, dateTo: end });
    cursor = end;
  }
  return windows;
}

/**
 * Membagi dua sebuah window (dipakai saat probe count menunjukkan window
 * masih > kapasitas offset). Window minimal 1 jam — di bawah itu, fallback
 * ke data partial dengan log peringatan.
 *
 * API mendukung format `YYYY-MM-DD HH:mm:ss` untuk date_from/date_to, sehingga
 * window 1 hari bisa dipecah menjadi 12 jam, 6 jam, 3 jam, dst.
 */
export function bisectWindow(
  window: DateWindow,
): [DateWindow, DateWindow] | null {
  const totalHours = diffHours(window.dateFrom, window.dateTo);
  if (totalHours <= NOSSA_CLOSED_MIN_WINDOW_HOURS) {
    logger.warn('[QosmicBridge] Window sudah 1 jam, tidak bisa dipecah lagi', {
      window,
    });
    return null;
  }
  const midHours = Math.floor(totalHours / 2) || 1;
  const mid = addHours(window.dateFrom, midHours);
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
