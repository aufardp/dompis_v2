/**
 * Klasifikasi error "database sedang sesak" — gate timeout, pool Prisma habis,
 * lock wait, deadlock, dan statement timeout. Ini bukan bug data: mengulang
 * pekerjaan segera setelah error seperti ini hanya menambah beban saat MySQL
 * sudah penuh. Worker memakai helper ini untuk menunda (paused/deferred)
 * alih-alih retry agresif atau mengisi DLQ.
 */

const SATURATION_CODES = new Set([
  'P2024', // pool timeout
  'P2028', // transaction timeout / already closed
  'P1008', // operation timed out
  'P1017', // server closed the connection
  'ER_LOCK_WAIT_TIMEOUT',
  'ER_LOCK_DEADLOCK',
  'PROTOCOL_SEQUENCE_TIMEOUT',
  'ETIMEDOUT',
]);

const SATURATION_MESSAGES = [
  'Database query gate wait exceeded',
  'Timed out fetching a new connection',
  'Timed out waiting for ticket_raw_writer',
  'TICKET_RAW_WRITER_LOCK_TIMEOUT',
  'Lock wait timeout exceeded',
  'Deadlock found when trying to get lock',
  'Maximum statement execution time exceeded',
  'ER_LOCK_WAIT_TIMEOUT',
  'ER_LOCK_DEADLOCK',
];

export function isDatabaseSaturationError(error: unknown, depth = 0): boolean {
  if (!error || depth > 5) return false;
  if (typeof error === 'string') {
    return SATURATION_MESSAGES.some((message) => error.includes(message));
  }
  if (typeof error !== 'object') return false;

  const candidate = error as {
    name?: string;
    code?: unknown;
    errno?: unknown;
    message?: string;
    cause?: unknown;
  };

  if (candidate.name === 'QueryGateTimeoutError') return true;
  if (typeof candidate.code === 'string' && SATURATION_CODES.has(candidate.code)) {
    return true;
  }
  if (candidate.errno === 1205 || candidate.errno === 1213) return true;

  const message = typeof candidate.message === 'string' ? candidate.message : '';
  if (SATURATION_MESSAGES.some((pattern) => message.includes(pattern))) return true;

  return isDatabaseSaturationError(candidate.cause, depth + 1);
}
