export const runtime = 'nodejs';

export const config = {
  api: {
    bodyParser: false,
    responseLimit: false,
  },
};

import { NextRequest, NextResponse } from 'next/server';
import { saveFiles, ActionType } from '@/app/libs/upload';
import { protectApi } from '@/app/libs/protectApi';
import prisma from '@/app/libs/prisma';
import { normalizeRoleKey, roleKeyToRoleId } from '@/app/libs/roles';
import { ActivityType } from '@prisma/client';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';

const MAX_FILE_SIZE = 8 * 1024 * 1024;

export async function POST(req: NextRequest) {
  try {
    const user = await protectApi([
      'teknisi',
      'admin',
      'helpdesk',
      'superadmin',
      'super_admin',
    ]);

    let formData: FormData;
    try {
      formData = await req.formData();
    } catch (formError) {
      const err = formError as Error;
      if (err.message && err.message.includes('payload too large')) {
        return NextResponse.json(
          {
            success: false,
            message: 'File terlalu besar. Kurangi ukuran atau jumlah foto.',
          },
          { status: 413 },
        );
      }
      throw formError;
    }

    const files = formData.getAll('files') as File[];
    const incident = formData.get('incident') as string;
    const ticketId = Number(formData.get('ticketId'));
    const actionType = (formData.get('actionType') as ActionType) || 'pending';

    const oversizedFiles = files.filter((f) => f.size > MAX_FILE_SIZE);
    if (oversizedFiles.length > 0) {
      return NextResponse.json(
        {
          success: false,
          message: `Ukuran file terlalu besar. Maksimal 8MB per foto`,
        },
        { status: 400 },
      );
    }

    if (!files.length || !incident || !ticketId) {
      return NextResponse.json(
        { success: false, message: 'Data tidak lengkap' },
        { status: 400 },
      );
    }

    const roleId = roleKeyToRoleId(normalizeRoleKey(user.role));

    // Save files to local storage
    const savedFiles = await saveFiles(files, incident, actionType);

    // Save to database
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
      files: savedFiles.map((file) => ({
        fileName: file.fileName,
        filePath: file.filePath,
        fileSize: file.fileSize,
        mimeType: file.mimeType,
      })),
      message: 'Files uploaded successfully',
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { success: false, message: getErrorMessage(error, 'Upload gagal') },
      { status: getErrorStatus(error, 500) },
    );
  }
}
