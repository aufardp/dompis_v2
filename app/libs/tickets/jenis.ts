/**
 * Centralized jenis ticket matching logic.
 * Single source of truth for all jenis-related operations.
 *
 * Handles inconsistent data from Google Sheets sync:
 * - Case variations (SQM, sqm, Sqm)
 * - Separator variations (sqm-ccan, sqm_ccan, sqm ccan)
 * - Common typos (regular vs reguler)
 * - Extended variants (datin enterprise, indibiz pro)
 */

export const JENIS_KEYS = [
  'reguler',
  'sqm',
  'sqm-ccan',
  'hvc',
  'unspec',
  'indibiz',
  'datin',
  'reseller',
  'wifi-id',
] as const;

export type JenisKey = typeof JENIS_KEYS[number];

// ← ADDED: B2C jenis types (for TicketTable)
export const B2C_JENIS_KEYS: readonly JenisKey[] =
  ['sqm', 'reguler', 'hvc', 'unspec'];

// ← ADDED: B2B jenis types (for TicketTableB2B)
export const B2B_JENIS_KEYS: readonly JenisKey[] =
  ['sqm-ccan', 'indibiz', 'datin', 'reseller', 'wifi-id'];

/**
 * Comprehensive alias map for jenis ticket normalization.
 * Handles all known variants from Google Sheets sync.
 * 
 * Format: canonical_key -> [all known variants in lowercase]
 * 
 * Variants handled:
 * - Case variations (already lowercased before matching)
 * - Separator variations (-, _, space all normalized to -)
 * - Common typos and alternative spellings
 * - Extended variants (truncated to match base key)
 */
export const JENIS_ALIAS_MAP: Record<JenisKey, string[]> = {
  reguler: [
    'reguler',
    'regular',      // Common typo
    'reular',       // Typo
    'reg',          // Short form
    'reguler',      // Typo
  ],
  sqm: [
    'sqm',
    'sqm',          // Base form
  ],
  'sqm-ccan': [
    'sqm-ccan',
    'sqm_ccan',     // Underscore variant
    'sqm ccan',     // Space variant
    'sqmccan',      // No separator
    'ccan',         // Short form
  ],
  hvc: [
    'hvc',
    'hvc',          // Base form
  ],
  unspec: [
    'unspec',
    'unspecified',  // Full form
    'unspec',       // Base form
  ],
  indibiz: [
    'indibiz',
    'indi_biz',     // Underscore variant
    'indi biz',     // Space variant
    'indibiz pro',  // Extended variant
    'pro',          // Short form
  ],
  datin: [
    'datin',
    'datin_enterprise', // Extended variant
    'datin enterprise', // Space variant
    'enterprise',   // Short form
  ],
  reseller: [
    'reseller',
    'reseller',     // Base form
  ],
  'wifi-id': [
    'wifi-id',
    'wifi_id',      // Underscore variant
    'wifi id',      // Space variant
    'wifiid',       // No separator
    'wifi',         // Short form
  ],
};

export const JENIS_STYLES: Record<JenisKey, string> = {
  reguler: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400',
  sqm: 'bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400',
  'sqm-ccan': 'bg-fuchsia-50 text-fuchsia-600 dark:bg-fuchsia-500/15 dark:text-fuchsia-400',
  hvc: 'bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400',
  unspec: 'bg-slate-100 text-slate-500 dark:bg-slate-500/15 dark:text-slate-400',
  indibiz: 'bg-sky-50 text-sky-600 dark:bg-sky-500/15 dark:text-sky-400',
  datin: 'bg-cyan-50 text-cyan-600 dark:bg-cyan-500/15 dark:text-cyan-400',
  reseller: 'bg-purple-50 text-purple-600 dark:bg-purple-500/15 dark:text-purple-400',
  'wifi-id': 'bg-teal-50 text-teal-600 dark:bg-teal-500/15 dark:text-teal-400',
};

