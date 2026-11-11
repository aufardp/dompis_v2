import { NextResponse } from 'next/server';
import { protectApi } from '@/app/libs/protectApi';
import { singleIncidentJobId, singleIncidentQueue } from '@/lib/ingestion/single-incident-queue';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await protectApi(['superadmin', 'super_admin']);
    const incident = new URL(request.url).searchParams.get('incident')?.trim().toUpperCase();
    if (!incident || incident.length > 100) {
      return NextResponse.json({ success: false, message: 'Incident ID tidak valid' }, { status: 400 });
    }
    const job = await singleIncidentQueue.getJob(singleIncidentJobId(incident));
    if (!job) {
      return NextResponse.json({ success: false, message: 'Permintaan tidak ditemukan' }, { status: 404 });
    }
    const state = await job.getState();
    const terminal = state === 'completed' || state === 'failed';
    return NextResponse.json({
      success: state === 'completed',
      incident,
      state,
      terminal,
      attemptsMade: job.attemptsMade,
      result: state === 'completed' ? job.returnvalue : undefined,
      message: state === 'completed'
        ? job.returnvalue?.message ?? `Insiden ${incident} selesai diproses.`
        : state === 'failed'
          ? job.failedReason ?? `Pemrosesan insiden ${incident} gagal.`
          : `Pemrosesan sedang berjalan (${state}).`,
    });
  } catch {
    return NextResponse.json({ success: false, message: 'Gagal membaca status antrean' }, { status: 500 });
  }
}
