import { NextResponse } from 'next/server';
import { protectApi } from '@/app/libs/protectApi';
import { logger } from '@/lib/observability/logger';
import { getErrorMessage } from '@/app/libs/apiError';
import {
  getBranchesByRegion,
  createBranch,
  updateBranch,
  deleteBranch,
} from '@/app/libs/services/branch.service';
import {
  createBranchSchema,
  updateBranchSchema,
  deleteBranchSchema,
} from '@/app/libs/validations/branch.schema';
import { enforceApiRateLimit } from '@/lib/api-rate-limit';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await protectApi(['superadmin']);

    const { searchParams } = new URL(request.url);
    const region_id = searchParams.get('region_id')
      ? Number(searchParams.get('region_id'))
      : undefined;

    const branches = await getBranchesByRegion(region_id);

    return NextResponse.json({ success: true, data: branches });
  } catch (error: any) {
    logger.error('Branch GET error:', error);
    return NextResponse.json(
      { success: false, message: getErrorMessage(error, 'Error loading branches') },
      { status: error.status === 401 || error.status === 403 ? error.status : 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    await protectApi(['superadmin'], { strict: true });

    const rateLimited = await enforceApiRateLimit(request, {
      namespace: 'branch',
      limit: 30,
      windowSeconds: 60,
    });
    if (rateLimited) return rateLimited;

    const body = await request.json();
    const validated = createBranchSchema.parse(body);

    const id = await createBranch(validated);

    return NextResponse.json({
      success: true,
      message: 'Branch created successfully',
      data: { id_branch: id, nama_branch: validated.nama_branch },
    });
  } catch (error: any) {
    logger.error('Branch POST error:', error);
    const status = error.name === 'ZodError' ? 400 : 500;
    return NextResponse.json(
      { success: false, message: getErrorMessage(error, 'Error creating branch') },
      { status },
    );
  }
}

export async function PUT(request: Request) {
  try {
    await protectApi(['superadmin'], { strict: true });

    const rateLimited = await enforceApiRateLimit(request, {
      namespace: 'branch',
      limit: 30,
      windowSeconds: 60,
    });
    if (rateLimited) return rateLimited;

    const body = await request.json();
    const validated = updateBranchSchema.parse(body);

    await updateBranch(validated.id_branch, {
      nama_branch: validated.nama_branch,
      kode_branch: validated.kode_branch,
      region_id: validated.region_id,
    });

    return NextResponse.json({
      success: true,
      message: 'Branch updated successfully',
    });
  } catch (error: any) {
    logger.error('Branch PUT error:', error);
    const status = error.name === 'ZodError' ? 400 : 500;
    return NextResponse.json(
      { success: false, message: getErrorMessage(error, 'Error updating branch') },
      { status },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    await protectApi(['superadmin'], { strict: true });

    const rateLimited = await enforceApiRateLimit(request, {
      namespace: 'branch',
      limit: 30,
      windowSeconds: 60,
    });
    if (rateLimited) return rateLimited;

    const { searchParams } = new URL(request.url);
    const id = Number(searchParams.get('id_branch'));

    const parsed = deleteBranchSchema.safeParse({ id_branch: id });
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          message: parsed.error.issues.map((i) => i.message).join(', '),
        },
        { status: 400 },
      );
    }

    await deleteBranch(parsed.data.id_branch);

    return NextResponse.json({
      success: true,
      message: 'Branch deleted successfully',
    });
  } catch (error: any) {
    logger.error('Branch DELETE error:', error);
    return NextResponse.json(
      { success: false, message: getErrorMessage(error, 'Error deleting branch') },
      { status: 500 },
    );
  }
}
