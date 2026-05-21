import mysql, { Pool, PoolOptions, RowDataPacket, ResultSetHeader } from 'mysql2/promise';

const DEFAULT_POOL_SIZE = 5;
const DEFAULT_TIMEOUT = 15000;

export interface ExternalDbConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  connectionLimit?: number;
  connectTimeout?: number;
}

let pool: Pool | null = null;

export function getExternalDbConfig(): ExternalDbConfig | null {
  const host = process.env.EXTERNAL_DB_HOST;
  const user = process.env.EXTERNAL_DB_USER;
  const password = process.env.EXTERNAL_DB_PASSWORD;
  const database = process.env.EXTERNAL_DB_NAME;
  const port = parseInt(process.env.EXTERNAL_DB_PORT || '3306', 10);

  if (!host || !user || !database) {
    return null;
  }

  return {
    host,
    port,
    user,
    password: password || '',
    database,
    connectionLimit: DEFAULT_POOL_SIZE,
    connectTimeout: DEFAULT_TIMEOUT,
  };
}

export function createExternalPool(): Pool | null {
  const config = getExternalDbConfig();

  if (!config) {
    console.warn('[ExternalDB] Configuration not available - check EXTERNAL_DB_* env vars');
    return null;
  }

  if (pool) {
    return pool;
  }

  const poolConfig: PoolOptions = {
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    connectionLimit: config.connectionLimit || DEFAULT_POOL_SIZE,
    connectTimeout: config.connectTimeout || DEFAULT_TIMEOUT,
    enableKeepAlive: true,
    keepAliveInitialDelay: 30000,
  };

  pool = mysql.createPool(poolConfig);

  (pool as unknown as { on: (event: string, handler: (err: Error) => void) => void }).on('error', (err: Error) => {
    console.error('[ExternalDB] Pool error:', err.message);
  });

  console.log('[ExternalDB] Pool created:', {
    host: config.host,
    database: config.database,
    connectionLimit: config.connectionLimit,
  });

  return pool;
}

export function getExternalPool(): Pool | null {
  if (!pool) {
    return createExternalPool();
  }
  return pool;
}

export async function closeExternalPool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    console.log('[ExternalDB] Pool closed');
  }
}

export async function testExternalConnection(): Promise<boolean> {
  const externalPool = getExternalPool();

  if (!externalPool) {
    return false;
  }

  try {
    const connection = await externalPool.getConnection();
    await connection.ping();
    connection.release();
    console.log('[ExternalDB] Connection test: OK');
    return true;
  } catch (error) {
    console.error('[ExternalDB] Connection test: FAILED', error);
    return false;
  }
}

export async function fetchTableRows(
  tableName: string,
  options: {
    limit?: number;
    offset?: number;
    orderBy?: string;
    orderDirection?: 'ASC' | 'DESC';
  } = {}
): Promise<RowDataPacket[]> {
  const externalPool = getExternalPool();

  if (!externalPool) {
    throw new Error('External DB pool not available');
  }

  const { limit = 1000, offset = 0, orderBy = 'id', orderDirection = 'ASC' } = options;

  const query = `SELECT * FROM \`${tableName}\` ORDER BY \`${orderBy}\` ${orderDirection} LIMIT ? OFFSET ?`;
  const [rows] = await externalPool.query<RowDataPacket[]>(query, [limit, offset]);

  return rows;
}

export async function fetchTableRowsAfterId(
  tableName: string,
  options: {
    limit?: number;
    lastId?: number | string | null;
    orderBy?: string;
  } = {}
): Promise<RowDataPacket[]> {
  const externalPool = getExternalPool();

  if (!externalPool) {
    throw new Error('External DB pool not available');
  }

  const { limit = 1000, lastId = null, orderBy = 'id' } = options;

  const query =
    lastId === null
      ? `SELECT * FROM \`${tableName}\` ORDER BY \`${orderBy}\` ASC LIMIT ?`
      : `SELECT * FROM \`${tableName}\` WHERE \`${orderBy}\` > ? ORDER BY \`${orderBy}\` ASC LIMIT ?`;
  const params = lastId === null ? [limit] : [lastId, limit];
  const [rows] = await externalPool.query<RowDataPacket[]>(query, params);

  return rows;
}

export interface ExternalColumnInfo {
  name: string;
  dataType: string;
  ordinalPosition: number;
}

export interface ExternalCursorDefinition {
  idColumn: string | null;
  modifiedColumn: string | null;
  strategy: 'id_modified' | 'modified' | 'id' | 'snapshot';
  columns: ExternalColumnInfo[];
}

