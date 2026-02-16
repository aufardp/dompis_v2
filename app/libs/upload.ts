import fs from 'fs';
import path from 'path';

export async function saveFiles(files: File[], incident: string) {
  const uploadDir = path.join(process.cwd(), 'public/assets/evident', incident);

  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  const savedFiles = [];

  for (const file of files) {
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const ext = path.extname(file.name);
    const newName = `${Date.now()}-${Math.random()
      .toString(36)
      .substring(2, 8)}${ext}`;

    const filePath = path.join(uploadDir, newName);
    fs.writeFileSync(filePath, buffer);

    savedFiles.push({
      fileName: newName,
      filePath: `/assets/evident/${incident}/${newName}`,
      fileSize: file.size,
      mimeType: file.type,
    });
  }

  return savedFiles;
}
