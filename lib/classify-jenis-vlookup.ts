/**
 * Jenis Tiket Classifier v2 — berbasis source_vlookup
 *
 * Menggantikan lib/classify-jenis-tiket.ts yang menggunakan source_table + mirror_database.
 *
 * B2C detection: customer_segment IN ('PL-TSEL', 'DCS')
 * B2B detection: selain itu
 *
 * B2C:
 *   jenis_tiket_1: channel → source_vlookup.value_id → jenis_tiket
 *   jenis_tiket_2: customer_type → source_vlookup.customer_type_key → jenis_tiket_2_val
 *
 * B2B:
 *   jenis_tiket_2: service_type → source_vlookup.realm_b2b → flag_1
 *   jenis_tiket_1: diturunkan dari jenis_tiket_2
 */

import { prisma } from '@/app/libs/prisma';
import { logger } from '@/lib/observability/logger';
import { isB2CJenis, isB2BJenis } from '@/app/config/jenis-tiket';

// ── Cache ─────────────────────────────────────────────────────────────────────

interface VlookupCache {
  byValueId: Map<number, SourceVlookupRow>;
  byCustomerTypeKey: Map<string, SourceVlookupRow>;
  byRealmB2b: Map<string, SourceVlookupRow>;
  lastRefresh: number;
}

interface SourceVlookupRow {
  valueId: number;
  description: string | null;
  jenisTiket: string | null;
  customerTypeKey: string | null;
  jenisTiket2Val: string | null;
  realmB2b: string | null;
  flag1: string | null;
  flag2: string | null;
}

const CACHE_TTL_MS = 10 * 60 * 1000;

let vlookupCache: VlookupCache = {
  byValueId: new Map(),
  byCustomerTypeKey: new Map(),
  byRealmB2b: new Map(),
  lastRefresh: 0,
};

export async function refreshVlookupCache(): Promise<void> {
  const now = Date.now();
  if (now - vlookupCache.lastRefresh < CACHE_TTL_MS) return;

  try {
    const rows = await prisma.sourceVlookup.findMany({
      select: {
        value_id: true,
        description: true,
        jenis_tiket: true,
        customer_type_key: true,
        jenis_tiket_2_val: true,
        realm_b2b: true,
        flag_1: true,
        flag_2: true,
      },
    });

    vlookupCache.byValueId = new Map();
    vlookupCache.byCustomerTypeKey = new Map();
    vlookupCache.byRealmB2b = new Map();

    for (const r of rows) {
      const row: SourceVlookupRow = {
        valueId: r.value_id,
        description: r.description,
        jenisTiket: r.jenis_tiket,
        customerTypeKey: r.customer_type_key,
        jenisTiket2Val: r.jenis_tiket_2_val,
        realmB2b: r.realm_b2b,
        flag1: r.flag_1,
        flag2: r.flag_2,
      };

      if (r.value_id) vlookupCache.byValueId.set(r.value_id, row);
      if (r.customer_type_key) vlookupCache.byCustomerTypeKey.set(r.customer_type_key.toUpperCase(), row);
      if (r.realm_b2b) vlookupCache.byRealmB2b.set(r.realm_b2b.toUpperCase(), row);
    }

    vlookupCache.lastRefresh = now;
    logger.info('[JenisVlookup] Cache refreshed:', {
      byValueId: vlookupCache.byValueId.size,
      byCustomerTypeKey: vlookupCache.byCustomerTypeKey.size,
      byRealmB2b: vlookupCache.byRealmB2b.size,
    });
  } catch (error) {
    logger.error('[JenisVlookup] Failed to refresh cache:', { error: String(error) });
  }
}

export function resetVlookupCache(): void {
  vlookupCache = {
    byValueId: new Map(),
    byCustomerTypeKey: new Map(),
    byRealmB2b: new Map(),
    lastRefresh: 0,
  };
}

// ── Input / Output ────────────────────────────────────────────────────────────

export interface JenisVlookupInput {
  channel: string | null;
  classification_flag?: string | null;
  classification_path: string | null;
  customer_type: string | null;
  customer_segment: string | null;
  service_type: string | null;
  service_no: string | null;
  source_ticket: string | null;
  realm: string | null;
  summary: string | null;
  symptom?: string | null;
}

