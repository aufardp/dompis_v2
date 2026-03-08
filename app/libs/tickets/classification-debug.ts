/**
 * Classification Debug Utility
 * 
 * Diagnostic tool to detect and analyze uncategorized tickets.
 * Use this in development to identify data quality issues.
 * 
 * @example
 * ```ts
 * // In admin page useEffect
 * if (process.env.NODE_ENV === 'development') {
 *   const report = debugUncategorizedTickets(tickets);
 *   if (report.count > 0) {
 *     console.warn('⚠️ Uncategorized tickets:', report);
 *   }
 * }
 * ```
 */

import type { Ticket } from '@/app/types/ticket';
import { normalizeJenis, classifyTicket } from './jenis';

export interface UncategorizedTicketSample {
  idTicket: number;
  ticket: string;
  jenisTiket: string | null | undefined;
  customerSegment: string | null | undefined;
  customerType: string | null | undefined;
  classifiedAs: 'b2c' | 'b2b';
  reason: string;
}

export interface UncategorizedReport {
  /**
   * Total tickets analyzed
   */
  total: number;
  /**
   * Tickets that would have been uncategorized with old logic
   * (normalizeJenis returned '', both isB2CJenis and isB2BJenis returned false)
   */
  count: number;
  /**
   * Percentage of total
   */
  percentage: number;
  /**
   * Sample of problematic tickets (max 10)
   */
  samples: UncategorizedTicketSample[];
  /**
   * Breakdown by classification layer
   */
  breakdown: {
    classifiedByJenis: number;
    classifiedBySegment: number;
    classifiedByCustomerType: number;
    classifiedByDefault: number;
  };
  /**
   * Most common uncategorized jenisTiket values
   */
  commonUncategorizedValues: Array<{
    value: string;
    count: number;
  }>;
}

/**
 * Analyzes tickets to find classification issues.
 * 
 * This function simulates the OLD classification logic to find tickets
 * that would have been uncategorized (the root cause of your 70 missing tickets).
 */
export function debugUncategorizedTickets(
  tickets: Ticket[],
): UncategorizedReport {
  const samples: UncategorizedTicketSample[] = [];
  const uncategorizedValues = new Map<string, number>();
  
  let classifiedByJenis = 0;
  let classifiedBySegment = 0;
  let classifiedByCustomerType = 0;
  let classifiedByDefault = 0;

  let uncategorizedCount = 0;

  for (const ticket of tickets) {
    // Check if old logic would have failed
    const normalizedJenis = normalizeJenis(ticket.jenisTiket);
    const oldLogicB2C = normalizedJenis !== '' && 
      ['sqm', 'reguler', 'hvc', 'unspec'].includes(normalizedJenis);
    const oldLogicB2B = normalizedJenis !== '' && 
      ['sqm-ccan', 'indibiz', 'datin', 'reseller', 'wifi-id'].includes(normalizedJenis);

    const wouldBeUncategorized = !oldLogicB2C && !oldLogicB2B;

    if (wouldBeUncategorized) {
      uncategorizedCount++;

      // Track the raw jenisTiket value
      const rawValue = ticket.jenisTiket ?? '(null)';
      uncategorizedValues.set(rawValue, (uncategorizedValues.get(rawValue) || 0) + 1);

      // Collect sample (max 10)
      if (samples.length < 10) {
        // Determine which layer classified it
        const segment = (ticket.customerSegment ?? '').trim().toUpperCase();
        const customerType = (ticket.customerType ?? '').trim().toUpperCase();
        
        let classifiedAs: 'b2c' | 'b2b' = 'b2c';
        let reason = 'Default fallback (B2C)';

        if (normalizedJenis) {
          classifiedAs = ['sqm-ccan', 'indibiz', 'datin', 'reseller', 'wifi-id'].includes(normalizedJenis) ? 'b2b' : 'b2c';
          reason = `jenisTiket normalized to "${normalizedJenis}"`;
          classifiedByJenis++;
        } else if (segment === 'B2B') {
          classifiedAs = 'b2b';
          reason = `customerSegment = "${segment}"`;
          classifiedBySegment++;
        } else if (segment === 'B2C' || segment === 'PL_TSEL') {
          classifiedAs = 'b2c';
          reason = `customerSegment = "${segment}"`;
          classifiedBySegment++;
        } else if (
          customerType.startsWith('DATIN_') ||
          customerType.startsWith('INDIBIZ') ||
          customerType.startsWith('RESELLER') ||
          customerType.startsWith('WIFI')
        ) {
          classifiedAs = 'b2b';
          reason = `customerType = "${customerType}"`;
          classifiedByCustomerType++;
        } else if (
          customerType === 'REGULER' ||
          customerType.startsWith('HVC_')
        ) {
          classifiedAs = 'b2c';
          reason = `customerType = "${customerType}"`;
          classifiedByCustomerType++;
        } else {
          classifiedByDefault++;
        }

        samples.push({
          idTicket: ticket.idTicket,
          ticket: ticket.ticket,
          jenisTiket: ticket.jenisTiket,
          customerSegment: ticket.customerSegment,
          customerType: ticket.customerType,
          classifiedAs,
          reason,
        });
      }
    }
  }

  // Get top uncategorized values
  const commonUncategorizedValues = Array.from(uncategorizedValues.entries())
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    total: tickets.length,
    count: uncategorizedCount,
    percentage: tickets.length > 0 ? (uncategorizedCount / tickets.length) * 100 : 0,
    samples,
    breakdown: {
      classifiedByJenis,
      classifiedBySegment,
      classifiedByCustomerType,
      classifiedByDefault,
    },
    commonUncategorizedValues,
  };
}

