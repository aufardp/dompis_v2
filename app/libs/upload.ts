import fs from 'fs';
import path from 'path';

export type ActionType = 'pending' | 'close';

/**
 * Saves uploaded evidence files to local storage.
 * Path structure: public/uploads/evidence/{incident}/{fileName}
 * Accessible via: /uploads/evidence/{incident}/{fileName}
 */
export async function saveFiles(
  files: File[],
  incident: string,
  actionType: ActionType = 'pending',
) {
  // Save to public/uploads for Next.js static file serving
  const uploadDir = path.join(
    process.cwd(),
    'public',
    'uploads',
    'evidence',
    incident,
  );

  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  const savedFiles = [];

  for (const file of files) {
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const ext = path.extname(file.name);
    const baseName = path
      .basename(file.name, ext)
      .replace(/[^a-zA-Z0-9_-]/g, '_');
    const timestamp = Date.now();
    const newName = `${actionType}_${baseName}_${timestamp}${ext}`;

    const filePath = path.join(uploadDir, newName);
    fs.writeFileSync(filePath, buffer);

    savedFiles.push({
      fileName: newName,
      // Relative path for database storage (matches public folder serving)
      filePath: `/public/uploads/evidence/${incident}/${newName}`,
      fileSize: file.size,
      mimeType: file.type,
    });
  }

  return savedFiles;
}
