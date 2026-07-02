import {
  Antenna,
  Building2,
  ClipboardList,
  CreditCard,
  Fuel,
  Hash,
  Handshake,
  Link,
  Lightbulb,
  Package,
  PenSquare,
  Shield,
  Smartphone,
  Wifi,
  Globe,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface B2BGroup {
  key: string;
  label: string;
  icon: LucideIcon;
}

export const B2B_GROUPS: B2BGroup[] = [
  {
    key: 'datin',
    label: 'DATIN',
    icon: Antenna,
  },
  {
    key: 'indibiz',
    label: 'Indibiz',
    icon: Building2,
  },
  {
    key: 'sqm-ccan',
    label: 'SQM-CCAN',
    icon: ClipboardList,
  },
  {
    key: 'reseller',
    label: 'Reseller',
    icon: Handshake,
  },
  {
    key: 'wifi-id',
    label: 'WiFi-ID',
    icon: Wifi,
  },
  {
    key: 'digital-spbu',
    label: 'Digital SPBU',
    icon: Fuel,
  },
  {
    key: 'permintaan',
    label: 'Permintaan',
    icon: PenSquare,
  },
  {
    key: 'unspec-b2b',
    label: 'Unspec B2B',
    icon: Lightbulb,
  },
  {
    key: 'non-numbering',
    label: 'Non Numbering',
    icon: Hash,
  },
  {
    key: 'billing',
    label: 'Billing',
    icon: CreditCard,
  },
  {
    key: 'astinet',
    label: 'Astinet',
    icon: Globe,
  },
  {
    key: 'tsel',
    label: 'TSEL',
    icon: Smartphone,
  },
  {
    key: 'vpn-ip',
    label: 'VPN IP',
    icon: Shield,
  },
  {
    key: 'metro-e',
    label: 'Metro-E',
    icon: Link,
  },
  {
    key: 'dwdm',
    label: 'DWDM',
    icon: Package,
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
