export interface JenisTiketConfig {
  key: string;
  label: string;
  segment: 'b2c' | 'b2b';
  color: string;
  priority: number;
  slaOverrideHours?: number;
  dbAliases: string[];
  ttrLabel?: string;
}

export const JENIS_TIKET_LIST: JenisTiketConfig[] = [
  {
    key: 'reguler',
    label: 'Reguler',
    segment: 'b2c',
    color:
      'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400',
    priority: 3,
    dbAliases: [
      'reg',
      'REG',
      'reguler',
      'REGULER',
      'regular',
      'customer',
      'Customer',
      'customerr',
      'cust',
      'custoner',
    ],
  },
  {
    key: 'hvc',
    label: 'HVC',
    segment: 'b2c',
    color:
      'bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400',
    priority: 4,
    dbAliases: [
      'hvc',
      'HVC',
      'hvc_gold',
      'hvc_platinum',
      'hvc_diamond',
      'HVC_GOLD',
      'HVC_PLATINUM',
      'HVC_DIAMOND',
    ],
  },
  {
    key: 'sqm',
    label: 'SQM',
    segment: 'b2c',
    color: 'bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400',
    priority: 2,
    dbAliases: ['sqm', 'SQM'],
  },
  {
    key: 'unspec',
    label: 'Unspec',
    segment: 'b2c',
    color:
      'bg-slate-100 text-slate-500 dark:bg-slate-500/15 dark:text-slate-400',
    priority: 1,
    dbAliases: ['unspec', 'unspecified', 'UNSPEC'],
  },
  {
    key: 'sqm-ccan',
    label: 'SQM-CCAN',
    segment: 'b2b',
    color:
      'bg-fuchsia-50 text-fuchsia-600 dark:bg-fuchsia-500/15 dark:text-fuchsia-400',
    priority: 5,
    slaOverrideHours: 4,
    ttrLabel: '4 Jam',
    dbAliases: [
      'sqm-ccan',
      'sqm_ccan',
      'sqm ccan',
      'sqmccan',
      'ccan',
      'SQM-CCAN',
    ],
  },
  {
    key: 'indibiz',
    label: 'Indibiz',
    segment: 'b2b',
    color: 'bg-sky-50 text-sky-600 dark:bg-sky-500/15 dark:text-sky-400',
    priority: 4,
    slaOverrideHours: 4,
    ttrLabel: '4 Jam',
    dbAliases: [
      'indibiz',
      'indi_biz',
      'indi biz',
      'indibiz pro',
      'pro',
      'INDIBIZ',
    ],
  },
  {
    key: 'datin',
    label: 'Datin',
    segment: 'b2b',
    color: 'bg-cyan-50 text-cyan-600 dark:bg-cyan-500/15 dark:text-cyan-400',
    priority: 3,
    slaOverrideHours: 1.5,
    ttrLabel: '1.5 Jam',
    dbAliases: [
      'datin',
      'datin_enterprise',
      'datin enterprise',
      'enterprise',
      'DATIN',
    ],
  },
  {
    key: 'reseller',
    label: 'Reseller',
    segment: 'b2b',
    color:
      'bg-purple-50 text-purple-600 dark:bg-purple-500/15 dark:text-purple-400',
    priority: 2,
    slaOverrideHours: 6,
    ttrLabel: '6 Jam',
    dbAliases: ['reseller', 'RESELLER'],
  },
  {
    key: 'wifi-id',
    label: 'WiFi-ID',
    segment: 'b2b',
    color: 'bg-teal-50 text-teal-600 dark:bg-teal-500/15 dark:text-teal-400',
    priority: 1,
    slaOverrideHours: 24,
    ttrLabel: '24 Jam',
    dbAliases: ['wifi-id', 'wifi_id', 'wifi id', 'wifiid', 'wifi', 'WIFI-ID'],
  },
  {
    key: 'unknown',
    label: 'Unknown',
    segment: 'b2b',
    color: 'bg-gray-50 text-gray-600 dark:bg-gray-500/15 dark:text-gray-400',
    priority: 0,
    dbAliases: ['unknown', 'UNKNOWN'],
  },
  {
    key: 'digital-spbu',
    label: 'Digital SPBU',
    segment: 'b2b',
    color: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-400',
    priority: 6,
    dbAliases: ['digital-spbu', 'digital_spbu', 'DIGITAL_SPBU'],
  },
  {
    key: 'permintaan',
    label: 'Permintaan',
    segment: 'b2b',
    color: 'bg-orange-50 text-orange-600 dark:bg-orange-500/15 dark:text-orange-400',
    priority: 1,
    dbAliases: ['permintaan', 'PERMINTAAN'],
  },
  {
    key: 'unspec-b2b',
    label: 'Unspec B2B',
    segment: 'b2b',
    color: 'bg-slate-100 text-slate-500 dark:bg-slate-500/15 dark:text-slate-400',
    priority: 1,
    dbAliases: ['unspec-b2b', 'unspec_b2b', 'UNSPEC B2B', 'UNSPEC_B2B'],
  },
  {
    key: 'non-numbering',
    label: 'Non Numbering',
    segment: 'b2b',
    color: 'bg-zinc-50 text-zinc-600 dark:bg-zinc-500/15 dark:text-zinc-400',
    priority: 1,
    dbAliases: ['non-numbering', 'non_numbering', 'NON NUMBERING', 'NON_NUMBERING'],
  },
  {
    key: 'astinet',
    label: 'Astinet',
    segment: 'b2b',
    color: 'bg-violet-50 text-violet-600 dark:bg-violet-500/15 dark:text-violet-400',
    priority: 1,
    dbAliases: ['astinet', 'ASTINET'],
  },
  {
    key: 'tsel',
    label: 'TSEL',
    segment: 'b2b',
    color: 'bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-400',
    priority: 1,
    dbAliases: ['tsel', 'TSEL'],
  },
  {
    key: 'vpn-ip',
    label: 'VPN IP',
    segment: 'b2b',
    color: 'bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400',
    priority: 1,
    dbAliases: ['vpn-ip', 'vpn_ip', 'vpn ip', 'vpnip', 'VPN IP'],
  },
  {
    key: 'metro-e',
    label: 'Metro-E',
    segment: 'b2b',
    color: 'bg-cyan-50 text-cyan-600 dark:bg-cyan-500/15 dark:text-cyan-400',
    priority: 1,
    dbAliases: ['metro-e', 'metro_e', 'METRO_E'],
  },
  {
    key: 'dwdm',
    label: 'DWDM',
    segment: 'b2b',
    color: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400',
    priority: 1,
    dbAliases: ['dwdm', 'DWDM'],
  },
] as const;