export interface JenisVlookupResult {
  jenis_tiket_1: string | null;
  jenis_tiket_2: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isB2C(customerSegment: string | null): boolean {
  const seg = (customerSegment ?? '').trim().toUpperCase();
  return seg === 'PL-TSEL' || seg === 'DCS';
}

function like(str: string | null, pattern: string): boolean {
  if (!str) return false;
  return str.toUpperCase().includes(pattern.toUpperCase());
}

/**
 * Jika service_type = SITE atau customer_segment = DWS → TSEL.
 */
function checkTselOverride(input: JenisVlookupInput): JenisVlookupResult | null {
  const st = (input.service_type ?? '').trim().toUpperCase();
  const cs = (input.customer_segment ?? '').trim().toUpperCase();
  if (st === 'SITE' || cs === 'DWS') {
    return { jenis_tiket_1: 'TSEL', jenis_tiket_2: 'TSEL' };
  }
  return null;
}

/**
 * Summary marker [Infracare] adalah indikator langsung, tidak bergantung segmen.
 */
function checkInfraCareOverride(input: JenisVlookupInput): JenisVlookupResult | null {
  if (like(input.summary, '[Infracare]')) {
    return { jenis_tiket_1: 'INFRACARE', jenis_tiket_2: 'INFRACARE' };
  }
  return null;
}

/**
 * Service type NON-NUMBERING harus keluar dari KPI Customer dan masuk Non Technical.
 */
function checkNonNumberingOverride(
  input: JenisVlookupInput,
): JenisVlookupResult | null {
  const serviceType = (input.service_type ?? '').trim().toUpperCase();
  const symptom = (input.symptom ?? '').trim().toUpperCase();
  const serviceNo = (input.service_no ?? '').trim().toUpperCase();
  if (
    serviceType === 'NON-NUMBERING' ||
    serviceType === 'NON NUMBERING' ||
    serviceType === 'NON_NUMBERING' ||
    symptom === 'Z_NN_01_001' ||
    serviceNo === 'NN' ||
    like(input.classification_path, 'Z_NN')
  ) {
    return {
      jenis_tiket_1: 'NON NUMBERING',
      jenis_tiket_2: 'NON NUMBERING',
    };
  }

  return null;
}

/**
 * classification_flag = BILLING harus masuk Non Technical.
 */
function checkBillingOverride(
  input: JenisVlookupInput,
): JenisVlookupResult | null {
  const classificationFlag = (input.classification_flag ?? '').trim().toUpperCase();

  if (classificationFlag === 'BILLING') {
    return {
      jenis_tiket_1: 'BILLING',
      jenis_tiket_2: 'BILLING',
    };
  }

  return null;
}

/**
 * Jika symptom = TECHNICAL (exact) atau mengandung PROACTIVE MAINTENANCE UNSPEC → UNSPEC.
 * Hanya berlaku untuk B2C.
 */
function checkUnspecBySymptomOverride(input: JenisVlookupInput): JenisVlookupResult | null {
  if (!isB2C(input.customer_segment)) return null;
  const symptom = (input.symptom ?? '').trim().toUpperCase();
  if (symptom === 'TECHNICAL' || symptom.includes('PROACTIVE MAINTENANCE UNSPEC')) {
    return { jenis_tiket_1: 'UNSPEC', jenis_tiket_2: 'UNSPEC' };
  }
  return null;
}

function validateConsistency(input: JenisVlookupInput, result: JenisVlookupResult): void {
  const isB2cInput = isB2C(input.customer_segment);
  const expected = isB2cInput ? 'b2c' : 'b2b';

  const check = (field: string, value: string | null, label: string) => {
    if (!value) return;
    const isB2c = isB2CJenis(value);
    const isB2b = isB2BJenis(value);
    if (!isB2c && !isB2b) return;
    if (isB2c && isB2b) return; // cross-segment (e.g. permintaan), skip

    const actual = isB2c ? 'b2c' : 'b2b';
    if (actual !== expected) {
      logger.warn('[CLASSIFY-MISMATCH]', {
        field: label,
        value,
        customer_segment: input.customer_segment,
        customer_type: input.customer_type,
        service_type: input.service_type,
        expected,
        actual,
      });
    }
  };

  check('jenis_tiket_1', result.jenis_tiket_1, 'jenis_tiket_1');
  check('jenis_tiket_2', result.jenis_tiket_2, 'jenis_tiket_2');
}

// ── B2C Classification ───────────────────────────────────────────────────────

function classifyB2C(input: JenisVlookupInput): JenisVlookupResult {
  const { channel, classification_path, customer_type, service_type } = input;

  // service_type = DIGITAL_SPBU (prioritas tertinggi)
  if ((service_type ?? '').trim().toUpperCase() === 'DIGITAL_SPBU') {
    return { jenis_tiket_1: 'DIGITAL_SPBU', jenis_tiket_2: 'DIGITAL_SPBU' };
  }

  // jenis_tiket_1
  let jenis1: string | null = null;

  if (like(classification_path, 'Z_PERMINTAAN')) {
    jenis1 = 'PERMINTAAN';
  } else if (channel) {
    const channelId = parseInt(channel, 10);
    if (!isNaN(channelId)) {
      const vlookup = vlookupCache.byValueId.get(channelId);
      if (vlookup?.jenisTiket) {
        jenis1 = vlookup.jenisTiket;
      }
    }
  }

  // jenis_tiket_2
  let jenis2: string | null = null;

  if (jenis1) {
    const jt1Upper = jenis1.toUpperCase();
    const passThrough = ['SQM', 'CCAN', 'CCAN-PREV', 'UNSPEC', 'PERMINTAAN', 'INFRACARE'];
    if (passThrough.includes(jt1Upper)) {
      jenis2 = jenis1;
    } else if (jt1Upper === 'REGULER' || jt1Upper === 'REGULAR') {
      if (customer_type) {
        const vlookup = vlookupCache.byCustomerTypeKey.get(customer_type.toUpperCase());
        if (vlookup?.jenisTiket2Val) {
          jenis2 = vlookup.jenisTiket2Val;
        }
      }
    }
  }

  if (!jenis1) jenis1 = 'UNKNOWN';
  if (!jenis2) jenis2 = 'UNKNOWN';

  return { jenis_tiket_1: jenis1, jenis_tiket_2: jenis2 };
}

// ── B2B Classification ───────────────────────────────────────────────────────

function classifyB2B(input: JenisVlookupInput): JenisVlookupResult {
  const { classification_path, service_type, service_no, source_ticket, realm } = input;

  // ── Compute jenis_tiket_2 first ──

  let jenis2: string | null = null;

  // 1. classification_path keywords
  if (like(classification_path, 'Z_NN')) {
    jenis2 = 'NON NUMBERING';
  } else if (like(classification_path, 'C_PROACTIVE_005_009')) {
    jenis2 = 'UNSPEC B2B';
  } else if (like(classification_path, 'Z_PERMINTAAN')) {
    jenis2 = 'PERMINTAAN';
  }
  // 2. service_type = DWDM
  else if ((service_type ?? '').trim().toUpperCase() === 'DWDM') {
    jenis2 = 'DWDM';
  }
  // 3. service_type = DIGITAL_SPBU
  else if ((service_type ?? '').trim().toUpperCase() === 'DIGITAL_SPBU') {
    jenis2 = 'DIGITAL_SPBU';
  }
  // 4. service_no kosong
  else if (!service_no || !service_no.trim()) {
    jenis2 = null;
  }
  // 4. source_ticket = PROACTIVE
  else if ((source_ticket ?? '').trim().toUpperCase() === 'PROACTIVE') {
    jenis2 = 'SQM-CCAN';
  }
  // 5. source_ticket = CUSTOMER
  else if ((source_ticket ?? '').trim().toUpperCase() === 'CUSTOMER') {
    const st = (service_type ?? '').trim().toUpperCase();
    const rm = (realm ?? '').trim().toLowerCase();

    if (st === 'VPN IP') {
      jenis2 = 'VPN IP';
    } else if (rm === 'telkom.b2b') {
      jenis2 = 'INDIBIZ';
    } else if (st) {
      const vlookup = vlookupCache.byRealmB2b.get(st);
      if (vlookup?.flag1) {
        if (vlookup.flag1.toUpperCase() === 'DATIN') {
          jenis2 = like(service_no, 'K2') ? 'DATIN - K2' : 'DATIN';
        } else {
          jenis2 = vlookup.flag1;
        }
      }
    }
  }

  // ── Compute jenis_tiket_1 based on jenis_tiket_2 ──

  let jenis1: string | null = null;

  // 1. classification_path keywords
  if (like(classification_path, 'Z_NN')) {
    jenis1 = 'NON NUMBERING';
  } else if (like(classification_path, 'Z_PERMINTAAN')) {
    jenis1 = 'PERMINTAAN';
  } else if (like(classification_path, 'C_PROACTIVE_005_009')) {
    jenis1 = 'UNSPEC B2B';
  }
  // 2. jenis_tiket_2 = DWDM
  else if ((jenis2 ?? '').toUpperCase() === 'DWDM') {
    jenis1 = 'DWDM';
  }
  // 3. jenis_tiket_2 = DIGITAL_SPBU
  else if ((jenis2 ?? '').toUpperCase() === 'DIGITAL_SPBU') {
    jenis1 = 'DIGITAL_SPBU';
  }
  // 4. jenis_tiket_2 IN (VPNIP, VPN IP, SIP_TRUNK, ASTINET, METRO-E, METRO_E, IP_TRANSIT)
  else if (jenis2) {
    const jt2Upper = jenis2.toUpperCase().replace(/-/g, '_');
    const datinValues = ['VPNIP', 'VPN_IP', 'SIP_TRUNK', 'ASTINET', 'METRO_E', 'IP_TRANSIT'];
    if (datinValues.includes(jt2Upper)) {
      jenis1 = 'DATIN';
    }
  // 4. jenis_tiket_2 kosong → NULL (handled below)
    // 5. source_ticket = PROACTIVE
    else if ((source_ticket ?? '').trim().toUpperCase() === 'PROACTIVE') {
      jenis1 = 'SQM-CCAN';
    }
    // 6. source_ticket = CUSTOMER
    else if ((source_ticket ?? '').trim().toUpperCase() === 'CUSTOMER') {
      if (like(jenis2, 'DATIN')) {
        jenis1 = 'DATIN';
      } else {
        const nonDatinValues = ['RESELLER', 'WIFI-ID', 'INDIBIZ', 'HVC-EBIS', 'HSI-EBIS'];
        if (nonDatinValues.includes(jenis2.toUpperCase())) {
          jenis1 = 'NON DATIN';
        } else {
          jenis1 = jenis2;
        }
      }
    }
  }

  // Fallback: if classification could not determine a value, use UNKNOWN
  if (!jenis1) jenis1 = 'UNKNOWN';
  if (!jenis2) jenis2 = 'UNKNOWN';

  return { jenis_tiket_1: jenis1, jenis_tiket_2: jenis2 };
}

// ── Main Entry Point ──────────────────────────────────────────────────────────

export async function classifyJenisFromVlookup(
  input: JenisVlookupInput,
): Promise<JenisVlookupResult> {
  await refreshVlookupCache();

  const override = checkTselOverride(input);
  if (override) return override;

  const infraCareOverride = checkInfraCareOverride(input);
  if (infraCareOverride) return infraCareOverride;

  const nonNumberingOverride = checkNonNumberingOverride(input);
  if (nonNumberingOverride) return nonNumberingOverride;

  const billingOverride = checkBillingOverride(input);
  if (billingOverride) return billingOverride;

  const unspecOverride = checkUnspecBySymptomOverride(input);
  if (unspecOverride) return unspecOverride;

  const result = isB2C(input.customer_segment)
    ? classifyB2C(input)
    : classifyB2B(input);

  validateConsistency(input, result);
  return result;
}

/**
 * Batch classify — lebih efisien karena cache di-refresh sekali di awal.
 */
export async function batchClassifyJenisFromVlookup(
  inputs: JenisVlookupInput[],
): Promise<JenisVlookupResult[]> {
  await refreshVlookupCache();

  return inputs.map((input) => {
    const override = checkTselOverride(input);
    if (override) return override;

    const infraCareOverride = checkInfraCareOverride(input);
    if (infraCareOverride) return infraCareOverride;

    const nonNumberingOverride = checkNonNumberingOverride(input);
    if (nonNumberingOverride) return nonNumberingOverride;

    const billingOverride = checkBillingOverride(input);
    if (billingOverride) return billingOverride;

    const unspecOverride = checkUnspecBySymptomOverride(input);
    if (unspecOverride) return unspecOverride;

    const result = isB2C(input.customer_segment)
      ? classifyB2C(input)
      : classifyB2B(input);

    validateConsistency(input, result);
    return result;
  });
}
