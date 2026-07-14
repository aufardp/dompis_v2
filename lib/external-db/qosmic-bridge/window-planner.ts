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
// Strategi: date-window splitting rekursif berbasis actual row count (probe
// dengan limit kecil dulu), bukan asumsi distribusi tiket rata.

import { logger } from '@/lib/observability/logger';

export const NOSSA_CLOSED_MAX_WINDOW_DAYS = 7; // default aman; hard cap API = 31 hari
export const NOSSA_CLOSED_MAX_OFFSET = 5_000;
export const NOSSA_CLOSED_PAGE_SIZE = 1_000; // limit maks per hit

export interface DateWindow {
  dateFrom: string; // 'YYYY-MM-DD'
  dateTo: string; // exclusive, 'YYYY-MM-DD'
}

function toDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return toDateOnly(d);
}

function diffDays(fromStr: string, toStr: string): number {
  const from = new Date(`${fromStr}T00:00:00.000Z`).getTime();
  const to = new Date(`${toStr}T00:00:00.000Z`).getTime();
  return Math.round((to - from) / 86_400_000);
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
  const windows: DateWindow[] = [];
  let cursor = dateFrom;
  while (diffDays(cursor, dateTo) > 0) {
    const end = addDays(
      cursor,
      Math.min(maxWindowDays, diffDays(cursor, dateTo)),
    );
    windows.push({ dateFrom: cursor, dateTo: end });
    cursor = end;
  }
  return windows;
}

/**
 * Membagi dua sebuah window (dipakai saat probe count menunjukkan window
 * masih > kapasitas offset). Window 1 hari tidak bisa dipecah lagi — di
 * titik itu, harus fallback ke query per-incident atau eskalasi manual,
 * karena bridge tidak menyediakan filter lain yang lebih presisi dari tanggal.
 */
export function bisectWindow(
  window: DateWindow,
): [DateWindow, DateWindow] | null {
  const totalDays = diffDays(window.dateFrom, window.dateTo);
  if (totalDays <= 1) {
    logger.warn('[QosmicBridge] Window sudah 1 hari, tidak bisa dipecah lagi', {
      window,
    });
    return null;
  }
  const midDays = Math.floor(totalDays / 2) || 1;
  const mid = addDays(window.dateFrom, midDays);
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
