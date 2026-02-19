export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { saveFiles } from '@/app/libs/upload';
import { protectApi } from '@/app/libs/protectApi';
import prisma from '@/app/libs/prisma';
import { normalizeRoleKey, roleKeyToRoleId } from '@/app/libs/roles';
import { ActivityType } from '@/generated/prisma/enums';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';

export async function POST(req: NextRequest) {
  try {
    const user = await protectApi([
      'teknisi',
      'admin',
      'helpdesk',
      'superadmin',
      'super_admin',
    ]);

    const roleId = roleKeyToRoleId(normalizeRoleKey(user.role));

    const formData = await req.formData();
    const files = formData.getAll('files') as File[];
    const incident = formData.get('incident') as string;
    const ticketId = Number(formData.get('ticketId'));

    if (!files.length || !incident || !ticketId) {
      return NextResponse.json(
        { success: false, message: 'Data tidak lengkap' },
        { status: 400 },
      );
    }

    const savedFiles = await saveFiles(files, incident);

    await prisma.$transaction(async (tx) => {
      await tx.ticket_evidence.createMany({
        data: savedFiles.map((file) => ({
          ticket_id: ticketId,
          incident,
          file_name: file.fileName,
          file_path: file.filePath,
          file_size: file.fileSize,
          mime_type: file.mimeType,
        })),
      });

      await tx.ticket_activity_log.create({
        data: {
          ticket_id: ticketId,
          user_id: user.id_user,
          role_id: roleId,
          activity_type: ActivityType.UPLOAD_EVIDENCE,
          description: `Uploaded ${savedFiles.length} evidence file(s)`,
        },
      });
    });

    return NextResponse.json({
      success: true,
      files: savedFiles,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { success: false, message: getErrorMessage(error, 'Upload gagal') },
      { status: getErrorStatus(error, 500) },
    );
  }
}
