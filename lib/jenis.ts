/**
 * Jenis Ticket Filter Utility
 * 
 * Provides centralized mapping and normalization for ticket type (JENIS_TIKET) filtering.
 * All database values are case-insensitive and trimmed before matching.
 */

/**
 * Maps each filter key to its accepted raw database value variants.
 * All values are stored in lowercase for consistent comparison.
 */
export const JENIS_FILTER_MAP: Record<string, string[]> = {
  reguler: ['reguler', 'regular'],
  sqm: ['sqm'],
  hvc: ['hvc'],
  unspec: ['unspec'],
  'sqm-ccan': ['sqm-ccan'],
  indibiz: ['indibiz'],
  datin: ['datin'],
  reseller: ['reseller'],
  'wifi-id': ['wifi-id'],
} as const;

/**
 * Valid filter keys that can be used in UI components.
 */
export type JenisFilterKey = keyof typeof JENIS_FILTER_MAP;

/**
 * Normalizes a raw database JENIS_TIKET value to a canonical lowercase filter key.
 * 
 * @param value - Raw string from database (may have inconsistent casing)
 * @returns Lowercase filter key if matched, otherwise the trimmed lowercase input
 * 
 * @example
 * normalizeJenis('REGULER')    // returns 'reguler'
 * normalizeJenis('Regular')    // returns 'reguler' (typo variant)
 * normalizeJenis('SQM-CCAN')   // returns 'sqm-ccan'
 * normalizeJenis('  HVC  ')    // returns 'hvc' (trimmed)
 */
export function normalizeJenis(value: string | null | undefined): string {
  if (!value) return '';
  
  const normalized = value.trim().toLowerCase();
  
  // Check against each filter key's variants
  for (const [filterKey, variants] of Object.entries(JENIS_FILTER_MAP)) {
    if (variants.includes(normalized)) {
      return filterKey;
    }
  }
  
  // Return trimmed lowercase if no match found
  return normalized;
}

/**
 * Generates a Prisma where clause for filtering by jenis ticket.
 * 
 * @param filterKey - The filter key from JENIS_FILTER_MAP
 * @returns Prisma where clause object for JENIS_TIKET field
 * 
 * @example
 * getJenisWhereClause('reguler')
 * // { JENIS_TIKET: { in: ['reguler', 'REGULER', 'regular', 'REGULAR'] } }
 */
export function getJenisWhereClause(filterKey: string): { JENIS_TIKET: any } {
  const variants = JENIS_FILTER_MAP[filterKey];
  
  if (!variants || variants.length === 0) {
    // Fallback: match the key in both cases
    return {
      JENIS_TIKET: { in: [filterKey, filterKey.toUpperCase()] },
    };
  }
  
  // Generate both lowercase and uppercase variants for database matching
  const dbVariants: string[] = [];
  for (const variant of variants) {
    dbVariants.push(variant);
    dbVariants.push(variant.toUpperCase());
    
    // Also add capitalized form for common types (first letter uppercase)
    if (variant.length > 1) {
      const capitalized = variant.charAt(0).toUpperCase() + variant.slice(1);
      if (capitalized !== variant && capitalized !== variant.toUpperCase()) {
        dbVariants.push(capitalized);
      }
    }
  }
  
  // Remove duplicates
  const uniqueVariants = [...new Set(dbVariants)];
  
  return {
    JENIS_TIKET: { in: uniqueVariants },
  };
}

/**
 * Checks if a raw database value matches a specific filter key.
 * Useful for client-side filtering of already-fetched data.
 * 
 * @param rawValue - Raw JENIS_TIKET value from database
 * @param filterKey - The filter key to match against
 * @returns true if the value matches the filter key
 * 
 * @example
 * matchesJenisFilter('REGULER', 'reguler')  // true
 * matchesJenisFilter('Regular', 'reguler')  // true (typo variant)
 * matchesJenisFilter('SQM', 'sqm')          // true
 */
export function matchesJenisFilter(
  rawValue: string | null | undefined,
  filterKey: string,
): boolean {
  return normalizeJenis(rawValue) === filterKey;
}
