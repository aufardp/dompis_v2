import { Prisma } from '@prisma/client';
import prisma from '@/app/libs/prisma';
import {
  classifyTechnicianBucket,
  type TechnicianBucketSource,
} from '@/app/libs/technician-bucket';
import { calculateManhours } from '@/app/libs/services/manhours.service';

/**
 * Rekap Close Teknisi.
 *
 * Per teknisi, dalam rentang tanggal:
 *  - jumlah tiket close (status='CLOSED' DAN status_update='close') dipecah kategori
 *    CUS / PRO / MAN / OHI / REP (+ LAIN),
 *  - hari hadir (distinct DATE(check_in_at) di technician_attendance),
 *  - BOBOT = Σ(count kategori × bobot kategori),
 *  - BOBOT AVG = BOBOT ÷ hari hadir,
 *  - PRODUCTIVITY tier dari BOBOT AVG vs ambang system_config,
 *  - realisasi/produktivitas jam (serapan dari manhours.service).
 */

/** Spesialisasi teknisi (kolom users.technician_segment). */
export type RecapSpesialisasi = 'b2b' | 'b2c';

/** Nilai technician_segment yang cocok per spesialisasi ('BOTH' masuk keduanya). */
const SEGMENT_MATCH: Record<RecapSpesialisasi, string[]> = {
  b2b: ['B2B', 'BOTH'],
  b2c: ['B2C', 'BOTH'],
};

export const RECAP_BUCKET_KEYS = ['CUS', 'PRO', 'MAN', 'OHI', 'REP'] as const;
export type RecapBucketKey = (typeof RECAP_BUCKET_KEYS)[number];
export type RecapCountKey = RecapBucketKey | 'LAIN';

export interface RecapCloseFilter {
  adminUserId: number;
  dateFrom: Date;
  /** exclusive upper bound */
  dateTo: Date;
  serviceArea?: string;
  spesialisasi: RecapSpesialisasi;
  q?: string;
  /** default false → sembunyikan teknisi tanpa tiket close pada rentang. */
  includeEmpty?: boolean;
}

export interface BobotConfigRow {
  bucket_key: RecapBucketKey;
  label: string;
  bobot: number;
  sort_order: number;
}

export interface RecapThresholds {
  tinggi_min: number;
  sedang_min: number;
}

export interface RecapCloseRow {
  id_user: number;
  nama: string;
  nik: string | null;
  witel: string;
  service_area: string;
  hari_hadir: number;
  counts: Record<RecapCountKey, number>;
  total_close: number;
  bobot: number;
  bobot_avg: number | null;
  produktivitas: 'Tinggi' | 'Sedang' | 'Rendah' | null;
  realisasi: number;
  produktivitas_jam: number;
  target: number;
}

export interface RecapCloseResult {
  rows: RecapCloseRow[];
  configs: BobotConfigRow[];
  thresholds: RecapThresholds;
  serviceAreas: string[];
}

const TECHNICIAN_ROLE_ID = 4;
const CFG_TTL_MS = 10 * 60 * 1000;
/** Hari kerja standar per periode — pembagi BOBOT AVG. */
const RECAP_WORKING_DAYS = 22;

let cfgCache: {
  at: number;
  weights: BobotConfigRow[];
  thresholds: RecapThresholds;
} | null = null;

export function invalidateRecapConfigCache(): void {
  cfgCache = null;
}

export async function loadRecapConfig(): Promise<{
  weights: BobotConfigRow[];
  thresholds: RecapThresholds;
}> {
  const now = Date.now();
  if (cfgCache && now - cfgCache.at < CFG_TTL_MS) {
    return { weights: cfgCache.weights, thresholds: cfgCache.thresholds };
  }

  const [weightRows, tinggi, sedang] = await Promise.all([
    prisma.technician_bobot_config.findMany({ orderBy: { sort_order: 'asc' } }),
    prisma.system_config.findUnique({
      where: { key: 'recap_produktif_tinggi_min' },
    }),
    prisma.system_config.findUnique({
      where: { key: 'recap_produktif_sedang_min' },
    }),
  ]);

  const weights: BobotConfigRow[] = weightRows.map((r) => ({
    bucket_key: r.bucket_key as RecapBucketKey,
    label: r.label,
    bobot: Number(r.bobot),
    sort_order: r.sort_order,
  }));
  for (const key of RECAP_BUCKET_KEYS) {
    if (!weights.some((w) => w.bucket_key === key)) {
      weights.push({ bucket_key: key, label: key, bobot: 1, sort_order: 99 });
    }
  }

  const thresholds: RecapThresholds = {
    tinggi_min: Number(tinggi?.value ?? 4) || 4,
    sedang_min: Number(sedang?.value ?? 2) || 2,
  };

  cfgCache = { at: now, weights, thresholds };
  return { weights, thresholds };
}

