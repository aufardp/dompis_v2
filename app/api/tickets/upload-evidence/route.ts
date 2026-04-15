export const runtime = 'nodejs';

export const config = {
  api: {
    bodyParser: false,
    responseLimit: false,
  },
};

import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { saveFiles, ActionType } from '@/app/libs/upload';
import { protectApi } from '@/app/libs/protectApi';
import prisma from '@/app/libs/prisma';
import { normalizeRoleKey, roleKeyToRoleId } from '@/app/libs/roles';
import { getErrorMessage, getErrorStatus } from '@/app/libs/apiError';

type ActivityType =
  | 'created'
  | 'updated'
  | 'closed'
  | 'reopened'
  | 'assigned'
  | 'unassigned'
  | 'picked_up'
  | 'pending'
  | 'evidence_added'
  | 'evidence_deleted';

// Sinkronkan dengan compressed file size (bukan raw dari kamera)
// Multi-pass compression: pass1: 1920px/0.82, pass2: 1280px/0.70, pass3: 960px/0.60
// Target per pass: ≤ 3MB → client validate ≤ 4MB (buffer aman)
const MAX_FILE_SIZE = 4 * 1024 * 1024; // 4MB per file (after compress, konsisten dengan client)
const MAX_TOTAL_SIZE = 20 * 1024 * 1024; // 20MB total payload (5 foto × 4MB)
const MAX_FILES = 5;

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
          message: `File ${oversizedFiles.map((f) => f.name).join(', ')} terlalu besar (maks 4MB per foto). ` +
                   `Aplikasi akan otomatis mengompres, coba pilih ulang foto tersebut.`,
        },
        { status: 400 },
      );
    }

    // Validasi jumlah file
    if (files.length > MAX_FILES) {
      return NextResponse.json(
        { success: false, message: `Maksimal ${MAX_FILES} foto per upload.` },
        { status: 400 },
      );
    }

    // Validasi total ukuran semua file (safety net server-side)
    const totalSize = files.reduce((sum, f) => sum + f.size, 0);
    if (totalSize > MAX_TOTAL_SIZE) {
      return NextResponse.json(
        {
          success: false,
          message: `Total ukuran foto (${(totalSize / 1024 / 1024).toFixed(1)} MB) melebihi batas. Maksimal 20 MB total.`,
        },
        { status: 413 },
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
    interface SavedFile {
      fileName: string;
      filePath: string;
      fileSize: number;
      mimeType: string;
    }

    interface TicketEvidenceData {
      ticket_id: number;
      incident: string;
      file_name: string;
      file_path: string;
      file_size: number;
      mime_type: string;
    }

    interface TicketActivityLogData {
      ticket_id: number;
      user_id: number;
      role_id: number;
      activity_type: 'UPLOAD_EVIDENCE';
      description: string;
    }

    const evidenceData: TicketEvidenceData[] = savedFiles.map((file: SavedFile) => ({
      ticket_id: ticketId,
      incident,
      file_name: file.fileName,
      file_path: file.filePath,
      file_size: file.fileSize,
      mime_type: file.mimeType,
    }));

    const activityLogData: TicketActivityLogData = {
      ticket_id: ticketId,
      user_id: user.id_user,
      role_id: roleId,
      activity_type: 'UPLOAD_EVIDENCE',
      description: `Uploaded ${savedFiles.length} evidence file(s)`,
    };

    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.ticket_evidence.createMany({
        data: evidenceData,
      });

      await tx.ticket_activity_log.create({
        data: activityLogData,
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
