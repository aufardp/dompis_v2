import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import { ApiError } from './apiError';

export type ActionType = 'pending' | 'close';

const PUBLIC_UPLOADS_ROOT = path.join(process.cwd(), 'public', 'uploads');
const EVIDENCE_ROOT = path.join(PUBLIC_UPLOADS_ROOT, 'evidence');
const TEMP_UPLOADS_ROOT = path.join(process.cwd(), '.uploads-tmp', 'evidence');

const ALLOWED_IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

const ALLOWED_IMAGE_EXTENSIONS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.gif',
]);

type StagedFile = {
  fileName: string;
  filePath: string;
  apiUrl: string;
  fileSize: number;
  mimeType: string;
  tempPath: string;
  finalPath: string;
};

function sanitizePathSegment(input: string, fallback: string): string {
  const normalized = String(input || '')
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^\.+|\.+$/g, '')
    .slice(0, 120);

  return normalized || fallback;
}

function getIncidentDirectory(incident: string) {
  return sanitizePathSegment(incident, 'unknown-ticket');
}

function getSafeFileExtension(fileName: string) {
  const ext = path.extname(fileName).toLowerCase();
  if (!ALLOWED_IMAGE_EXTENSIONS.has(ext)) {
    throw new ApiError(400, `Format file tidak didukung: ${fileName}`);
  }
  return ext;
}

async function assertSafeImageFile(file: File) {
  const mimeType = String(file.type || '').toLowerCase();
  if (!ALLOWED_IMAGE_MIME_TYPES.has(mimeType)) {
    throw new ApiError(400, `Tipe file tidak didukung: ${file.name}`);
  }

  const ext = getSafeFileExtension(file.name);
  const bytes = new Uint8Array(await file.arrayBuffer());

  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const isPng =
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47;
  const isGif =
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38;
  const isWebp =
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50;

  const signatureMatches =
    (ext === '.jpg' || ext === '.jpeg' ? isJpeg : false) ||
    (ext === '.png' ? isPng : false) ||
    (ext === '.gif' ? isGif : false) ||
    (ext === '.webp' ? isWebp : false);

  if (!signatureMatches) {
    throw new ApiError(400, `Isi file tidak valid untuk gambar: ${file.name}`);
  }
}

async function writeBrowserFileToDisk(file: File, targetPath: string) {
  const webStream = file.stream();
  const nodeStream = Readable.fromWeb(webStream as any);
  const writeStream = fs.createWriteStream(targetPath, { flags: 'wx' });
  await pipeline(nodeStream, writeStream);
}

export async function validateEvidenceFiles(files: File[]) {
  await Promise.all(files.map((file) => assertSafeImageFile(file)));
}

export async function stageFiles(
  files: File[],
  incident: string,
  actionType: ActionType = 'pending',
): Promise<StagedFile[]> {
  const incidentDirectory = getIncidentDirectory(incident);
  const tempDir = path.join(TEMP_UPLOADS_ROOT, incidentDirectory);
  const finalDir = path.join(EVIDENCE_ROOT, incidentDirectory);

  await fsPromises.mkdir(tempDir, { recursive: true });
  await fsPromises.mkdir(finalDir, { recursive: true });

  return Promise.all(
    files.map(async (file) => {
      const ext = getSafeFileExtension(file.name);
      const baseName = sanitizePathSegment(path.basename(file.name, ext), 'file');
      const suffix = randomUUID().replace(/-/g, '').slice(0, 12);
      const newName = `${actionType}_${baseName}_${suffix}${ext}`;
      const tempPath = path.join(tempDir, newName);
      const finalPath = path.join(finalDir, newName);
      const relativePath = `uploads/evidence/${incidentDirectory}/${newName}`;

      await writeBrowserFileToDisk(file, tempPath);

      return {
        fileName: newName,
        filePath: relativePath,
        apiUrl: `/api/files/${relativePath}`,
        fileSize: file.size,
        mimeType: file.type,
        tempPath,
        finalPath,
      };
    }),
  );
}

export async function commitStagedFiles(files: StagedFile[]) {
  for (const file of files) {
    await fsPromises.mkdir(path.dirname(file.finalPath), { recursive: true });
    await fsPromises.copyFile(file.tempPath, file.finalPath);
    await fsPromises.unlink(file.tempPath);
  }
}

export async function cleanupStagedFiles(files: Pick<StagedFile, 'tempPath'>[]) {
  await Promise.all(
    files.map(async (file) => {
      try {
        await fsPromises.unlink(file.tempPath);
      } catch (error: any) {
        if (error?.code !== 'ENOENT') throw error;
      }
    }),
  );
}

export async function cleanupCommittedFiles(files: Pick<StagedFile, 'finalPath'>[]) {
  await Promise.all(
    files.map(async (file) => {
      try {
        await fsPromises.unlink(file.finalPath);
      } catch (error: any) {
        if (error?.code !== 'ENOENT') throw error;
      }
    }),
  );
}