interface TechScope {
  technicians: Array<{ id_user: number; nama: string | null; nik: string | null }>;
  techWzMap: Map<number, string[]>;
  /** cabang (branch) dari user_branch (Scope Akses) — fallback sumber Witel. */
  techBranchMap: Map<number, string[]>;
  /** cabang penempatan (users.branch_id) — sumber utama kolom Witel. */
  techPlacementBranch: Map<number, string>;
}

async function resolveTechnicianScope(
  adminUserId: number,
  serviceArea: string | undefined,
  q: string | undefined,
  spesialisasi: RecapSpesialisasi,
): Promise<TechScope> {
  const adminSaRows = await prisma.user_sa.findMany({
    where: { user_id: adminUserId },
    select: { sa_id: true },
    take: 200,
  });
  const adminSaIds = adminSaRows
    .map((r) => r.sa_id)
    .filter((v): v is number => v != null);

  let techIds: number[];
  if (adminSaIds.length > 0) {
    const rows = await prisma.user_sa.findMany({
      where: { sa_id: { in: adminSaIds } },
      select: { user_id: true },
      take: 5000,
    });
    techIds = [
      ...new Set(
        rows.map((r) => r.user_id).filter((v): v is number => v != null),
      ),
    ];
  } else {
    const rows = await prisma.users.findMany({
      where: { role_id: TECHNICIAN_ROLE_ID },
      select: { id_user: true },
      take: 5000,
    });
    techIds = rows.map((r) => r.id_user);
  }

  if (techIds.length === 0)
    return {
      technicians: [],
      techWzMap: new Map(),
      techBranchMap: new Map(),
      techPlacementBranch: new Map(),
    };

  const [techSa, techBranch] = await Promise.all([
    prisma.user_sa.findMany({
      where: { user_id: { in: techIds } },
      select: { user_id: true, service_area: { select: { nama_sa: true } } },
      take: 20000,
    }),
    prisma.user_branch.findMany({
      where: { user_id: { in: techIds } },
      select: { user_id: true, branch: { select: { nama_branch: true } } },
      take: 20000,
    }),
  ]);

  const techWzMap = new Map<number, string[]>();
  for (const r of techSa) {
    if (!r.user_id || !r.service_area?.nama_sa) continue;
    const arr = techWzMap.get(r.user_id) ?? [];
    arr.push(r.service_area.nama_sa);
    techWzMap.set(r.user_id, arr);
  }

  const techBranchMap = new Map<number, string[]>();
  for (const r of techBranch) {
    if (!r.user_id || !r.branch?.nama_branch) continue;
    const arr = techBranchMap.get(r.user_id) ?? [];
    if (!arr.includes(r.branch.nama_branch)) arr.push(r.branch.nama_branch);
    techBranchMap.set(r.user_id, arr);
  }

  const saLower = serviceArea?.trim().toLowerCase();
  let finalIds = techIds;
  if (saLower) {
    finalIds = techIds.filter((id) =>
      (techWzMap.get(id) ?? []).some(
        (w) => w.toLowerCase().trim() === saLower,
      ),
    );
  }

  let techRows = await prisma.users.findMany({
    where: {
      id_user: { in: finalIds },
      role_id: TECHNICIAN_ROLE_ID,
      technician_segment: { in: SEGMENT_MATCH[spesialisasi] },
    },
    select: {
      id_user: true,
      nama: true,
      nik: true,
      branch: { select: { nama_branch: true } },
    },
    orderBy: { nama: 'asc' },
    take: 5000,
  });

  const qLower = q?.trim().toLowerCase();
  if (qLower) {
    techRows = techRows.filter(
      (t) =>
        (t.nama ?? '').toLowerCase().includes(qLower) ||
        (t.nik ?? '').toLowerCase().includes(qLower),
    );
  }

  const techPlacementBranch = new Map<number, string>();
  for (const t of techRows) {
    if (t.branch?.nama_branch) {
      techPlacementBranch.set(t.id_user, t.branch.nama_branch);
    }
  }

  const technicians = techRows.map((t) => ({
    id_user: t.id_user,
    nama: t.nama,
    nik: t.nik,
  }));

  return { technicians, techWzMap, techBranchMap, techPlacementBranch };
}

