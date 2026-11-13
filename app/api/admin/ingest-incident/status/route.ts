import { NextResponse } from 'next/server';
import { protectApi } from '@/app/libs/protectApi';
import { findSingleIncidentJob, readIncidentJobStatus } from '@/lib/ingestion/single-incident-queue';
import { getErrorStatus } from '@/app/libs/apiError';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await protectApi(['superadmin', 'super_admin']);
    const incident = new URL(request.url).searchParams.get('incident')?.trim().toUpperCase();
    if (!incident || incident.length > 100) {
      return NextResponse.json({ success: false, message: 'Incident ID tidak valid' }, { status: 400 });
    }
    const jobId = new URL(request.url).searchParams.get('jobId') ?? undefined;
    if (jobId && jobId.length > 300) return NextResponse.json({ success: false, message: 'ID permintaan tidak valid' }, { status: 400 });
    const job = await findSingleIncidentJob(incident, jobId);
    if (!job) {
      return NextResponse.json({ success: false, message: 'Permintaan tidak ditemukan' }, { status: 404 });
    }
    const status = await readIncidentJobStatus(incident, job);
    return NextResponse.json({
      ...status,
      result: status.state === 'completed' ? job.returnvalue : undefined,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({ success: false, message: 'Gagal membaca status antrean' }, { status: getErrorStatus(error, 500) });
  }
}
