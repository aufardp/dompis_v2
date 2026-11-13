import { NextResponse } from 'next/server';
import { protectApi } from '@/app/libs/protectApi';
import { ApiError, getErrorStatus } from '@/app/libs/apiError';
import { enforceApiRateLimit } from '@/lib/api-rate-limit';
import { enqueueBulkIncidents, getBulkIncidentReport } from '@/lib/ingestion/bulk-incidents';
import { logger } from '@/lib/observability/logger';

export const dynamic = 'force-dynamic';

async function readBody(request: Request): Promise<{ requestId: string; incidents: unknown }> {
  if (request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !== 'application/json') {
    throw new ApiError(415, 'Gunakan Content-Type application/json.');
  }
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(400, 'Daftar incident wajib diisi.');
  const decoder = new TextDecoder();
  let text = '';
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 32768) { await reader.cancel(); throw new ApiError(413, 'Ukuran permintaan melebihi 32 KB.'); }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } finally { reader.releaseLock(); }
  let body;
  try { body = JSON.parse(text); } catch { throw new ApiError(400, 'Format JSON tidak valid.'); }
  if (!body || typeof body.requestId !== 'string') throw new ApiError(400, 'ID permintaan wajib diisi.');
  return body;
}

function failure(error: unknown) {
  const status = getErrorStatus(error, 503);
  if (!(error instanceof ApiError)) logger.error('Bulk incident request failed', error);
  return NextResponse.json({ success: false, message: error instanceof ApiError ? error.message : 'Antrean belum dapat diakses. Periksa status atau kirim ulang dengan ID permintaan yang sama.' }, { status });
}

export async function POST(request: Request) {
  try {
    const user = await protectApi(['superadmin', 'super_admin']);
    const limited = await enforceApiRateLimit(request, { namespace: 'bulk-incident-submit', limit: 10, windowSeconds: 60 });
    if (limited) return limited;
    const body = await readBody(request);
    const report = await enqueueBulkIncidents(user.id_user, body.requestId, body.incidents);
    logger.info('Bulk incidents queued', { requestId: report.requestId, total: report.total });
    return NextResponse.json({ success: true, accepted: true, report }, { status: 202 });
  } catch (error) { return failure(error); }
}

export async function GET(request: Request) {
  try {
    const user = await protectApi(['superadmin', 'super_admin']);
    const limited = await enforceApiRateLimit(request, { namespace: 'bulk-incident-status', limit: 60, windowSeconds: 60 });
    if (limited) return limited;
    const requestId = new URL(request.url).searchParams.get('requestId') ?? '';
    const report = await getBulkIncidentReport(user.id_user, requestId);
    return NextResponse.json({ success: true, report }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return failure(error); }
}