/**
 * Validates that TOTAL = B2C + B2B invariant holds.
 * 
 * @param tickets - Array of tickets to validate
 * @returns true if invariant holds, false otherwise
 * 
 * @example
 * ```ts
 * const b2c = tickets.filter(isB2CTicket);
 * const b2b = tickets.filter(isB2BTicket);
 * 
 * if (!validateClassificationInvariant(tickets, b2c.length, b2b.length)) {
 *   console.error('❌ Classification invariant violated!');
 * }
 * ```
 */
export function validateClassificationInvariant(
  tickets: Ticket[],
  b2cCount: number,
  b2bCount: number,
): boolean {
  const total = tickets.length;
  const sum = b2cCount + b2bCount;
  
  if (total !== sum) {
    console.error(
      `❌ Classification invariant violated: ` +
      `TOTAL (${total}) ≠ B2C (${b2cCount}) + B2B (${b2bCount}) = ${sum}`,
    );
    return false;
  }
  
  return true;
}

/**
 * Logs classification statistics to console.
 * Useful for debugging in development mode.
 */
export function logClassificationStats(
  tickets: Ticket[],
  b2cCount: number,
  b2bCount: number,
): void {
  if (typeof window === 'undefined') return; // Only in browser
  
  const report = debugUncategorizedTickets(tickets);
  
  console.group('📊 Ticket Classification Stats');
  console.log(`Total Tickets: ${tickets.length}`);
  console.log(`B2C: ${b2cCount} (${((b2cCount / tickets.length) * 100).toFixed(1)}%)`);
  console.log(`B2B: ${b2bCount} (${((b2bCount / tickets.length) * 100).toFixed(1)}%)`);
  console.log(`Invariant: ${b2cCount + b2bCount === tickets.length ? '✅ PASS' : '❌ FAIL'}`);
  
  if (report.count > 0) {
    console.warn(
      `⚠️ ${report.count} tickets (${report.percentage.toFixed(1)}%) would have been uncategorized with old logic`,
    );
    console.log('Classification breakdown:');
    console.log(`  - By jenisTiket: ${report.breakdown.classifiedByJenis}`);
    console.log(`  - By customerSegment: ${report.breakdown.classifiedBySegment}`);
    console.log(`  - By customerType: ${report.breakdown.classifiedByCustomerType}`);
    console.log(`  - By default fallback: ${report.breakdown.classifiedByDefault}`);
    
    if (report.commonUncategorizedValues.length > 0) {
      console.log('Common uncategorized jenisTiket values:');
      report.commonUncategorizedValues.forEach(({ value, count }) => {
        console.log(`  "${value}": ${count}`);
      });
    }
  }
  
  console.groupEnd();
}
