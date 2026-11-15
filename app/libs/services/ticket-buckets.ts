import { Prisma } from '@prisma/client';
import { JENIS_MAP, normalizeJenis } from '@/app/config/jenis-tiket';
import {
  type AnomalyBucketKey,
  type OperationalBucketKey,
} from '@/app/config/operational-buckets';

function uniqueStrings(values: readonly (string | null | undefined)[]): string[] {
  return [...new Set(values.map((value) => String(value ?? '').trim()).filter(Boolean))];
}

function withVariants(values: readonly string[]) {
  // utf8mb4_unicode_ci collation is already case-insensitive, so case variants
  // are redundant and only bloat the IN list (which defeats the BTREE index).
  return { in: uniqueStrings(values) };
}

export function buildRegulerJenis1Where(): Prisma.ticketWhereInput {
  return {
    jenis_tiket_1: {
      in: uniqueStrings(['reguler', 'regular', 'reg']),
    },
  };
}

export function buildOperationalBucketWhere(
  bucket: OperationalBucketKey,
): Prisma.ticketWhereInput {
  return { operational_bucket: bucket };
}

export function buildAnomalyBucketWhere(
  bucket: AnomalyBucketKey,
): Prisma.ticketWhereInput {
  if (bucket === 'blank') {
    return {
      OR: [
        { jenis_tiket_2: null },
        { jenis_tiket_2: '' },
        { jenis_tiket_2: ' ' },
        { jenis_tiket_2: '-' },
        { jenis_tiket_2: '--' },
        { jenis_tiket_2: 'n/a' },
        { jenis_tiket_2: 'N/A' },
        { jenis_tiket_2: 'na' },
        { jenis_tiket_2: 'NA' },
      ],
    };
  }

  const config = JENIS_MAP.get(bucket);
  const aliases = config?.dbAliases ?? [bucket];
  return {
    jenis_tiket_2: withVariants(aliases),
  };
}

export function getAnomalyBucketForJenis(
  raw: string | null | undefined,
): AnomalyBucketKey | '' {
  const value = String(raw ?? '').trim();
  if (!value || ['-', '--', 'n/a', 'na'].includes(value.toLowerCase())) {
    return 'blank';
  }

  const normalized = normalizeJenis(value);
  if (normalized === 'unknown') return 'unknown';
  if (normalized === 'unspec') return 'unspec';
  return '';
}