// ← ADDED: Display labels for each jenis type
export const JENIS_LABELS: Record<JenisKey, string> = {
  reguler: 'Reguler',
  sqm: 'SQM',
  'sqm-ccan': 'SQM-CCAN',
  hvc: 'HVC',
  unspec: 'Unspec',
  indibiz: 'Indibiz',
  datin: 'Datin',
  reseller: 'Reseller',
  'wifi-id': 'WiFi-ID',
};

/**
 * Converts any raw DB jenis string to a canonical JenisKey.
 * 
 * Normalization strategy:
 * 1. Trim whitespace
 * 2. Convert to lowercase
 * 3. Normalize separators (spaces, underscores → dashes)
 * 4. Remove extra spaces
 * 5. Match against comprehensive alias map
 * 6. Try prefix matching for extended variants
 * 7. Return '' if no match found (caller should use fallback)
 * 
 * @param raw - Raw string from database
 * @returns Canonical JenisKey or '' if no match
 * 
 * @example
 * normalizeJenis('SQM-CCAN')      // 'sqm-ccan'
 * normalizeJenis('sqm_ccan')      // 'sqm-ccan'
 * normalizeJenis('sqm ccan')      // 'sqm-ccan'
 * normalizeJenis('datin enterprise') // 'datin'
 * normalizeJenis('  HVC  ')       // 'hvc'
 * normalizeJenis(null)            // ''
 */
export function normalizeJenis(raw: string | null | undefined): JenisKey | '' {
  if (!raw || !raw.trim()) return '';

  // Step 1-4: Normalize the input
  const normalized = raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')        // Normalize multiple spaces to single
    .replace(/[\s_]/g, '-');     // Convert spaces and underscores to dashes

  // Step 5: Exact match against alias map
  for (const [key, aliases] of Object.entries(JENIS_ALIAS_MAP)) {
    for (const alias of aliases) {
      const normalizedAlias = alias.replace(/[\s_]/g, '-');
      if (normalized === normalizedAlias) {
        return key as JenisKey;
      }
    }
  }

  // Step 6: Prefix matching for extended variants
  // e.g., 'datin-enterprise-premium' → 'datin'
  for (const key of JENIS_KEYS) {
    if (normalized.startsWith(key + '-') || normalized.startsWith(key)) {
      return key;
    }
  }

  // Step 7: Try matching just the first word for compound terms
  const firstWord = normalized.split('-')[0];
  for (const [key, aliases] of Object.entries(JENIS_ALIAS_MAP)) {
    if (aliases.some(alias => alias.replace(/[\s_]/g, '-') === firstWord)) {
      return key as JenisKey;
    }
  }

  // No match found - return empty string
  // Caller should use fallback classification (customerSegment, customerType)
  return '';
}

/**
 * Returns true if the raw DB value matches the given filter key.
 * Always returns true when filterKey is 'all'.
 */
export function matchesJenisFilter(
  raw: string | null | undefined,
  filterKey: JenisKey | 'all',
): boolean {
  if (filterKey === 'all') return true;

  const normalized = normalizeJenis(raw);
  return normalized === filterKey;
}

/**
 * Returns the Tailwind class string for a given raw jenis value.
 * Falls back to 'bg-slate-100 text-slate-500' if no match.
 */
export function getJenisStyle(raw: string | null | undefined): string {
  const normalized = normalizeJenis(raw);
  if (!normalized) return 'bg-slate-100 text-slate-500';

  return JENIS_STYLES[normalized] ?? 'bg-slate-100 text-slate-500';
}

// ← ADDED: Returns true if the normalized jenis is a B2C type
// Null/empty/unknown defaults to B2C (safe default - prevents orphan tickets)
export function isB2CJenis(raw: string | null | undefined): boolean {
  if (!raw || !raw.trim()) return true;          // null/empty → B2C unspec
  const normalized = normalizeJenis(raw);
  if (!normalized) return true;                  // unknown value → B2C unspec
  return (B2C_JENIS_KEYS as string[]).includes(normalized);
}

