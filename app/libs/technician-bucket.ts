import type { OperationalBucketKey } from '@/app/config/operational-buckets';

export type TechnicianBucketKey = OperationalBucketKey | 'unknown';

export type TechnicianBucketSource = {
  source_ticket?: string | null;
  classification_flag?: string | null;
  classification_path?: string | null;
  channel?: string | null;
  summary?: string | null;
  jenis_tiket_1?: string | null;
  jenis_tiket_2?: string | null;
};

function trimLower(value: string | null | undefined): string {
  return String(value ?? '').trim().toLowerCase();
}

function hasJenis(value: string | null | undefined, needles: readonly string[]): boolean {
  const text = trimLower(value).replace(/[\s_]+/g, '');
  if (!text) return false;
  return needles.some((needle) => text.includes(needle.toLowerCase().replace(/[\s_]+/g, '')));
}

function isObsolete(source: TechnicianBucketSource): boolean {
  return trimLower(source.classification_path) === 'z_permintaan_044';
}

function isNonTechnical(source: TechnicianBucketSource): boolean {
  const classification = trimLower(source.classification_flag);
  const jenis1 = trimLower(source.jenis_tiket_1);
  const jenis2 = trimLower(source.jenis_tiket_2);
  return (
    classification.includes('nontechnical') ||
    classification.includes('non technical') ||
    classification.includes('billing') ||
    jenis1.includes('unknown') ||
    jenis2.includes('unknown') ||
    jenis1.includes('permintaan') ||
    jenis1.includes('infracare') ||
    jenis1.includes('billing') ||
    jenis1.includes('digital_spbu') ||
    jenis1.includes('digital spbu') ||
    jenis1.includes('non numbering') ||
    jenis2.includes('digital_spbu') ||
    jenis2.includes('digital spbu')
  );
}

export function classifyTechnicianBucket(
  source: TechnicianBucketSource,
): TechnicianBucketKey {
  if (isObsolete(source)) return 'obsolete';
  if (isNonTechnical(source)) return 'non_technical';

  const sourceTicket = trimLower(source.source_ticket);
  const channel = trimLower(source.channel);
  const summary = String(source.summary ?? '').trim();

  const isCustomer = sourceTicket === 'customer';
  const isProactive = sourceTicket === 'proactive';
  const isSqm = hasJenis(source.jenis_tiket_1, ['sqm', 'sqm-ccan']);
  const isUnspec = hasJenis(source.jenis_tiket_2, ['unspec', 'unspec b2b']);

  if (isProactive && channel === '28' && isUnspec) return 'non_kpi_unspec';
  if (isProactive && summary.startsWith('[SQM-UPDATE]') && isSqm) return 'sqm_update';
  if (isProactive && (channel === '50' || channel === '83') && isSqm) return 'kpi_proactive';

  if (isCustomer) return 'kpi_customer';
  if (isProactive) return isSqm ? 'kpi_proactive' : 'non_kpi_unspec';

  return 'unknown';
}

export function getTechnicianBucketLabel(bucket: TechnicianBucketKey): string {
  switch (bucket) {
    case 'kpi_customer':
      return 'Customer';
    case 'kpi_proactive':
      return 'Proactive';
    case 'non_kpi_unspec':
      return 'Unspec';
    case 'non_technical':
      return 'Non Technical';
    case 'sqm_update':
      return 'SQM Update';
    case 'obsolete':
      return 'Obsolete';
    default:
      return 'Unknown';
  }
}
