import { Prisma } from '@prisma/client';
import { JENIS_MAP, normalizeJenis } from '@/app/config/jenis-tiket';
import {
  type AnomalyBucketKey,
  type OperationalBucketKey,
  OPERATIONAL_BUCKET_DEFINITIONS,
} from '@/app/config/operational-buckets';
import { CLOSE_STATUS_VALUES } from '@/app/libs/ticket-utils';

function uniqueStrings(values: readonly (string | null | undefined)[]): string[] {
  return [...new Set(values.map((value) => String(value ?? '').trim()).filter(Boolean))];
}

/**
 * Categorical fields (exact stored values, case-insensitive collation).
 * Equality IN is index-friendly; avoid FULLTEXT MATCH / LIKE wildcards here.
 */
const CATEGORICAL_FIELDS = new Set<keyof Prisma.ticketWhereInput>([
  'jenis_tiket_1',
  'jenis_tiket_2',
]);

function withVariants(values: readonly string[]) {
  // utf8mb4_unicode_ci collation is already case-insensitive, so case variants
  // are redundant and only bloat the IN list (which defeats the BTREE index).
  return { in: uniqueStrings(values) };
}

function containsAny(field: keyof Prisma.ticketWhereInput, values: readonly string[]): Prisma.ticketWhereInput {
  if (CATEGORICAL_FIELDS.has(field)) {
    return { [field]: { in: uniqueStrings(values) } };
  }
  // Genuine free-text (symptom): keep FULLTEXT MATCH, one term per value.
  return {
    OR: uniqueStrings(values).map((value) => ({
      [field]: { contains: value },
    })),
  };
}

export function buildRegulerJenis1Where(): Prisma.ticketWhereInput {
  return {
    jenis_tiket_1: {
      in: uniqueStrings(['reguler', 'regular', 'reg']),
    },
  };
}

const NOT_OBSOLETE: Prisma.ticketWhereInput = {
  OR: [
    { classification_path: null },
    { NOT: { classification_path: 'Z_PERMINTAAN_044' } },
  ],
};

export function buildOperationalBucketWhere(
  bucket: OperationalBucketKey,
): Prisma.ticketWhereInput {
  if (bucket === 'obsolete') {
    return { classification_path: 'Z_PERMINTAAN_044' };
  }

  const definition = OPERATIONAL_BUCKET_DEFINITIONS[bucket];

  const sourceVariants = uniqueStrings(definition.sourceTicket);

  const clauses: Prisma.ticketWhereInput[] = [
    { source_ticket: { in: sourceVariants } },
    NOT_OBSOLETE,
  ];

  if (bucket === 'non_kpi_unspec') {
    return {
      AND: [
        { source_ticket: { in: sourceVariants } },
        NOT_OBSOLETE,
        containsAny('jenis_tiket_1', ['unspec', 'unspec b2b']),
      ],
    };
  }

  if (bucket === 'kpi_proactive') {
    return {
      AND: [
        { source_ticket: { in: sourceVariants } },
        NOT_OBSOLETE,
        containsAny('jenis_tiket_1', ['sqm', 'sqm-ccan']),
        {
          OR: [
            { summary: null },
            { NOT: { summary: { startsWith: '[SQM-UPDATE]' } } },
          ],
        },
      ],
    };
  }

  if (bucket === 'non_technical') {
    return {
      AND: [
        NOT_OBSOLETE,
        {
          OR: [
            {
              AND: [
                { source_ticket: { in: sourceVariants } },
                {
                  OR: [
                    containsAny('jenis_tiket_1', ['unknown']),
                    containsAny('jenis_tiket_2', ['unknown']),
                    containsAny('jenis_tiket_1', ['permintaan', 'infracare', 'billing', 'digital_spbu', 'digital spbu', 'non numbering']),
                    containsAny('symptom', ['Z_NN_01_001']),
                    containsAny('jenis_tiket_2', ['digital_spbu', 'digital spbu']),
                  ],
                },
              ],
            },
            {
              OR: [
                { jenis_tiket_1: { equals: null } },
                { jenis_tiket_1: '' },
                { jenis_tiket_1: ' ' },
                containsAny('jenis_tiket_1', ['unknown']),
                containsAny('jenis_tiket_2', ['unknown']),
                containsAny('symptom', ['Z_NN_01_001']),
                containsAny('jenis_tiket_2', ['digital_spbu', 'digital spbu']),
              ],
            },
          ],
        },
      ],
    };
  }

  if (bucket === 'sqm_update') {
    return {
      AND: [
        { source_ticket: { in: sourceVariants } },
        NOT_OBSOLETE,
        containsAny('jenis_tiket_1', ['sqm', 'sqm-ccan']),
        { summary: { startsWith: '[SQM-UPDATE]' } },
        { status: { notIn: CLOSE_STATUS_VALUES } },
      ],
    };
  }

  if (bucket === 'kpi_customer') {
    return {
      AND: [
        { source_ticket: { in: sourceVariants } },
        NOT_OBSOLETE,
        {
          NOT: [
            {
              OR: [
                containsAny('jenis_tiket_1', ['unknown']),
                containsAny('jenis_tiket_2', ['unknown']),
                containsAny('jenis_tiket_1', ['permintaan', 'billing', 'digital_spbu', 'digital spbu']),
                containsAny('jenis_tiket_2', ['digital_spbu', 'digital spbu']),
              ],
            },
          ],
        },
        containsAny('jenis_tiket_1', definition.jenisTiket1Filter ?? []),
      ],
    };
  }

  const flagClauses: Prisma.ticketWhereInput[] = [];

  if (definition.classificationFlag.includes('NONTECHNICAL')) {
    flagClauses.push({
      OR: [
        containsAny('jenis_tiket_1', ['permintaan', 'infracare', 'billing', 'digital_spbu', 'digital spbu', 'non numbering']),
        containsAny('symptom', ['Z_NN_01_001']),
        containsAny('jenis_tiket_2', ['digital_spbu', 'digital spbu']),
      ],
    });
  }

  clauses.push({ OR: flagClauses });

  if (definition.channel?.length) {
    clauses.push({ channel: withVariants(definition.channel) });
  }

  if (definition.jenisTiket1Filter?.length) {
    clauses.push({
      jenis_tiket_1: { in: uniqueStrings(definition.jenisTiket1Filter) },
    });
  }

  return { AND: clauses };
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
