import prisma from '@/app/libs/prisma';

export type AttendanceGateSegment = 'b2b' | 'b2c' | 'unset';

const KEY_MAP: Record<AttendanceGateSegment, string> = {
  b2b: 'attendance_gate_b2b',
  b2c: 'attendance_gate_b2c',
  unset: 'attendance_gate_unset',
};

const DEFAULTS: Record<AttendanceGateSegment, boolean> = {
  b2b: true,
  b2c: true,
  unset: true,
};

// simple in-memory cache 60s
let cache: { values: Record<AttendanceGateSegment, boolean>; ts: number } | null = null;
const TTL_MS = 60 * 1000;

function normalizeSegment(value: string | null | undefined): AttendanceGateSegment {
  const v = String(value || '').trim().toUpperCase();
  if (v === 'B2B') return 'b2b';
  if (v === 'B2C') return 'b2c';
  if (v === 'BOTH') return 'unset'; // BOTH treated as unset (needs gate unset)
  if (!v) return 'unset';
  return 'unset';
}

function parseBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  const v = String(value).trim().toLowerCase();
  if (v === 'true' || v === '1' || v === 'on') return true;
  if (v === 'false' || v === '0' || v === 'off') return false;
  return fallback;
}

export async function getAttendanceGate(segment: AttendanceGateSegment): Promise<boolean> {
  const all = await getAllGates();
  return all[segment];
}

export async function getAttendanceGateByTechnicianSegment(
  technicianSegment: string | null | undefined,
): Promise<boolean> {
  return getAttendanceGate(normalizeSegment(technicianSegment));
}

export async function getAllGates(): Promise<Record<AttendanceGateSegment, boolean>> {
  const now = Date.now();
  if (cache && now - cache.ts < TTL_MS) return cache.values;

  // Try DB first; fallback to DEFAULTS if row missing
  try {
    const rows = await prisma.system_config.findMany({
      where: { key: { in: Object.values(KEY_MAP) } },
      select: { key: true, value: true },
    });
    const map = new Map(rows.map((r) => [r.key, r.value] as const));
    const values: Record<AttendanceGateSegment, boolean> = {
      b2b: parseBool(map.get(KEY_MAP.b2b), DEFAULTS.b2b),
      b2c: parseBool(map.get(KEY_MAP.b2c), DEFAULTS.b2c),
      unset: parseBool(map.get(KEY_MAP.unset), DEFAULTS.unset),
    };
    cache = { values, ts: now };
    return values;
  } catch {
    // DB not available (e.g. during build) — return defaults
    const values = { ...DEFAULTS };
    cache = { values, ts: now };
    return values;
  }
}

export async function setAttendanceGate(
  segment: AttendanceGateSegment,
  required: boolean,
  actorId?: number,
): Promise<void> {
  const key = KEY_MAP[segment];
  await prisma.system_config.upsert({
    where: { key },
    update: { value: String(required), updated_by: actorId ?? null },
    create: { key, value: String(required), updated_by: actorId ?? null },
  });
  cache = null;
}

export async function setAllGates(
  gates: Record<AttendanceGateSegment, boolean>,
  actorId?: number,
): Promise<void> {
  for (const seg of Object.keys(gates) as AttendanceGateSegment[]) {
    await setAttendanceGate(seg, gates[seg], actorId);
  }
}

export function invalidateGateCache(): void {
  cache = null;
}

export { normalizeSegment };
