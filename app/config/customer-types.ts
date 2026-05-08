export interface CustomerTypeConfig {
  key: string;
  label: string;
  shortLabel?: string;
  icon: string;
  color: string;
  bg: string;
  priority: number;
  slaHours: number;
  segment: 'b2c' | 'b2b';
  dbAliases: string[];
}

export const CUSTOMER_TYPES: CustomerTypeConfig[] = [
  {
    key: 'HVC_DIAMOND',
    label: 'HVC Diamond',
    shortLabel: 'Diamond',
    icon: '🔷',
    color: 'text-sky-600 dark:text-sky-300',
    bg: 'bg-sky-50 dark:bg-sky-500/15',
    priority: 4,
    slaHours: 3,
    segment: 'b2c',
    dbAliases: [
      'HVC_DIAMOND',
      'hvc_diamond',
      'HVC DIAMOND',
      'diamond',
      'DIAMOND',
    ],
  },
  {
    key: 'HVC_PLATINUM',
    label: 'HVC Platinum',
    shortLabel: 'Platinum',
    icon: '💎',
    color: 'text-indigo-600 dark:text-indigo-300',
    bg: 'bg-indigo-50 dark:bg-indigo-500/15',
    priority: 3,
    slaHours: 6,
    segment: 'b2c',
    dbAliases: [
      'HVC_PLATINUM',
      'hvc_platinum',
      'HVC PLATINUM',
      'platinum',
      'PLATINUM',
    ],
  },
  {
    key: 'HVC_GOLD',
    label: 'HVC Gold',
    shortLabel: 'Gold',
    icon: '⭐',
    color: 'text-amber-600 dark:text-amber-300',
    bg: 'bg-amber-50 dark:bg-amber-500/15',
    priority: 2,
    slaHours: 12,
    segment: 'b2c',
    dbAliases: ['HVC_GOLD', 'hvc_gold', 'HVC GOLD', 'gold', 'GOLD'],
  },
  {
    key: 'REGULER',
    label: 'Reguler',
    shortLabel: 'Reg',
    icon: '👤',
    color: 'text-emerald-600 dark:text-emerald-400',
    bg: 'bg-emerald-50 dark:bg-emerald-500/15',
    priority: 1,
    slaHours: 24,
    segment: 'b2c',
    dbAliases: ['REGULER', 'reguler', 'REGULAR', 'regular'],
  },
] as const;

export type CustomerTypeKey = (typeof CUSTOMER_TYPES)[number]['key'];

export const CUSTOMER_TYPE_MAP = new Map(
  CUSTOMER_TYPES.map((ct) => [ct.key, ct]),
);

export const CUSTOMER_TYPE_ALIAS_MAP = new Map<string, string>(
  CUSTOMER_TYPES.flatMap((ct) =>
    ct.dbAliases.map((alias) => [alias.toLowerCase(), ct.key]),
  ),
);

export const SLA_HOURS_MAP = new Map(
  CUSTOMER_TYPES.map((ct) => [ct.key, ct.slaHours]),
);

export const CUSTOMER_PRIORITY_MAP = new Map(
  CUSTOMER_TYPES.map((ct) => [ct.key, ct.priority]),
);

export function normalizeCustomerType(
  raw: string | null | undefined,
): CustomerTypeKey | '' {
  if (!raw) return '';
  const normalized = raw.trim().toLowerCase();
  return (CUSTOMER_TYPE_ALIAS_MAP.get(normalized) as CustomerTypeKey) ?? '';
}

export function getCustomerTypeConfig(
  raw: string | null | undefined,
): CustomerTypeConfig {
  const key = normalizeCustomerType(raw);
  return CUSTOMER_TYPE_MAP.get(key) ?? CUSTOMER_TYPES[3];
}

export function getSlaHours(raw: string | null | undefined): number {
  const key = normalizeCustomerType(raw);
  return SLA_HOURS_MAP.get(key) ?? 24;
}

export function getCustomerPriority(raw: string | null | undefined): number {
  const key = normalizeCustomerType(raw);
  return CUSTOMER_PRIORITY_MAP.get(key) ?? 0;
}