// ← ADDED: Returns true if the normalized jenis is a B2B type
// Null/empty/unknown returns false (not B2B)
export function isB2BJenis(raw: string | null | undefined): boolean {
  if (!raw || !raw.trim()) return false;         // null/empty → bukan B2B
  const normalized = normalizeJenis(raw);
  if (!normalized) return false;                 // unknown → bukan B2B
  return (B2B_JENIS_KEYS as string[]).includes(normalized);
}

/**
 * Multi-layer ticket classification strategy.
 * 
 * Uses waterfall approach with multiple fallbacks:
 * Layer 1: jenisTiket (primary)
 * Layer 2: customerSegment (fallback)
 * Layer 3: customerType (secondary fallback)
 * Layer 4: Default to B2C (safe default for consumer tickets)
 * 
 * This ensures ALL tickets are classified - no orphan tickets.
 * 
 * @param ticket - Ticket object with jenisTiket, customerSegment, customerType
 * @returns 'b2c' | 'b2b' | 'unknown' (unknown should never happen with defaults)
 * 
 * @example
 * classifyTicket({ jenisTiket: 'SQM-CCAN' })           // 'b2b'
 * classifyTicket({ customerSegment: 'B2B' })           // 'b2b'
 * classifyTicket({ customerType: 'HVC_GOLD' })         // 'b2c'
 * classifyTicket({ jenisTiket: null })                 // 'b2c' (default)
 */
export function classifyTicket(ticket: {
  jenisTiket?: string | null;
  customerSegment?: string | null;
  customerType?: string | null;
}): 'b2c' | 'b2b' {
  // Layer 1: Try jenisTiket first (most specific)
  const normalizedJenis = normalizeJenis(ticket.jenisTiket);
  
  if (normalizedJenis) {
    if ((B2B_JENIS_KEYS as string[]).includes(normalizedJenis)) {
      return 'b2b';
    }
    if ((B2C_JENIS_KEYS as string[]).includes(normalizedJenis)) {
      return 'b2c';
    }
  }

  // Layer 2: Fall back to customerSegment (more reliable than jenisTiket)
  const segment = (ticket.customerSegment ?? '').trim().toUpperCase();
  if (segment === 'B2B') {
    return 'b2b';
  }
  if (segment === 'B2C' || segment === 'PL_TSEL') {
    return 'b2c';
  }

  // Layer 3: Fall back to customerType (contains B2C indicators)
  const customerType = (ticket.customerType ?? '').trim().toUpperCase();
  if (customerType) {
    // B2B customer types
    if (
      customerType.startsWith('DATIN_') ||
      customerType.startsWith('INDIBIZ') ||
      customerType.startsWith('RESELLER') ||
      customerType.startsWith('WIFI') ||
      customerType === 'DATIN' ||
      customerType === 'INDIBIZ' ||
      customerType === 'RESELLER'
    ) {
      return 'b2b';
    }

    // B2C customer types
    if (
      customerType === 'REGULER' ||
      customerType === 'HVC_GOLD' ||
      customerType === 'HVC_PLATINUM' ||
      customerType === 'HVC_DIAMOND' ||
      customerType.startsWith('HVC_')
    ) {
      return 'b2c';
    }
  }

  // Layer 4: Default to B2C (safe assumption - most tickets are consumer)
  // Better to classify as B2C than lose the ticket entirely
  return 'b2c';
}

/**
 * Convenience wrapper - returns true if ticket is B2C.
 * Uses multi-layer classification strategy.
 */
export function isB2CTicket(ticket: {
  jenisTiket?: string | null;
  customerSegment?: string | null;
  customerType?: string | null;
}): boolean {
  return classifyTicket(ticket) === 'b2c';
}

/**
 * Convenience wrapper - returns true if ticket is B2B.
 * Uses multi-layer classification strategy.
 */
export function isB2BTicket(ticket: {
  jenisTiket?: string | null;
  customerSegment?: string | null;
  customerType?: string | null;
}): boolean {
  return classifyTicket(ticket) === 'b2b';
}
