import { NextResponse } from 'next/server';
import { protectApi } from '@/app/libs/protectApi';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';
import { getBranchesForUser } from '@/app/helpers/ticket.helpers';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const actor = await protectApi(['admin', 'helpdesk', 'superadmin']);

    const branches = await getBranchesForUser(actor.id_user, actor.role);

    const options = branches.map((b) => ({
      value: String(b.id_branch),
      label: b.nama_branch,
      regionId: b.region_id,
    }));

    return NextResponse.json(
      { success: true, data: options },
      {
        headers: {
          'Cache-Control': 'private, max-age=300, stale-while-revalidate=600',
        },
      },
    );
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: getErrorMessage(error, 'Server Error') },
      { status: getErrorStatus(error, 500) },
    );
  }
}