type TicketRow = TechnicianBucketSource & {
  tech_id: number;
  is_manual: number | boolean | null;
  witel: string | null;
};

/** Klasifikasikan satu tiket close ke kolom rekap. MAN eksklusif (menang atas bucket). */
export function classifyRecapColumn(row: {
  is_manual: number | boolean | null;
} & TechnicianBucketSource): RecapCountKey {
  if (Number(row.is_manual) === 1) return 'MAN';
  const bucket = classifyTechnicianBucket(row);
  if (bucket === 'kpi_customer') return 'CUS';
  if (bucket === 'kpi_proactive') return 'PRO';
  if (bucket === 'non_kpi_unspec') return 'OHI';
  if (bucket === 'obsolete') return 'REP';
  return 'LAIN';
}

function emptyCounts(): Record<RecapCountKey, number> {
  return { CUS: 0, PRO: 0, MAN: 0, OHI: 0, REP: 0, LAIN: 0 };
}

export async function getRekapCloseTeknisi(
  filter: RecapCloseFilter,
): Promise<RecapCloseResult> {
  const { adminUserId, dateFrom, dateTo, serviceArea, spesialisasi, q } = filter;

  const [{ weights, thresholds }, scope] = await Promise.all([
    loadRecapConfig(),
    resolveTechnicianScope(adminUserId, serviceArea, q, spesialisasi),
  ]);

  const serviceAreas = [
    ...new Set(
      [...scope.techWzMap.values()].flat().filter((s) => s && s.trim()),
    ),
  ].sort((a, b) => a.localeCompare(b));

  if (scope.technicians.length === 0) {
    return { rows: [], configs: weights, thresholds, serviceAreas };
  }

  const techIds = scope.technicians.map((t) => t.id_user);

  // Hari hadir per teknisi
  const attRows = await prisma.$queryRaw<Array<{ tech_id: number; d: number }>>(
    Prisma.sql`
      SELECT technician_id AS tech_id, COUNT(DISTINCT DATE(check_in_at)) AS d
      FROM technician_attendance
      WHERE technician_id IN (${Prisma.join(techIds)})
        AND check_in_at >= ${dateFrom} AND check_in_at < ${dateTo}
      GROUP BY technician_id
    `,
  );
  const hadirMap = new Map(
    attRows.map((r) => [Number(r.tech_id), Number(r.d)]),
  );

  // Tiket close dalam rentang
  const wzClause = serviceArea?.trim()
    ? Prisma.sql`AND LOWER(t.workzone) = LOWER(${serviceArea.trim()})`
    : Prisma.empty;

  const tickets = await prisma.$queryRaw<TicketRow[]>(Prisma.sql`
    SELECT t.teknisi_user_id AS tech_id, t.is_manual, t.witel,
           t.source_ticket, t.classification_flag, t.classification_path,
           t.channel, t.summary, t.sqm_update_reason,
           t.jenis_tiket_1, t.jenis_tiket_2
    FROM ticket t
    WHERE t.teknisi_user_id IN (${Prisma.join(techIds)})
      AND UPPER(t.status) = 'CLOSED'
      AND LOWER(t.status_update) = 'close'
      AND t.closed_at >= ${dateFrom} AND t.closed_at < ${dateTo}
      ${wzClause}
    LIMIT 200000
  `);

  const perTech = new Map<number, Record<RecapCountKey, number>>();
  const witelTally = new Map<number, Map<string, number>>();
  for (const row of tickets) {
    const tid = Number(row.tech_id);
    const counts = perTech.get(tid) ?? emptyCounts();
    counts[classifyRecapColumn(row)] += 1;
    perTech.set(tid, counts);

    const witel = (row.witel ?? '').trim();
    if (witel) {
      const wt = witelTally.get(tid) ?? new Map<string, number>();
      wt.set(witel, (wt.get(witel) ?? 0) + 1);
      witelTally.set(tid, wt);
    }
  }

  // Serapan manhours (realisasi / produktivitas jam / target)
  let mhMap = new Map<
    number,
    { realisasi: number; produktivitas: number; target: number }
  >();
  try {
    const mh = await calculateManhours({
      dateFrom,
      dateTo,
      technicianIds: techIds,
      sto: serviceArea?.trim() || undefined,
    });
    mhMap = new Map(
      mh.map((m) => [
        m.technician_id,
        {
          realisasi: m.realisasi,
          produktivitas: m.produktivitas,
          target: m.target,
        },
      ]),
    );
  } catch {
    // manhours opsional — jangan gagalkan rekap kalau perhitungan jam error
  }

  const weightMap = new Map(weights.map((w) => [w.bucket_key, w.bobot]));

  const rows: RecapCloseRow[] = scope.technicians.map((t) => {
    const counts = perTech.get(t.id_user) ?? emptyCounts();
    const hadir = hadirMap.get(t.id_user) ?? 0;

    const bobot = RECAP_BUCKET_KEYS.reduce(
      (sum, key) => sum + counts[key] * (weightMap.get(key) ?? 1),
      0,
    );
    const bobotRounded = Math.round(bobot * 100) / 100;
    // BOBOT AVG = BOBOT ÷ hari kerja standar (bukan hari hadir).
    const bobotAvg = Math.round((bobot / RECAP_WORKING_DAYS) * 100) / 100;

    let produktivitas: RecapCloseRow['produktivitas'] = null;
    if (bobotAvg != null) {
      produktivitas =
        bobotAvg >= thresholds.tinggi_min
          ? 'Tinggi'
          : bobotAvg >= thresholds.sedang_min
            ? 'Sedang'
            : 'Rendah';
    }

    // Witel: branch penempatan (users.branch_id) → user_branch → witel tiket terbanyak → '–'.
    const branchNames = scope.techBranchMap.get(t.id_user) ?? [];
    const witel =
      scope.techPlacementBranch.get(t.id_user) ??
      (branchNames.length > 0
        ? branchNames.join(', ')
        : ([...(witelTally.get(t.id_user)?.entries() ?? [])].sort(
            (a, b) => b[1] - a[1],
          )[0]?.[0] ?? '–'));

    const mh = mhMap.get(t.id_user);

    return {
      id_user: t.id_user,
      nama: t.nama ?? '',
      nik: t.nik,
      witel,
      service_area: (scope.techWzMap.get(t.id_user) ?? []).join(', ') || '–',
      hari_hadir: hadir,
      counts,
      total_close:
        counts.CUS + counts.PRO + counts.MAN + counts.OHI + counts.REP + counts.LAIN,
      bobot: bobotRounded,
      bobot_avg: bobotAvg,
      produktivitas,
      realisasi: mh?.realisasi ?? 0,
      produktivitas_jam: mh?.produktivitas ?? 0,
      target: mh?.target ?? 176,
    };
  });

  const visibleRows = filter.includeEmpty
    ? rows
    : rows.filter((r) => r.total_close > 0);

  visibleRows.sort(
    (a, b) =>
      (b.bobot_avg ?? -1) - (a.bobot_avg ?? -1) ||
      b.bobot - a.bobot ||
      a.nama.localeCompare(b.nama),
  );

  return { rows: visibleRows, configs: weights, thresholds, serviceAreas };
}

