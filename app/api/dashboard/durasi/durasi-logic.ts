import type { DurasiPanelType } from '@/app/components/dashboard/durasi/durasi-types';
import { normalizeJenis } from '@/app/config/jenis-tiket';
import { isSqmUpdateRow } from '@/lib/sqm-update';

export const STANDARD_BUCKETS = ['0-3J', '3-6J', '6-12J', '12-24J', '24-36J', '>36J'] as const;
export const MANJA_BUCKETS = ['0-1d', '1-2d', '2-3d', 'EXPIRED'] as const;
export const HSI_BUCKETS = ['<1h', '<3h', '<4h', '<12h', '<24h', 'EXPIRED'] as const;

export interface DurasiPanelTicket {
  customer_type?: string | null;
  jenis_tiket?: string | null;
  jenis_tiket_1?: string | null;
  jenis_tiket_2?: string | null;
  flagging_manja?: string | null;
  guarantee_status?: string | null;
  ticket_id_gamas?: string | null;
  summary?: string | null;
  sqm_update_reason?: string | null;
  reported_date?: string | null;
  closed_at?: string | null;
}

export function normalizeText(value: string | null | undefined): string {
  return String(value ?? '').trim().toLowerCase();
}

export function calculateDurationHours(reportedDate: string | null): number | null {
  if (!reportedDate) return null;
  const reported = new Date(reportedDate);
  if (Number.isNaN(reported.getTime())) return null;
  const now = new Date();
  return (now.getTime() - reported.getTime()) / 3_600_000;
}

export function bucketStandard(hours: number | null): number {
  if (hours === null) return 5;
  if (hours <= 3) return 0;
  if (hours <= 6) return 1;
  if (hours <= 12) return 2;
  if (hours <= 24) return 3;
  if (hours <= 36) return 4;
  return 5;
}

export function bucketManja(row: Pick<DurasiPanelTicket, 'flagging_manja' | 'reported_date' | 'closed_at'>): number {
  if (normalizeText(row.flagging_manja) === 'expired') return 3;
  if (!row.reported_date) return 3;
  const start = new Date(row.reported_date);
  if (Number.isNaN(start.getTime())) return 3;
  const end = row.closed_at ? new Date(row.closed_at) : new Date();
  if (Number.isNaN(end.getTime())) return 3;
  const days = (end.getTime() - start.getTime()) / 86_400_000;
  if (days <= 1) return 0;
  if (days <= 2) return 1;
  if (days <= 3) return 2;
  return 3;
}

export function bucketHSI(hours: number | null): number {
  if (hours === null) return 5;
  if (hours < 1) return 0;
  if (hours < 3) return 1;
  if (hours < 4) return 2;
  if (hours < 12) return 3;
  if (hours < 24) return 4;
  return 5;
}

export function isManjaTicket(ticket: Pick<DurasiPanelTicket, 'flagging_manja' | 'jenis_tiket' | 'jenis_tiket_1' | 'jenis_tiket_2'>): boolean {
  const combinedJenis = normalizeText(
    `${ticket.jenis_tiket ?? ''} ${ticket.jenis_tiket_1 ?? ''} ${ticket.jenis_tiket_2 ?? ''}`,
  );
  return Boolean(ticket.flagging_manja) || combinedJenis.includes('manja');
}

export function matchesDurasiPanel(ticket: DurasiPanelTicket, panelType: DurasiPanelType): boolean {
  const customerType = normalizeText(ticket.customer_type).toUpperCase();
  const jenis = normalizeText(
    `${ticket.jenis_tiket ?? ''} ${ticket.jenis_tiket_1 ?? ''} ${ticket.jenis_tiket_2 ?? ''}`,
  );
  const jenisKey = normalizeJenis(jenis);

  switch (panelType) {
    case 'REGULER':
      return customerType === 'REGULER';
    case 'HVC_DIAMOND_PLATINUM':
      return ['HVC_DIAMOND', 'HVC_PLATINUM'].includes(customerType);
    case 'HVC_GOLD':
      return customerType === 'HVC_GOLD';
    case 'MANJA':
      return isManjaTicket(ticket);
    case 'FFG':
      return normalizeText(ticket.guarantee_status) === 'guarantee';
    case 'SQM_UPDATE':
      return isSqmUpdateRow(ticket);
    case 'SQM':
      return jenisKey === 'sqm' || jenisKey === 'sqm-ccan';
    case 'ANAK_GAMAS':
      return jenisKey === 'gamas';
    case 'HSI': {
      const jenis2Key = normalizeJenis(ticket.jenis_tiket_2);
      return jenis2Key === 'indibiz' || jenis2Key === 'reseller';
    }
    case 'TSEL':
      return jenisKey === 'tsel';
    case 'DATIN':
      return jenisKey === 'datin';
    case 'UNSPEC': {
      const jenis2Key = normalizeJenis(ticket.jenis_tiket_2);
      return jenis2Key === 'unspec' || jenis2Key === 'unspec-b2b';
    }
    default:
      return false;
  }
}

export function bucketLabelFor(panelType: DurasiPanelType, bucketIndex: number): string {
  if (panelType === 'MANJA' || panelType === 'FFG') return MANJA_BUCKETS[bucketIndex] ?? '-';
  if (panelType === 'HSI') return HSI_BUCKETS[bucketIndex] ?? '-';
  return STANDARD_BUCKETS[bucketIndex] ?? '-';
}

export function panelLabel(panelType: DurasiPanelType): string {
  const labels: Record<DurasiPanelType, string> = {
    REGULER: 'REGULER',
    HVC_DIAMOND_PLATINUM: 'HVC DIAMOND & PLATINUM',
    HVC_GOLD: 'HVC GOLD',
    MANJA: 'MANJA',
    FFG: 'FFG',
    SQM_UPDATE: 'SQM UPDATE',
    SQM: 'SQM',
    ANAK_GAMAS: 'GAMAS',
    HSI: 'HSI',
    TSEL: 'TSEL',
    DATIN: 'DATIN',
    UNSPEC: 'UNSPEC',
  };
  return labels[panelType];
}

export function bucketIndexForPanel(ticket: DurasiPanelTicket, panelType: DurasiPanelType): number {
  const durationHours = calculateDurationHours(ticket.reported_date ?? null);
  if (panelType === 'MANJA' || panelType === 'FFG') return bucketManja(ticket);
  if (panelType === 'HSI') return bucketHSI(durationHours);
  return bucketStandard(durationHours);
}
