import {
  B2C_JENIS_ALIASES,
  B2B_JENIS_ALIASES,
  NETRAL_JENIS_ALIASES,
  isB2CJenis,
  isNetralJenis,
  normalizeJenis,
} from '@/app/config/jenis-tiket';

/**
 * Dept 3-segmen: b2c | b2b | netral
 * Priority: netral (unknown,digital-spbu,non-numbering,billing,infracare) dicek dulu,
 * lalu permintaan dinamis via customer_segment, lalu b2c/b2b via jenis.
 */
export type DeptKey = 'b2c' | 'b2b' | 'netral';
export type DeptFilterKey = 'all' | DeptKey;

const B2C_CUSTOMER_SEGMENTS = new Set(['DCS', 'PL-TSEL']);

function isB2CSegment(seg?: string | null): boolean {
  const s = String(seg ?? '').trim().toUpperCase();
  return B2C_CUSTOMER_SEGMENTS.has(s);
}

export function deptByJenis(
  jenisRaw: string | null | undefined,
  customerSegment?: string | null,
): DeptKey {
  if (isNetralJenis(jenisRaw)) return 'netral';
  const key = normalizeJenis(jenisRaw);
  if (key === 'permintaan') return isB2CSegment(customerSegment) ? 'b2c' : 'b2b';
  if (isB2CJenis(jenisRaw)) return 'b2c';
  // isB2BJenis sudah exclude netral
  return 'b2b';
}

function buildJenisInSql(column: string, aliases: string[]): string {
  if (aliases.length === 0) return '1=0';
  // MySQL collation case-insensitive, cukup IN list
  const list = aliases.map((a) => `'${a.replace(/'/g, "''")}'`).join(', ');
  return `t.${column} IN (${list})`;
}

// Normalized check: LOWER(REPLACE(REPLACE(col,' ','-'),'_','-')) IN (norm_list) OR alias IN (orig)
function buildJenisNormalizedSql(
  column: string,
  aliases: string[],
  keys: string[],
): string {
  // pakai alias IN sudah cukup karena collation case-insensitive & alias sudah cover varian spasi/underscore
  // tambah fallback normalized untuk K1/K2 suffix (datin-k1 -> datin)
  const normKeys = keys.map((k) => `'${k}'`).join(', ');
  const aliasList = aliases.map((a) => `'${a.replace(/'/g, "''")}'`).join(', ');
  const col = `t.${column}`;
  const normCol = `LOWER(TRIM(REPLACE(REPLACE(${col},' ','-'),'_','-')))`;
  return `(${col} IN (${aliasList}) OR ${normCol} IN (${normKeys}))`;
}

export const NETRAL_JENIS_SQL_COL = (col = 'jenis_tiket_2'): string =>
  buildJenisNormalizedSql(col, NETRAL_JENIS_ALIASES, ['unknown','digital-spbu','non-numbering','billing','infracare']);

export const B2C_JENIS_SQL_COL = (col = 'jenis_tiket_2'): string =>
  buildJenisNormalizedSql(col, B2C_JENIS_ALIASES, ['reguler','hvc','sqm','unspec']);

export const B2B_JENIS_SQL_COL = (col = 'jenis_tiket_2'): string =>
  buildJenisNormalizedSql(col, B2B_JENIS_ALIASES, ['sqm-ccan','indibiz','datin','reseller','non-datin','wifi-id','astinet','tsel','top-olo','vpn-ip','metro-e','dwdm','gamas']);

// Dept SQL untuk raw query (`t.` prefix)
export function buildDeptJenisSql(dept: DeptFilterKey, col = 'jenis_tiket_2'): string {
  if (dept === 'netral') return NETRAL_JENIS_SQL_COL(col);
  if (dept === 'b2c') {
    // permintaan dinamis tidak bisa di-SQL murni tanpa customer_segment join; di-SQL kita treat permintaan sebagai b2c via jenis list + nanti filter tambahan di JS.
    // Untuk simplifikasi: b2c = B2C list (sudah include permintaan via fallback isB2C), netral sudah terpisah jadi aman.
    return B2C_JENIS_SQL_COL(col);
  }
  if (dept === 'b2b') return B2B_JENIS_SQL_COL(col);
  return '1=1';
}

