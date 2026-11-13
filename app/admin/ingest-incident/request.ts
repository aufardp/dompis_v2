import { fetchWithAuth } from '@/app/libs/fetcher';
import {
  parseIncidentInput,
  type BulkIncidentReport,
} from '@/lib/ingestion/incident-input';

export interface IncidentSubmission {
  requestId: string;
  incidents: string[];
  savedAt: number;
}
export const isRequestId = (value: string) =>
  /^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i.test(value);

export function restoreIncidentSubmission(
  raw: string | null,
): IncidentSubmission | null {
  try {
    const saved = JSON.parse(raw ?? 'null') as IncidentSubmission | null;
    if (
      !saved ||
      !isRequestId(saved.requestId) ||
      !Array.isArray(saved.incidents) ||
      !Number.isFinite(saved.savedAt) ||
      Date.now() - saved.savedAt < 0 ||
      Date.now() - saved.savedAt >= 86_400_000
    )
      return null;
    const parsed = parseIncidentInput(saved.incidents);
    if (!parsed.incidents.length || parsed.invalid.length || parsed.duplicates)
      return null;
    return { ...saved, incidents: parsed.incidents };
  } catch {
    return null;
  }
}

export class IncidentRequestError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export async function requestIncidentReport(
  url: string,
  init?: RequestInit,
): Promise<BulkIncidentReport> {
  let response;
  try {
    response = await fetchWithAuth(url, {
      ...init,
      cache: 'no-store',
      timeoutMs: 20_000,
    });
  } catch (error) {
    if (init?.signal?.aborted) throw error;
    throw new IncidentRequestError(
      'Koneksi terputus atau batas waktu permintaan terlampaui. Periksa status sebelum mengirim ulang.',
      0,
    );
  }
  if (!response)
    throw new IncidentRequestError(
      'Sesi berakhir. Silakan masuk kembali.',
      401,
    );
  let body;
  try {
    body = JSON.parse(await response.text());
  } catch {
    throw new IncidentRequestError(
      `Status belum dapat dibaca (HTTP ${response.status}). Periksa lagi sebelum mengirim ulang.`,
      response.status,
    );
  }
  if (!response.ok || !body?.success)
    throw new IncidentRequestError(
      typeof body?.message === 'string'
        ? body.message
        : `Permintaan gagal (HTTP ${response.status}).`,
      response.status,
    );
  const report = body.report as BulkIncidentReport | undefined;
  if (
    !report ||
    !isRequestId(report.requestId) ||
    !Array.isArray(report.items) ||
    report.items.some(
      (item) =>
        !item ||
        typeof item.incident !== 'string' ||
        typeof item.message !== 'string' ||
        typeof item.state !== 'string' ||
        typeof item.terminal !== 'boolean' ||
        typeof item.success !== 'boolean',
    ) ||
    !Number.isInteger(report.total) ||
    report.total !== report.items.length ||
    typeof report.terminal !== 'boolean'
  ) {
    throw new IncidentRequestError(
      'Respons status tidak lengkap. Periksa lagi sebelum mengirim ulang.',
      response.status,
    );
  }
  return report;
}
