export const MAX_BULK_INCIDENTS = 200;
export const MAX_INCIDENT_INPUT_LENGTH = 20_000;

export function parseIncidentInput(input: unknown): { incidents: string[]; duplicates: number; invalid: string[] } {
  if (typeof input !== 'string' && !Array.isArray(input)) throw new Error('Masukkan daftar ID incident.');
  if (Array.isArray(input) && (input.length > 2000 || input.some(value => typeof value !== 'string'))) {
    throw new Error('Daftar ID incident tidak valid.');
  }
  const text = typeof input === 'string' ? input : input.join('\n');
  if (text.length > MAX_INCIDENT_INPUT_LENGTH) throw new Error('Daftar ID incident terlalu panjang.');
  const tokens = text.trim().toUpperCase().split(/[\s,;]+/).filter(Boolean);
  const incidents: string[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();
  let duplicates = 0;
  for (const token of tokens) {
    if (seen.has(token)) { duplicates++; continue; }
    seen.add(token);
    if (!/^INC\d{6,20}$/.test(token)) invalid.push(token);
    else incidents.push(token);
  }
  if (incidents.length > MAX_BULK_INCIDENTS) throw new Error(`Maksimal ${MAX_BULK_INCIDENTS} incident per permintaan.`);
  return { incidents, duplicates, invalid };
}

export interface IncidentJobStatus {
  incident: string;
  jobId: string | null;
  state: string;
  terminal: boolean;
  success: boolean;
  attemptsMade: number;
  message: string;
}

export interface BulkIncidentReport {
  requestId: string;
  createdAt: string;
  expiresAt: string;
  items: IncidentJobStatus[];
  total: number;
  completed: number;
  succeeded: number;
  failed: number;
  pendingEnqueue: number;
  terminal: boolean;
}