export type JenisKey = (typeof JENIS_TIKET_LIST)[number]['key'];

export const JENIS_KEYS = JENIS_TIKET_LIST.map((j) => j.key);

export const JENIS_LABELS = Object.fromEntries(
  JENIS_TIKET_LIST.map((j) => [j.key, j.label])
) as Record<string, string>;

export const JENIS_MAP = new Map(JENIS_TIKET_LIST.map((j) => [j.key, j]));

export const JENIS_ALIAS_LOOKUP = new Map<string, string>(
  JENIS_TIKET_LIST.flatMap((j) =>
    j.dbAliases.map((alias) => [alias.toLowerCase(), j.key]),
  ),
);

export const B2C_JENIS_KEYS = JENIS_TIKET_LIST.filter(
  (j) => j.segment === 'b2c',
).map((j) => j.key);

export const B2B_JENIS_KEYS = JENIS_TIKET_LIST.filter(
  (j) => j.segment === 'b2b',
).map((j) => j.key);

export function normalizeJenis(raw: string | null | undefined): JenisKey | '' {
  if (!raw) return '';
  const cleaned = raw.trim().toLowerCase().replace(/[\s_]/g, '-');
  const direct = JENIS_ALIAS_LOOKUP.get(cleaned);
  if (direct) return direct as JenisKey;
  for (const key of JENIS_TIKET_LIST.map((j) => j.key)) {
    if (cleaned.startsWith(key + '-') || cleaned === key)
      return key as JenisKey;
  }
  return '';
}

export function getJenisConfig(
  raw: string | null | undefined,
): JenisTiketConfig | null {
  const key = normalizeJenis(raw);
  return key ? (JENIS_MAP.get(key) ?? null) : null;
}

export function getJenisStyle(raw: string | null | undefined): string {
  const config = getJenisConfig(raw);
  return config?.color ?? 'bg-slate-100 text-slate-500 dark:bg-slate-500/15 dark:text-slate-400';
}

export function isB2CJenis(raw: string | null | undefined): boolean {
  const key = normalizeJenis(raw);
  return !key || B2C_JENIS_KEYS.includes(key);
}

export function isB2BJenis(raw: string | null | undefined): boolean {
  const key = normalizeJenis(raw);
  return !!key && B2B_JENIS_KEYS.includes(key);
}

export function getJenisSlaHours(
  raw: string | null | undefined,
): number | null {
  const config = getJenisConfig(raw);
  return config?.slaOverrideHours ?? null;
}

/**
 * Generates a Prisma where clause for filtering by jenis ticket.
 */
export function getJenisWhereClause(filterKey: string): { jenis_tiket_2: { in: string[] } } {
  const jenisConfig = JENIS_TIKET_LIST.find((j) => j.key === filterKey.toLowerCase());

  if (!jenisConfig || jenisConfig.dbAliases.length === 0) {
    return {
      jenis_tiket_2: { in: [filterKey, filterKey.toUpperCase()] },
    };
  }

  const dbVariants: string[] = [];
  for (const alias of jenisConfig.dbAliases) {
    dbVariants.push(alias);
    if (alias !== alias.toUpperCase()) {
      dbVariants.push(alias.toUpperCase());
    }
    if (alias.length > 1) {
      const capitalized = alias.charAt(0).toUpperCase() + alias.slice(1);
      if (capitalized !== alias && capitalized !== alias.toUpperCase()) {
        dbVariants.push(capitalized);
      }
    }
  }

  return {
    jenis_tiket_2: { in: [...new Set(dbVariants)] },
  };
}

/**
 * Checks if a raw database value matches a specific filter key.
 */
export function matchesJenisFilter(
  rawValue: string | null | undefined,
  filterKey: string,
): boolean {
  return normalizeJenis(rawValue) === filterKey.toLowerCase();
}

export const B2C_JENIS_ALIASES = JENIS_TIKET_LIST.filter(
  (j) => j.segment === 'b2c',
).flatMap((j) => j.dbAliases);

export const B2B_JENIS_ALIASES = JENIS_TIKET_LIST.filter(
  (j) => j.segment === 'b2b',
).flatMap((j) => j.dbAliases);

export function getB2CJenisWhereClause(): Record<string, unknown> {
  return {
    OR: [
      { jenis_tiket_2: { in: [...new Set(B2C_JENIS_ALIASES)] } },
      { jenis_tiket_2: null },
    ],
  };
}

export function getB2BJenisWhereClause(): { jenis_tiket_2: { in: string[] } } {
  return { jenis_tiket_2: { in: [...new Set(B2B_JENIS_ALIASES)] } };
}