export interface RecapDetailRow {
  tech_id: number;
  nama: string;
  nik: string | null;
  witel: string;
  incident: string;
  column: RecapCountKey;
  customer: string;
  service_no: string;
  jenis: string;
  workzone: string;
  rca: string;
  sub_rca: string;
  solusi: string;
  reported_date: string | null;
  closed_at: string | null;
  resolve_hours: number | null;
}

/** Bersihkan nilai placeholder sumber (#N/A, #REF!, NULL string). */
function cleanVal(v: string | null | undefined): string {
  const s = (v ?? '').trim();
  if (!s || /^#(n\/a|ref!?|value!?|name\?)$/i.test(s) || s.toUpperCase() === 'NULL')
    return '';
  return s;
}

/**
 * Durasi resolve dalam jam: dari `reported_date` (VARCHAR bebas) ke `resolve_date`.
 * `reported_date` bisa berisi tanggal ngawur → hasil di luar [0, 1 tahun] dibuang.
 */
export function resolveHoursFrom(
  reportedDate: string | null | undefined,
  resolveDate: Date | null | undefined,
): number | null {
  const reported = cleanVal(reportedDate);
  if (!reported || !resolveDate) return null;
  const start = new Date(reported).getTime();
  if (!Number.isFinite(start)) return null;
  const h = (resolveDate.getTime() - start) / 3600000;
  // reported_date VARCHAR bebas → buang hasil negatif / > 2 tahun (pasti data ngawur).
  if (!Number.isFinite(h) || h < 0 || h >= 24 * 365 * 2) return null;
  return Math.round(h * 10) / 10;
}

/**
 * Daftar rata (flat) semua tiket close dalam scope — untuk sheet "Detail Tiket"
 * di export Excel. Satu baris per tiket, lengkap dengan teknisi + kolom rekap.
 */
export async function getRekapCloseDetail(
  filter: RecapCloseFilter,
): Promise<RecapDetailRow[]> {
  const { adminUserId, dateFrom, dateTo, serviceArea, spesialisasi, q } = filter;

  const scope = await resolveTechnicianScope(
    adminUserId,
    serviceArea,
    q,
    spesialisasi,
  );
  if (scope.technicians.length === 0) return [];

  const techIds = scope.technicians.map((t) => t.id_user);
  const techMeta = new Map(
    scope.technicians.map((t) => [t.id_user, { nama: t.nama ?? '', nik: t.nik }]),
  );

  const wzClause = serviceArea?.trim()
    ? Prisma.sql`AND LOWER(t.workzone) = LOWER(${serviceArea.trim()})`
    : Prisma.empty;

  const rows = await prisma.$queryRaw<
    Array<
      TicketRow & {
        incident: string;
        contact_name: string | null;
        service_no: string | null;
        workzone: string | null;
        reported_date: string | null;
        closed_at: Date | null;
        resolve_date: Date | null;
        rca: string | null;
        sub_rca: string | null;
        description_solution_dompis: string | null;
      }
    >
  >(Prisma.sql`
    SELECT t.teknisi_user_id AS tech_id, t.is_manual, t.witel,
           t.incident, t.contact_name, t.service_no, t.workzone,
           t.reported_date, t.closed_at, t.resolve_date, t.rca, t.sub_rca,
           t.description_solution_dompis,
           t.source_ticket, t.classification_flag, t.classification_path,
           t.channel, t.summary, t.sqm_update_reason,
           t.jenis_tiket_1, t.jenis_tiket_2
    FROM ticket t
    WHERE t.teknisi_user_id IN (${Prisma.join(techIds)})
      AND UPPER(t.status) = 'CLOSED'
      AND LOWER(t.status_update) = 'close'
      AND t.closed_at >= ${dateFrom} AND t.closed_at < ${dateTo}
      ${wzClause}
    ORDER BY t.teknisi_user_id, t.closed_at
    LIMIT 100000
  `);

  return rows.map((r) => {
    const tid = Number(r.tech_id);
    const meta = techMeta.get(tid);
    const reported = cleanVal(r.reported_date);
    const closed = r.closed_at ?? null;
    return {
      tech_id: tid,
      nama: meta?.nama ?? '',
      nik: meta?.nik ?? null,
      witel: scope.techPlacementBranch.get(tid) ?? '',
      incident: r.incident,
      column: classifyRecapColumn(r),
      customer: cleanVal(r.contact_name),
      service_no: cleanVal(r.service_no),
      jenis: cleanVal(r.jenis_tiket_2) || cleanVal(r.jenis_tiket_1),
      workzone: cleanVal(r.workzone),
      rca: cleanVal(r.rca),
      sub_rca: cleanVal(r.sub_rca),
      solusi: cleanVal(r.description_solution_dompis),
      reported_date: reported || null,
      closed_at: closed ? closed.toISOString() : null,
      resolve_hours: resolveHoursFrom(r.reported_date, r.resolve_date),
    };
  });
}
