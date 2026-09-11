import { prisma } from '@/app/libs/prisma';
import { withMaxExecutionTime } from '@/lib/sql/max-execution-time';

const OBSERVATION_WINDOW_DAYS = 60;

// service_no placeholder yang ditemukan di data live (bukan nomor layanan
// asli, jadi harus dikecualikan supaya tidak membanjiri hitungan Ggn
// Berulang) — mis. 'NN' (1815 tiket), 'DEFAULT-REG-4'/'DEFAULT-REG-5'
// (ratusan tiket), 'DUMMY_...'.
const SERVICE_NO_PLACEHOLDER_SQL = `
  service_no != 'NN'
  AND service_no NOT LIKE 'DEFAULT-%'
  AND service_no NOT LIKE 'DEFAULT\\_%'
  AND service_no NOT LIKE 'DUMMY\\_%'
`;

export interface RecurringDisruptionRow {
  customer_type: string | null;
  source_ticket: string | null;
}

/**
 * "Ggn Berulang" (gangguan berulang): tiket dianggap berulang kalau
 * service_no yang sama punya >=2 tiket dalam jendela pengamatan 60 hari
 * terakhir (dari `asOf`). Kalau service_no itu baru muncul kurang dari 60
 * hari lalu, jendelanya otomatis ikut sejak tiket pertama service_no
 * tersebut (karena filter hanya membatasi batas AWAL, bukan memaksa selalu
 * tepat 60 hari).
 *
 * Mengembalikan baris TIKET (bukan service_no) yang termasuk kategori
 * berulang, dalam scope `whereClause`/`params` (WHERE dasar role/workzone/
 * branch yang sudah ada, tanpa alias tabel) — dipakai caller untuk breakdown
 * per tier customer_type + GAMAS/NON-GAMAS.
 */