/**
 * SQL segmen yang meniru deptByJenis() PERSIS (sumber kebenaran agregasi rekap
 * di app/api/dashboard/rekap-workorder/route.ts). Dipakai untuk membership sel
 * di buildDetailClause. Berbasis tabel alias (lewat NETRAL/B2B_JENIS_SQL_COL),
 * bukan daftar key hardcoded, supaya jenis_tiket_2 seperti 'customer'/'hvc_gold'
 * ikut ter-klasifikasi seperti di route.ts.
 *
 * Precedence deptByJenis: netral -> permintaan (dinamis via customer_segment) ->
 * isB2CJenis (jenis kosong / tak dikenal ikut b2c) -> sisanya b2b.
 */
export function buildSegKeySql(
  seg: DeptKey,
  jenisCol = 'jenis_tiket_2',
  segmentCol = 'customer_segment',
): string {
  const norm = `LOWER(TRIM(REPLACE(REPLACE(COALESCE(t.${jenisCol}, ''), ' ', '-'), '_', '-')))`;
  const isEmpty = `${norm} = ''`;
  const isB2CSeg = `UPPER(TRIM(COALESCE(t.${segmentCol}, ''))) IN ('DCS', 'PL-TSEL')`;
  const isPermintaan = `(${norm} = 'permintaan' OR ${norm} LIKE 'permintaan-%')`;
  const netral = `(NOT (${isEmpty}) AND (${NETRAL_JENIS_SQL_COL(jenisCol)}))`;
  const b2bJenis = B2B_JENIS_SQL_COL(jenisCol);

  // b2b <=> bukan netral DAN ( permintaan tanpa segment B2C  ATAU  jenis B2B dikenal )
  const b2b = `(NOT (${netral}) AND (
      (${isPermintaan} AND NOT (${isB2CSeg}))
      OR (NOT ${isPermintaan} AND NOT ${isEmpty} AND (${b2bJenis}))
  ))`;
  // b2c <=> bukan netral DAN bukan b2b (mencakup: permintaan+segment B2C,
  //        jenis B2C dikenal, jenis tak dikenal, jenis kosong)
  const b2c = `(NOT (${netral}) AND NOT (${b2b}))`;

  if (seg === 'netral') return netral;
  if (seg === 'b2b') return b2b;
  return b2c;
}

// Prisma where untuk dept 3-segmen (pakai jenis_tiket_2 + customer_segment untuk permintaan)
export function buildDeptJenisWhere(dept: DeptFilterKey): Record<string, unknown> | null {
  if (dept === 'all') return null;
  if (dept === 'netral') {
    return { jenis_tiket_2: { in: [...NETRAL_JENIS_ALIASES, 'unknown','UNKNOWN','Unknown'] } } as unknown as Record<string, unknown>;
  }
  if (dept === 'b2c') {
    // b2c = B2C aliases + permintaan yang segment B2C; di Prisma kita gabung OR
    return {
      OR: [
        { jenis_tiket_2: { in: B2C_JENIS_ALIASES } },
        { AND: [{ jenis_tiket_2: { in: ['permintaan','PERMINTAAN','Permintaan'] } }, { customer_segment: { in: ['DCS','PL-TSEL'] } }] },
      ],
    } as unknown as Record<string, unknown>;
  }
  if (dept === 'b2b') {
    return {
      OR: [
        { jenis_tiket_2: { in: B2B_JENIS_ALIASES } },
        { AND: [{ jenis_tiket_2: { in: ['permintaan','PERMINTAAN','Permintaan'] } }, { OR: [{ customer_segment: { notIn: ['DCS','PL-TSEL'] } }, { customer_segment: null }] }] },
      ],
    } as unknown as Record<string, unknown>;
  }
  return null;
}
