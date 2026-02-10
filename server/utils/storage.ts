import { mkdir, unlink, writeFile } from "node:fs/promises";
import { extname, join, normalize, sep } from "node:path";
import { randomUUID } from "node:crypto";

const UPLOAD_DIR = join(process.cwd(), "public", "uploads", "checkins");

const ALLOWED_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp"]);
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

export interface SavedFile {
  filePath: string;
  fileSize: number;
}

export async function saveCheckinEvidence(
  fileData: Buffer,
  originalFilename: string
): Promise<SavedFile> {
  const ext = extname(originalFilename).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw new Error(`不支持的文件格式: ${ext}`);
  }

  if (fileData.length > MAX_FILE_SIZE) {
    throw new Error("单张图片不超过5MB");
  }

  await mkdir(UPLOAD_DIR, { recursive: true });

  const uniqueName = `${randomUUID()}${ext}`;
  const absolutePath = join(UPLOAD_DIR, uniqueName);

  await writeFile(absolutePath, fileData);

  return {
    filePath: `/uploads/checkins/${uniqueName}`,
    fileSize: fileData.length,
  };
}

export async function deleteCheckinEvidence(filePath: string): Promise<void> {
  if (typeof filePath !== "string" || !filePath.startsWith("/uploads/checkins/")) {
    return;
  }

  const relativePath = filePath.replace(/^\//, "");
  const resolvedPath = normalize(join(process.cwd(), "public", relativePath));
  const normalizedUploadDir = normalize(UPLOAD_DIR);
  const uploadDirPrefix = `${normalizedUploadDir}${sep}`;

  if (!resolvedPath.startsWith(uploadDirPrefix)) {
    return;
  }

  try {
    await unlink(resolvedPath);
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code !== "ENOENT") {
      throw error;
    }
  }
}
