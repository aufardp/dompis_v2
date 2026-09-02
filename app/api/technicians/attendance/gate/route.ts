import { NextResponse } from 'next/server';
import { protectApi } from '@/app/libs/protectApi';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';
import prisma from '@/app/libs/prisma';
import { getAttendanceGateByTechnicianSegment } from '@/app/libs/services/attendance-gate.service';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const user = await protectApi(['teknisi', 'admin', 'helpdesk', 'superadmin', 'senior_leader', 'admin_branch']);
    const dbUser = await prisma.users.findUnique({
      where: { id_user: user.id_user },
      select: { technician_segment: true },
    });
    const required = await getAttendanceGateByTechnicianSegment(dbUser?.technician_segment || null);
    return NextResponse.json({ success: true, data: { required, segment: dbUser?.technician_segment || null } });
  } catch (error: unknown) {
    return NextResponse.json(
      { success: false, message: getErrorMessage(error, 'Failed to fetch gate') },
      { status: getErrorStatus(error, 400) },
    );
  }
}
