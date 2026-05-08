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
] as const;

export type JenisKey = (typeof JENIS_TIKET_LIST)[number]['key'];

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
