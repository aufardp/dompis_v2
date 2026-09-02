import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { protectApi } from '@/app/libs/protectApi';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';
import { getAllGates, setAllGates } from '@/app/libs/services/attendance-gate.service';
import { logger } from '@/lib/observability/logger';

export const dynamic = 'force-dynamic';

const putSchema = z.object({
  b2b: z.boolean(),
  b2c: z.boolean(),
  unset: z.boolean(),
});

export async function GET(request: NextRequest) {
  try {
    await protectApi(['superadmin'], { strict: true });
    const gates = await getAllGates();
    return NextResponse.json({ success: true, data: gates });
  } catch (error: unknown) {
    logger.error('GET /admin/settings/attendance-gate error', error);
    return NextResponse.json(
      { success: false, message: getErrorMessage(error, 'Failed to fetch gates') },
      { status: getErrorStatus(error, 500) },
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const decoded = await protectApi(['superadmin'], { strict: true });
    const body = await request.json();
    const parsed = putSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, message: 'Validation failed', errors: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    await setAllGates(parsed.data, decoded.id_user);
    const gates = await getAllGates();
    return NextResponse.json({ success: true, data: gates });
  } catch (error: unknown) {
    logger.error('PUT /admin/settings/attendance-gate error', error);
    return NextResponse.json(
      { success: false, message: getErrorMessage(error, 'Failed to update gates') },
      { status: getErrorStatus(error, 500) },
    );
  }
}