export async function getRecurringDisruptionTickets(
  whereClause: string,
  params: unknown[],
  asOf: Date = new Date(),
): Promise<RecurringDisruptionRow[]> {
  const windowStart = new Date(asOf.getTime() - OBSERVATION_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const windowStartStr = windowStart.toISOString().slice(0, 19).replace('T', ' ');

  return prisma.$queryRawUnsafe<RecurringDisruptionRow[]>(
    withMaxExecutionTime(`SELECT t.customer_type, t.source_ticket
     FROM ticket t
     JOIN (
       SELECT service_no
       FROM ticket
       WHERE service_no IS NOT NULL
         AND service_no != ''
         AND ${SERVICE_NO_PLACEHOLDER_SQL}
         AND reported_date >= ?
         AND (${whereClause})
       GROUP BY service_no
       HAVING COUNT(*) >= 2
     ) rep ON t.service_no = rep.service_no
     WHERE t.reported_date >= ?
       AND (${whereClause})
     LIMIT 5000`),
    windowStartStr,
    ...params,
    windowStartStr,
    ...params,
  );
}

export interface RecurringDisruptionTicketRow {
  id_ticket: number;
  incident: string;
  service_no: string | null;
  customer_type: string | null;
  source_ticket: string | null;
  status: string | null;
  reported_date: string | null;
  closed_at: Date | null;
  rca: string | null;
  sub_rca: string | null;
  teknisi_user_id: number | null;
  technician_name: string | null;
}

interface RecurringDisruptionFilterOptions {
  customerTypes?: string[] | null;
  gamas?: 'all' | 'gamas' | 'non-gamas';
  search?: string;
  asOf?: Date;
}

/**
 * Bangun WHERE dasar "tiket berulang" (window 60 hari + exclude service_no
 * placeholder, sama persis dengan `getRecurringDisruptionTickets`) plus
 * filter tier/GAMAS/pencarian tambahan — dipakai bersama oleh
 * `getRecurringDisruptionServiceGroups` dan
 * `getRecurringDisruptionTicketsByServiceNo` supaya definisi "berulang"
 * dan filter selalu konsisten di antara keduanya.
 */
function buildFilteredRecurringSql(
  whereClause: string,
  params: unknown[],
  options: RecurringDisruptionFilterOptions,
): { fromSql: string; whereSql: string; sharedParams: unknown[] } {
  const asOf = options.asOf ?? new Date();
  const windowStart = new Date(
    asOf.getTime() - OBSERVATION_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  );
  const windowStartStr = windowStart.toISOString().slice(0, 19).replace('T', ' ');

  const extraConditions: string[] = [];
  const extraParams: unknown[] = [];

  if (options.customerTypes && options.customerTypes.length > 0) {
    extraConditions.push(
      `t.customer_type IN (${options.customerTypes.map(() => '?').join(',')})`,
    );
    extraParams.push(...options.customerTypes.map((c) => c.toUpperCase().trim()));
  }

  if (options.gamas === 'gamas') {
    extraConditions.push(`t.source_ticket = 'GAMAS'`);
  } else if (options.gamas === 'non-gamas') {
    extraConditions.push(
      `(t.source_ticket IS NULL OR t.source_ticket != 'GAMAS')`,
    );
  }

  const search = options.search?.trim();
  if (search) {
    // Ganti LIKE '%q%' (full scan) → exact untuk incident + prefix untuk service_no (pakai indeks)
    extraConditions.push(`(t.incident = ? OR t.service_no LIKE ?)`);
    extraParams.push(search, `${search}%`);
  }

  const extraWhere =
    extraConditions.length > 0 ? ` AND ${extraConditions.join(' AND ')}` : '';

  const fromSql = `
    FROM ticket t
    JOIN (
      SELECT service_no
      FROM ticket
      WHERE service_no IS NOT NULL
        AND service_no != ''
        AND ${SERVICE_NO_PLACEHOLDER_SQL}
        AND reported_date >= ?
        AND (${whereClause})
      GROUP BY service_no
      HAVING COUNT(*) >= 2
    ) rep ON t.service_no = rep.service_no
  `;
  const whereSql = `
    WHERE t.reported_date >= ?
      AND (${whereClause})
      ${extraWhere}
  `;
  const sharedParams = [
    windowStartStr,
    ...params,
    windowStartStr,
    ...params,
    ...extraParams,
  ];

  return { fromSql, whereSql, sharedParams };
}

export interface RecurringDisruptionServiceGroup {
  service_no: string;
  occurrence_count: number;
}

/**
 * Daftar service_no berulang (dalam scope filter tier/GAMAS/pencarian),
 * dipaginasi per SERVICE_NO (bukan per tiket) — dipakai modal drill-down
 * untuk menampilkan "service_no ini berulang N kali" beserta daftar
 * tiketnya (lihat `getRecurringDisruptionTicketsByServiceNo`).
 */
export async function getRecurringDisruptionServiceGroups(
  whereClause: string,
  params: unknown[],
  options: RecurringDisruptionFilterOptions & { page: number; limit: number },
): Promise<{ groups: RecurringDisruptionServiceGroup[]; total: number }> {
  const { fromSql, whereSql, sharedParams } = buildFilteredRecurringSql(
    whereClause,
    params,
    options,
  );

  const limit = Math.min(100, Math.max(1, options.limit));
  const offset = (Math.max(1, options.page) - 1) * limit;

  const [groups, countRows] = await Promise.all([
    prisma.$queryRawUnsafe<RecurringDisruptionServiceGroup[]>(
      `SELECT t.service_no, COUNT(*) AS occurrence_count
      ${fromSql} ${whereSql}
      GROUP BY t.service_no
      ORDER BY occurrence_count DESC, t.service_no ASC
      LIMIT ${limit} OFFSET ${offset}`,
      ...sharedParams,
    ),
    prisma.$queryRawUnsafe<{ total: bigint }[]>(
      `SELECT COUNT(*) AS total FROM (
        SELECT t.service_no ${fromSql} ${whereSql} GROUP BY t.service_no
      ) grouped`,
      ...sharedParams,
    ),
  ]).then(([g, c]) => [
    g.map((row) => ({ ...row, occurrence_count: Number(row.occurrence_count) })),
    c,
  ] as const);

  return { groups, total: Number(countRows[0]?.total ?? 0) };
}

/**
 * Tiket-tiket (dalam scope filter yang sama) untuk satu batch service_no —
 * dipakai untuk mengisi daftar tiket di tiap grup hasil
 * `getRecurringDisruptionServiceGroups`. Tidak dipaginasi (jumlah tiket per
 * batch grup kecil, dibatasi jumlah service_no per halaman).
 */
export async function getRecurringDisruptionTicketsByServiceNo(
  whereClause: string,
  params: unknown[],
  serviceNos: string[],
  options: RecurringDisruptionFilterOptions,
): Promise<RecurringDisruptionTicketRow[]> {
  if (serviceNos.length === 0) return [];

  const { fromSql, whereSql, sharedParams } = buildFilteredRecurringSql(
    whereClause,
    params,
    options,
  );
  const placeholders = serviceNos.map(() => '?').join(',');

  return prisma.$queryRawUnsafe<RecurringDisruptionTicketRow[]>(
    `SELECT
      t.id_ticket, t.incident, t.service_no, t.customer_type, t.source_ticket,
      t.status, t.reported_date, t.closed_at, t.rca, t.sub_rca, t.teknisi_user_id,
      u.nama AS technician_name
    ${fromSql}
    LEFT JOIN users u ON u.id_user = t.teknisi_user_id
    ${whereSql}
      AND t.service_no IN (${placeholders})
    ORDER BY t.service_no ASC, t.reported_date DESC
    LIMIT 2000`,
    ...sharedParams,
    ...serviceNos,
  );
}
