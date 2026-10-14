import { NextResponse } from 'next/server';
import { protectApi } from '@/app/libs/protectApi';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';
import { ingestSingleIncident } from '@/lib/ingestion/single-incident-ingestion';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    // Restriksi eksplisit hanya superadmin & super_admin
    await protectApi(['superadmin', 'super_admin']);

    const body = await request.json().catch(() => ({}));
    const { incident } = body;

    if (!incident || typeof incident !== 'string') {
      return NextResponse.json(
        { success: false, message: 'Parameter "incident" wajib diisi' },
        { status: 400 },
      );
    }

    const response = await ingestSingleIncident(incident);

    return NextResponse.json(response, {
      status: response.success ? 200 : 400,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        success: false,
        message: getErrorMessage(error, 'Gagal memproses penarikan insiden'),
      },
      { status: getErrorStatus(error, 500) },
    );
  }
}
