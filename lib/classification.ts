// Define RawSql type locally since Prisma.Sql doesn't exist in Prisma 6.x
type RawSql = object & { __brand: 'PrismaSql' };

// Helper to create raw SQL template strings
function rawSql(strings: TemplateStringsArray, ...values: unknown[]): RawSql {
  let result = '';
  for (let i = 0; i < strings.length; i++) {
    result += strings[i];
    if (i < values.length) {
      result += String(values[i]);
    }
  }
  return result as unknown as RawSql;
}

export type CustomerClassification = 'b2b' | 'b2c';

export function getCustomerClassificationSQL(): RawSql {
  return rawSql`
    CASE 
      -- Layer 1: PRIMARY - CUSTOMER_SEGMENT (most authoritative)
      WHEN t.CUSTOMER_SEGMENT = 'PL-TSEL' THEN 'b2c'
      WHEN t.CUSTOMER_SEGMENT = 'RBS' THEN 'b2b'
      
      -- Layer 2: JENIS_TIKET
      WHEN LOWER(t.JENIS_TIKET) IN ('sqm-ccan', 'indibiz', 'datin', 'reseller', 'wifi-id') THEN 'b2b'
      WHEN LOWER(t.JENIS_TIKET) IN ('sqm', 'reguler', 'hvc', 'unspec') THEN 'b2c'
      
      -- Layer 3: Fallback to CUSTOMER_TYPE
      WHEN LOWER(t.CUSTOMER_TYPE) LIKE '%datin%' THEN 'b2b'
      WHEN LOWER(t.CUSTOMER_TYPE) LIKE '%indibiz%' THEN 'b2b'
      WHEN LOWER(t.CUSTOMER_TYPE) LIKE '%wifi%' THEN 'b2b'
      WHEN LOWER(t.CUSTOMER_TYPE) LIKE '%reseller%' THEN 'b2b'
      WHEN LOWER(t.CUSTOMER_TYPE) LIKE '%sqm-ccan%' THEN 'b2b'
      WHEN t.CUSTOMER_TYPE = 'REGULER' THEN 'b2c'
      WHEN t.CUSTOMER_TYPE LIKE 'HVC_%' THEN 'b2c'
      
      -- Layer 4: Safe default (most tickets are B2C)
      ELSE 'b2c'
    END
  `;
}

export function getIsB2BSQL(): RawSql {
  return rawSql`
    CASE
      -- Layer 1: PRIMARY - CUSTOMER_SEGMENT
      WHEN t.CUSTOMER_SEGMENT = 'RBS' THEN 1
      WHEN t.CUSTOMER_SEGMENT = 'PL-TSEL' THEN 0

      -- Layer 2: JENIS_TIKET
      WHEN LOWER(t.JENIS_TIKET) IN ('sqm-ccan', 'indibiz', 'datin', 'reseller', 'wifi-id') THEN 1

      -- Layer 3: CUSTOMER_TYPE
      WHEN LOWER(t.CUSTOMER_TYPE) LIKE '%datin%' THEN 1
      WHEN LOWER(t.CUSTOMER_TYPE) LIKE '%indibiz%' THEN 1
      WHEN LOWER(t.CUSTOMER_TYPE) LIKE '%wifi%' THEN 1
      WHEN LOWER(t.CUSTOMER_TYPE) LIKE '%reseller%' THEN 1
      WHEN LOWER(t.CUSTOMER_TYPE) LIKE '%sqm-ccan%' THEN 1

      -- Not B2B
      ELSE 0
    END
  `;
}

export function getIsB2CSQL(): RawSql {
  return rawSql`
    CASE
      -- Layer 1: PRIMARY - CUSTOMER_SEGMENT
      WHEN t.CUSTOMER_SEGMENT = 'PL-TSEL' THEN 1
      WHEN t.CUSTOMER_SEGMENT = 'RBS' THEN 0

      -- Layer 2: JENIS_TIKET
      WHEN LOWER(t.JENIS_TIKET) IN ('sqm', 'reguler', 'hvc', 'unspec') THEN 1

      -- Layer 3: CUSTOMER_TYPE
      WHEN t.CUSTOMER_TYPE = 'REGULER' THEN 1
      WHEN t.CUSTOMER_TYPE LIKE 'HVC_%' THEN 1

      -- Layer 4: Default to B2C (if not classified as B2B)
      -- This ensures EVERY ticket is classified
      WHEN NOT (
        t.CUSTOMER_SEGMENT = 'RBS'
        OR LOWER(t.JENIS_TIKET) IN ('sqm-ccan', 'indibiz', 'datin', 'reseller', 'wifi-id')
        OR LOWER(t.CUSTOMER_TYPE) LIKE '%datin%'
        OR LOWER(t.CUSTOMER_TYPE) LIKE '%indibiz%'
        OR LOWER(t.CUSTOMER_TYPE) LIKE '%wifi%'
        OR LOWER(t.CUSTOMER_TYPE) LIKE '%reseller%'
        OR LOWER(t.CUSTOMER_TYPE) LIKE '%sqm-ccan%'
      ) THEN 1

      ELSE 0
    END
  `;
}

export function getStatusUpdateSQL(): RawSql {
  return rawSql`
    COALESCE(NULLIF(TRIM(LOWER(t.STATUS_UPDATE)), ''), 'open')
  `;
}

export function getDailyScopeWhereClause(): RawSql {
  return rawSql`
    WHERE t.sync_date = CURDATE()
  `;
}

export async function getDailyScopeWhereClauseWithFallback(): Promise<RawSql> {
  const prisma = (await import('@/app/libs/prisma')).default;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const result = await prisma.$queryRaw<{ max_date: Date | null }[]>`
    SELECT MAX(sync_date) as max_date FROM ticket WHERE sync_date IS NOT NULL
  `;

  const maxSyncDate = result[0]?.max_date;

  if (!maxSyncDate) {
    return rawSql`WHERE t.sync_date = CURDATE()`;
  }

  const maxDate = new Date(maxSyncDate);
  maxDate.setHours(0, 0, 0, 0);

  if (maxDate.getTime() === today.getTime()) {
    return rawSql`WHERE t.sync_date = CURDATE()`;
  }

  return rawSql`WHERE t.sync_date = ${maxDate.toISOString().split('T')[0]}`;
}

export function getDailyScopeWithPendingWhereClause(): RawSql {
  return rawSql`
    WHERE (t.sync_date = CURDATE() OR t.PENDING_REASON IS NOT NULL)
  `;
}
