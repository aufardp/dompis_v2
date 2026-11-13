import { NextResponse } from 'next/server';
import { protectApi } from '@/app/libs/protectApi';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';
import { enqueueSingleIncident } from '@/lib/ingestion/single-incident-queue';

export const dynamic = 'force-dynamic';

function normalizeIncident(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const incident = value.trim().toUpperCase();
  return incident && incident.length <= 100 ? incident : null;
}

export async function POST(request: Request) {
  try {
    await protectApi(['superadmin', 'super_admin']);
    const body = await request.json().catch(() => ({}));
    const incident = normalizeIncident(body?.incident);
    if (!incident) {
      return NextResponse.json({ success: false, message: 'Incident ID tidak valid' }, { status: 400 });
    }

    const jobId = await enqueueSingleIncident(incident);
    return NextResponse.json({
      success: true,
      accepted: true,
      incident,
      jobId,
      message: 'Permintaan diterima. Proses berjalan di antrean dan bisa dipantau di halaman ini.',
    }, { status: 202 });
  } catch (error: unknown) {
    return NextResponse.json(
      { success: false, message: getErrorMessage(error, 'Gagal mengantrekan penarikan insiden') },
      { status: getErrorStatus(error, 500) },
    );
  }
}
