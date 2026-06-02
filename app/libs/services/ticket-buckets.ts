import { Prisma } from '@prisma/client';
import { JENIS_MAP, normalizeJenis } from '@/app/config/jenis-tiket';
import {
  type AnomalyBucketKey,
  type OperationalBucketKey,
  OPERATIONAL_BUCKET_DEFINITIONS,
} from '@/app/config/operational-buckets';

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.map((value) => String(value ?? '').trim()).filter(Boolean))];
}

function buildCaseVariants(values: readonly string[]): string[] {
  return uniqueStrings(
    values.flatMap((value) => [
      value,
      value.toLowerCase(),
      value.toUpperCase(),
      value.replace(/\b\w/g, c => c.toUpperCase()),
      value.replace(/\s+/g, ''),
      value.replace(/\s+/g, '').toLowerCase(),
      value.replace(/\s+/g, '').toUpperCase(),
    ]),
  );
}

function withVariants(values: readonly string[]) {
  return { in: buildCaseVariants(values) };
}

function containsAny(field: keyof Prisma.ticketWhereInput, values: readonly string[]): Prisma.ticketWhereInput {
  return {
    OR: values.flatMap((value) =>
      buildCaseVariants([value]).map((variant) => ({
        [field]: { contains: variant },
      })),
    ),
  };
}

export function buildRegulerJenis1Where(): Prisma.ticketWhereInput {
  return {
    jenis_tiket_1: {
      in: buildCaseVariants(['reguler', 'regular', 'reg']),
    },
  };
}

const NOT_OBSOLETE: Prisma.ticketWhereInput = { NOT: { classification_path: 'Z_PERMINTAAN_044' } };

export function buildOperationalBucketWhere(
  bucket: OperationalBucketKey,
): Prisma.ticketWhereInput {
  if (bucket === 'obsolete') {
    return { classification_path: 'Z_PERMINTAAN_044' };
  }

  const definition = OPERATIONAL_BUCKET_DEFINITIONS[bucket];

  const sourceVariants = buildCaseVariants(definition.sourceTicket);

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
        containsAny('jenis_tiket_2', ['digital_spbu', 'digital spbu']),
      ],
    });
  }

  clauses.push({ OR: flagClauses });

  if (definition.channel?.length) {
    clauses.push({ channel: withVariants(definition.channel) });
  }

  if (definition.jenisTiket1Filter?.length) {
    const jenisClauses = definition.jenisTiket1Filter.flatMap(jenis =>
      buildCaseVariants([jenis]).map(v => ({ jenis_tiket_1: { contains: v } }))
    );
    clauses.push({ OR: jenisClauses });
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
