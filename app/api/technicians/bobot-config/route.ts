export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import prisma from '@/app/libs/prisma';
import { protectApi } from '@/app/libs/protectApi';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';
import { enforceApiRateLimit } from '@/lib/api-rate-limit';
import {
  loadRecapConfig,
  invalidateRecapConfigCache,
  RECAP_BUCKET_KEYS,
} from '@/app/libs/services/recap-close.service';

export async function GET() {
  try {
    await protectApi(['admin', 'helpdesk', 'superadmin', 'super_admin']);
    const { weights, thresholds } = await loadRecapConfig();
    return NextResponse.json({ success: true, data: { weights, thresholds } });
  } catch (error: unknown) {
    return NextResponse.json(
      { success: false, message: getErrorMessage(error, 'Gagal memuat config') },
      { status: getErrorStatus(error, 400) },
    );
  }
}

export async function PUT(request: Request) {
  try {
    const rateLimited = await enforceApiRateLimit(request, {
      namespace: 'bobot-config',
      limit: 20,
      windowSeconds: 60,
    });
    if (rateLimited) return rateLimited;

    await protectApi(['admin', 'superadmin', 'super_admin'], { strict: true });

    const body = (await request.json().catch(() => null)) as {
      weights?: Array<{ bucket_key?: string; bobot?: number }>;
      thresholds?: { tinggi_min?: number; sedang_min?: number };
    } | null;

    const weights = (body?.weights ?? []).filter(
      (w): w is { bucket_key: string; bobot: number } =>
        typeof w?.bucket_key === 'string' &&
        (RECAP_BUCKET_KEYS as readonly string[]).includes(w.bucket_key) &&
        Number.isFinite(w.bobot) &&
        (w.bobot as number) >= 0 &&
        (w.bobot as number) <= 99,
    );

    await Promise.all(
      weights.map((w) =>
        prisma.technician_bobot_config.update({
          where: { bucket_key: w.bucket_key },
          data: { bobot: w.bobot },
        }),
      ),
    );

    const th = body?.thresholds;
    const upserts: Array<Promise<unknown>> = [];
    if (th && Number.isFinite(th.tinggi_min)) {
      upserts.push(
        prisma.system_config.upsert({
          where: { key: 'recap_produktif_tinggi_min' },
          create: {
            key: 'recap_produktif_tinggi_min',
            value: String(th.tinggi_min),
          },
          update: { value: String(th.tinggi_min) },
        }),
      );
    }
    if (th && Number.isFinite(th.sedang_min)) {
      upserts.push(
        prisma.system_config.upsert({
          where: { key: 'recap_produktif_sedang_min' },
          create: {
            key: 'recap_produktif_sedang_min',
            value: String(th.sedang_min),
          },
          update: { value: String(th.sedang_min) },
        }),
      );
    }
    await Promise.all(upserts);

    invalidateRecapConfigCache();
    const fresh = await loadRecapConfig();
    return NextResponse.json({ success: true, data: fresh });
  } catch (error: unknown) {
    return NextResponse.json(
      { success: false, message: getErrorMessage(error, 'Gagal menyimpan config') },
      { status: getErrorStatus(error, 400) },
    );
  }
}
