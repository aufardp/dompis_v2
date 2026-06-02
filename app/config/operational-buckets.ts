export type OperationalBucketKey =
  | 'kpi_customer'
  | 'kpi_proactive'
  | 'non_kpi_unspec'
  | 'non_technical'
  | 'sqm_update'
  | 'obsolete';

export type AnomalyBucketKey = 'unknown' | 'unspec' | 'blank';

export const B2C_CUSTOMER_SEGMENTS = ['DCS', 'PL-TSEL'] as const;

export const OPERATIONAL_ACTIVE_WORKZONES = [
  'DMO',
  'GBG',
  'IJK',
  'JGR',
  'MYR',
  'RKT',
  'KJR',
  'KPS',
  'KBL',
  'MGO',
  'KLN',
  'TNS',
  'KNN',
  'LKI',
  'KRP',
  'BKL',
  'KML',
  'BEA',
  'ARB',
  'TBU',
  'SPG',
  'OMB',
  'KPP',
  'PME',
  'WRP',
  'SMP',
  'PRG',
  'ABT',
  'BAB',
  'AJA',
  'SPD',
  'SPK',
  'MSL',
  'PRK',
] as const;

export const OPERATIONAL_KPI_STATUSES = [
  'ANALYSIS',
  'BACKEND',
  'DRAFT',
  'FINALCHECK',
  'PENDING',
] as const;

export const OPERATIONAL_KPI_CUSTOMER_SEGMENTS = [
  'RBS',
  'DGS',
  'DES',
  'DBS',
  'DSS',
  'DPS',
  'REG',
  'DWS',
  'DCS',
  'PL-TSEL',
] as const;

export interface OperationalBucketDefinition {
  key: OperationalBucketKey;
  label: string;
  description: string;
  sourceTicket: readonly string[];
  classificationFlag: readonly string[];
  channel?: readonly string[];
  jenisTiket1Filter?: readonly string[];
}

export const OPERATIONAL_BUCKET_DEFINITIONS: Record<OperationalBucketKey, OperationalBucketDefinition> = {
  kpi_customer: {
    key: 'kpi_customer',
    label: 'KPI Customer',
    description: 'Ticket KPI dari source CUSTOMER.',
    sourceTicket: ['CUSTOMER'],
    classificationFlag: ['TECHNICAL'],
    jenisTiket1Filter: [
      'reguler',
      'datin',
      'non datin',
      'tsel',
      'vpn ip',
      'ccan',
      'regular',
      'dwdm',
      'digital_spbu',
      'digital spbu',
      'astinet',
      'metro-e',
      'indibiz',
      'reseller',
      'wifi-id',
    ],
  },
  kpi_proactive: {
    key: 'kpi_proactive',
    label: 'KPI Proactive',
    description: 'Ticket KPI dari source PROACTIVE dengan channel 50/83.',
    sourceTicket: ['PROACTIVE'],
    classificationFlag: ['TECHNICAL'],
    channel: ['50', '83'],
    jenisTiket1Filter: ['sqm', 'sqm-ccan'],
  },
  non_kpi_unspec: {
    key: 'non_kpi_unspec',
    label: 'Non KPI Unspec',
    description: 'Ticket Non-KPI Unspec dari PROACTIVE channel 28.',
    sourceTicket: ['PROACTIVE'],
    classificationFlag: ['TECHNICAL'],
    channel: ['28'],
    jenisTiket1Filter: ['unspec', 'unspec b2b'],
  },
  non_technical: {
    key: 'non_technical',
    label: 'Non Technical',
    description: 'Ticket Non-Technical dan unknown yang perlu ditangani manual.',
    sourceTicket: ['CUSTOMER', 'PROACTIVE'],
    classificationFlag: ['NONTECHNICAL', 'BILLING'],
    jenisTiket1Filter: [
      'permintaan',
      'infracare',
      'billing',
      'digital_spbu',
      'digital spbu',
      'unknown',
      'non numbering',
    ],
  },
  sqm_update: {
    key: 'sqm_update',
    label: 'SQM Update',
    description: 'Ticket SQM yang sudah di-flag update dengan headline [SQM-UPDATE].',
    sourceTicket: ['PROACTIVE'],
    classificationFlag: ['TECHNICAL'],
    jenisTiket1Filter: ['sqm', 'sqm-ccan'],
  },
  obsolete: {
    key: 'obsolete',
    label: 'Obsolete',
    description: 'Ticket dengan classification_path Z_PERMINTAAN_044.',
    sourceTicket: [],
    classificationFlag: [],
  },
};

export function normalizeOperationalBucketKey(
  raw: string | null | undefined,
): OperationalBucketKey | '' {
  const value = String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');

  if (value === 'kpi_customer') return 'kpi_customer';
  if (value === 'kpi_proactive') return 'kpi_proactive';
  if (value === 'non_kpi_unspec') return 'non_kpi_unspec';
  if (value === 'non_technical') return 'non_technical';
  if (value === 'sqm_update') return 'sqm_update';
  if (value === 'obsolete') return 'obsolete';
  return '';
}

export function normalizeAnomalyBucketKey(
  raw: string | null | undefined,
): AnomalyBucketKey | '' {
  const value = String(raw ?? '')
    .trim()
    .toLowerCase();

  if (value === 'unknown') return 'unknown';
  if (value === 'unspec') return 'unspec';
  if (value === 'blank') return 'blank';
  return '';
}
