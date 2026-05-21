export interface B2BGroup {
  key: string;
  label: string;
  icon: string;
}

export const B2B_GROUPS: B2BGroup[] = [
  {
    key: 'datin',
    label: 'DATIN',
    icon: '📡',
  },
  {
    key: 'indibiz',
    label: 'Indibiz',
    icon: '🏢',
  },
  {
    key: 'sqm-ccan',
    label: 'SQM-CCAN',
    icon: '📋',
  },
  {
    key: 'reseller',
    label: 'Reseller',
    icon: '🤝',
  },
  {
    key: 'wifi-id',
    label: 'WiFi-ID',
    icon: '📶',
  },
  {
    key: 'digital-spbu',
    label: 'Digital SPBU',
    icon: '⛽',
  },
  {
    key: 'permintaan',
    label: 'Permintaan',
    icon: '📝',
  },
  {
    key: 'unspec-b2b',
    label: 'Unspec B2B',
    icon: '❓',
  },
  {
    key: 'non-numbering',
    label: 'Non Numbering',
    icon: '🔢',
  },
  {
    key: 'astinet',
    label: 'Astinet',
    icon: '🌐',
  },
  {
    key: 'tsel',
    label: 'TSEL',
    icon: '📱',
  },
  {
    key: 'vpn-ip',
    label: 'VPN IP',
    icon: '🔒',
  },
  {
    key: 'metro-e',
    label: 'Metro-E',
    icon: '🔗',
  },
  {
    key: 'dwdm',
    label: 'DWDM',
    icon: '💡',
  },
];

export const B2B_GROUP_MAP = new Map(B2B_GROUPS.map((g) => [g.key, g]));

export function getB2BGroup(key: string): B2BGroup | undefined {
  return B2B_GROUP_MAP.get(key);
}

export function getB2BGroupKey(jenisTiket1: string | null | undefined): string {
  if (!jenisTiket1) return 'unspec-b2b';
  const normalized = jenisTiket1.trim().toLowerCase().replace(/[\s_]/g, '-');
  return B2B_GROUPS.find(
    (g) => g.key === normalized || g.label.toLowerCase() === normalized
  )?.key ?? 'unspec-b2b';
}
