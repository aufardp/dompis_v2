/**
 * Sumber kebenaran tunggal untuk status "SQM Update" sebuah tiket.
 *
 * Sebelumnya klasifikasi bergantung pada prefix `[SQM-UPDATE]` di `ticket.summary`,
 * yang rapuh karena `summary` ditimpa tiap sinkronisasi dari `nossa`
 * (ingestion `FIELDS_TO_MAP` + projection). Kolom `ticket.sqm_update_reason`
 * bersifat admin-owned dan tidak pernah disentuh ingestion/projection, jadi
 * itulah penanda yang dipakai sekarang: `sqm_update_reason` terisi ⇒ SQM Update.
 *
 * Isi kolom berformat `"[KODE] penjabaran"` (mis. `"[ISOLIR] pelanggan cabut"`),
 * ditulis oleh alur SqmUpdateModal. Prefix `[SQM-UPDATE]` di `summary` masih
 * ditulis sebagai headline tampilan saja — tidak lagi dipakai logika apa pun.
 */

export const SQM_UPDATE_HEADLINE_PREFIX = '[SQM-UPDATE]';

/** Panjang maksimum kolom `ticket.sqm_update_reason` (muat `[KODE] ` + 255 char). */
export const SQM_UPDATE_REASON_MAX_LEN = 300;

/**
 * Fragmen SQL: apakah baris ini SQM-update.
 * `tbl` = alias tabel (mis. `'t'`) atau `''` untuk kolom tanpa prefix.
 */
export function isSqmUpdateReasonSql(tbl = ''): string {
  const c = `${tbl ? `${tbl}.` : ''}sqm_update_reason`;
  return `(${c} IS NOT NULL AND TRIM(${c}) <> '')`;
}

/** Padanan JS untuk baris hasil query mentah / row API. */
export function isSqmUpdateRow(row: {
  sqm_update_reason?: string | null;
}): boolean {
  return (
    typeof row.sqm_update_reason === 'string' &&
    row.sqm_update_reason.trim() !== ''
  );
}

/** Fragmen `where` Prisma untuk tiket ber-SQM-update. */
export const sqmUpdateReasonPrismaFilter = {
  sqm_update_reason: { not: null },
} as const;

const REASON_RE = /^\[([A-Z0-9_-]+)\]\s*([\s\S]*)$/;

/** Pisahkan `"[KODE] catatan"` menjadi bagian-bagiannya. */
export function parseSqmUpdateReason(raw?: string | null): {
  code: string | null;
  note: string;
} {
  const s = (raw ?? '').trim();
  const m = REASON_RE.exec(s);
  return m ? { code: m[1], note: m[2].trim() } : { code: null, note: s };
}

/** Susun nilai kolom dari kode + catatan bebas. */
export function formatSqmUpdateReason(code: string, note: string): string {
  return `[${code}] ${note}`.trim();
}