function assertSafeIdentifier(identifier: string): void {
  if (!/^[A-Za-z0-9_]+$/.test(identifier)) {
    throw new Error(`Unsafe SQL identifier: ${identifier}`);
  }
}

export async function getTableColumns(tableName: string): Promise<ExternalColumnInfo[]> {
  assertSafeIdentifier(tableName);
  const externalPool = getExternalPool();
  const config = getExternalDbConfig();

  if (!externalPool || !config) {
    throw new Error('External DB pool not available');
  }

  const [rows] = await externalPool.query<RowDataPacket[]>(
    `
      SELECT COLUMN_NAME AS name, DATA_TYPE AS dataType, ORDINAL_POSITION AS ordinalPosition
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
      ORDER BY ORDINAL_POSITION ASC
    `,
    [config.database, tableName],
  );

  return rows.map((row) => ({
    name: String(row.name),
    dataType: String(row.dataType),
    ordinalPosition: Number(row.ordinalPosition),
  }));
}

export async function getExternalCursorDefinition(
  tableName: string,
): Promise<ExternalCursorDefinition> {
  const columns = await getTableColumns(tableName);
  const names = new Set(columns.map((column) => column.name));
  const modifiedCandidates = [
    'date_modified',
    'datemodified',
    'updated_at',
    'modified_at',
    'last_modified',
    'status_date',
  ];
  const idColumn = names.has('id') ? 'id' : null;
  const modifiedColumn =
    modifiedCandidates.find((candidate) => names.has(candidate)) ?? null;

  return {
    idColumn,
    modifiedColumn,
    strategy:
      idColumn && modifiedColumn
        ? 'id_modified'
        : modifiedColumn
          ? 'modified'
          : idColumn
            ? 'id'
            : 'snapshot',
    columns,
  };
}

export async function fetchTableRowsByCursor(
  tableName: string,
  options: {
    limit: number;
    idColumn?: string | null;
    modifiedColumn?: string | null;
    lastCursorId?: string | null;
    lastModifiedAt?: Date | null;
  },
): Promise<RowDataPacket[]> {
  assertSafeIdentifier(tableName);
  if (options.idColumn) assertSafeIdentifier(options.idColumn);
  if (options.modifiedColumn) assertSafeIdentifier(options.modifiedColumn);

  const externalPool = getExternalPool();
  if (!externalPool) throw new Error('External DB pool not available');

  const clauses: string[] = [];
  const params: unknown[] = [];
  const orderBy: string[] = [];

  if (options.modifiedColumn && options.lastModifiedAt) {
    if (options.idColumn && options.lastCursorId !== null && options.lastCursorId !== undefined) {
      clauses.push(
        `(\`${options.modifiedColumn}\` > ? OR (\`${options.modifiedColumn}\` = ? AND \`${options.idColumn}\` > ?))`,
      );
      params.push(options.lastModifiedAt, options.lastModifiedAt, options.lastCursorId);
    } else {
      clauses.push(`\`${options.modifiedColumn}\` > ?`);
      params.push(options.lastModifiedAt);
    }
  } else if (options.idColumn && options.lastCursorId !== null && options.lastCursorId !== undefined) {
    clauses.push(`\`${options.idColumn}\` > ?`);
    params.push(options.lastCursorId);
  }

  if (options.modifiedColumn) orderBy.push(`\`${options.modifiedColumn}\` ASC`);
  if (options.idColumn) orderBy.push(`\`${options.idColumn}\` ASC`);
  if (orderBy.length === 0) orderBy.push('1 ASC');

  const query = `
    SELECT * FROM \`${tableName}\`
    ${clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''}
    ORDER BY ${orderBy.join(', ')}
    LIMIT ?
  `;
  params.push(options.limit);

  const [rows] = await externalPool.query<RowDataPacket[]>(query, params);
  return rows;
}

export async function fetchTableCount(tableName: string): Promise<number> {
  const externalPool = getExternalPool();

  if (!externalPool) {
    throw new Error('External DB pool not available');
  }

  const query = `SELECT COUNT(*) as count FROM \`${tableName}\``;
  const [rows] = await externalPool.query<RowDataPacket[]>(query);
  return rows[0]?.count || 0;
}

export function getTableNames(): string[] {
  const tableNamesEnv = process.env.EXTERNAL_TABLE_NAMES;

  if (!tableNamesEnv) {
    console.warn('[ExternalDB] EXTERNAL_TABLE_NAMES not configured');
    return [];
  }

  return tableNamesEnv.split(',').map(t => t.trim()).filter(t => t.length > 0);
}
