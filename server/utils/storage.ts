import { mkdir, unlink, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { extname, join, normalize, sep } from "node:path";

const LOCAL_UPLOAD_DIR = join(process.cwd(), "public", "uploads", "checkins");
const LOCAL_FILE_PREFIX = "/uploads/checkins/";
const COS_OBJECT_PREFIX = "uploads/checkins";

const ALLOWED_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp"]);
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

export interface SavedFile {
  filePath: string;
  fileSize: number;
}

type StorageType = "local" | "cos";

interface CosConfig {
  secretId: string;
  secretKey: string;
  bucket: string;
  region: string;
}

interface CosError extends Error {
  code?: string;
  statusCode?: number;
}

type CosCallback = (error: CosError | null, data?: unknown) => void;

interface CosClient {
  putObject(
    options: {
      Bucket: string;
      Region: string;
      Key: string;
      Body: Buffer;
      ContentLength: number;
    },
    callback: CosCallback
  ): void;
  deleteObject(
    options: {
      Bucket: string;
      Region: string;
      Key: string;
    },
    callback: CosCallback
  ): void;
  getObjectUrl(options: {
    Bucket: string;
    Region: string;
    Key: string;
    Sign: boolean;
    Expires: number;
  }): string;
}

type CosConstructor = new (options: { SecretId: string; SecretKey: string }) => CosClient;

let cachedCosClient: CosClient | null = null;

function resolveStorageType(): StorageType {
  const configured = process.env.STORAGE_TYPE?.trim().toLowerCase();
  if (configured === "local" || configured === "cos") {
    return configured;
  }

  return process.env.NODE_ENV === "production" ? "cos" : "local";
}

function getSignedUrlExpiresInSeconds(): number {
  const defaultExpires = 900;
  const raw = process.env.COS_SIGNED_URL_EXPIRES_IN_SECONDS?.trim();
  if (!raw) return defaultExpires;

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error("COS_SIGNED_URL_EXPIRES_IN_SECONDS 必须是正整数（单位：秒）");
  }

  return parsed;
}

function getCosConfig(): CosConfig {
  const secretId = process.env.COS_SECRET_ID?.trim() ?? "";
  const secretKey = process.env.COS_SECRET_KEY?.trim() ?? "";
  const bucket = process.env.COS_BUCKET?.trim() ?? "";
  const region = process.env.COS_REGION?.trim() ?? "";

  if (!secretId || !secretKey || !bucket || !region) {
    throw new Error("COS 配置不完整，请检查 COS_SECRET_ID/COS_SECRET_KEY/COS_BUCKET/COS_REGION");
  }

  return { secretId, secretKey, bucket, region };
}

async function getCosClient(config: CosConfig): Promise<CosClient> {
  if (cachedCosClient) {
    return cachedCosClient;
  }

  let cosModule: { default?: unknown };
  try {
    cosModule = await import("cos-nodejs-sdk-v5");
  } catch {
    throw new Error("未安装 cos-nodejs-sdk-v5 依赖，请先执行 pnpm add cos-nodejs-sdk-v5");
  }

  const COS = (cosModule.default ?? cosModule) as CosConstructor;
  cachedCosClient = new COS({
    SecretId: config.secretId,
    SecretKey: config.secretKey,
  });
  return cachedCosClient;
}

function isCosNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const cosError = error as CosError;
  return cosError.code === "NoSuchKey" || cosError.statusCode === 404;
}

function extractCosObjectKey(filePath: string): string | null {
  if (filePath.startsWith(`${COS_OBJECT_PREFIX}/`)) return filePath;
  if (filePath.startsWith(`/${COS_OBJECT_PREFIX}/`)) return filePath.slice(1);

  try {
    const pathname = decodeURIComponent(new URL(filePath).pathname).replace(/^\/+/, "");
    if (pathname.startsWith(`${COS_OBJECT_PREFIX}/`)) {
      return pathname;
    }
  } catch {
    return null;
  }

  return null;
}

function isLocalEvidencePath(filePath: string): boolean {
  return filePath.startsWith(LOCAL_FILE_PREFIX);
}

function validateEvidenceFile(fileData: Buffer, originalFilename: string): string {
  const ext = extname(originalFilename).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw new Error(`不支持的文件格式: ${ext}`);
  }

  if (fileData.length > MAX_FILE_SIZE) {
    throw new Error("单张图片不超过5MB");
  }

  return ext;
}

async function saveToLocal(fileData: Buffer, ext: string): Promise<SavedFile> {
  await mkdir(LOCAL_UPLOAD_DIR, { recursive: true });

  const uniqueName = `${randomUUID()}${ext}`;
  const absolutePath = join(LOCAL_UPLOAD_DIR, uniqueName);

  await writeFile(absolutePath, fileData);

  return {
    filePath: `${LOCAL_FILE_PREFIX}${uniqueName}`,
    fileSize: fileData.length,
  };
}

async function putObjectToCos(client: CosClient, config: CosConfig, key: string, body: Buffer): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    client.putObject(
      {
        Bucket: config.bucket,
        Region: config.region,
        Key: key,
        Body: body,
        ContentLength: body.length,
      },
      (error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      }
    );
  });
}

async function saveToCos(fileData: Buffer, ext: string): Promise<SavedFile> {
  const config = getCosConfig();
  const client = await getCosClient(config);
  const uniqueName = `${randomUUID()}${ext}`;
  const key = `${COS_OBJECT_PREFIX}/${uniqueName}`;

  await putObjectToCos(client, config, key, fileData);

  return {
    filePath: key,
    fileSize: fileData.length,
  };
}

function getCosSignedObjectUrl(client: CosClient, config: CosConfig, key: string): string {
  const expiresInSeconds = getSignedUrlExpiresInSeconds();
  return client.getObjectUrl({
    Bucket: config.bucket,
    Region: config.region,
    Key: key,
    Sign: true,
    Expires: expiresInSeconds,
  });
}

export async function saveCheckinEvidence(
  fileData: Buffer,
  originalFilename: string
): Promise<SavedFile> {
  const ext = validateEvidenceFile(fileData, originalFilename);
  const storageType = resolveStorageType();

  if (storageType === "cos") {
    return saveToCos(fileData, ext);
  }

  return saveToLocal(fileData, ext);
}

async function deleteLocalEvidence(filePath: string): Promise<void> {
  if (!isLocalEvidencePath(filePath)) {
    return;
  }

  const relativePath = filePath.replace(/^\//, "");
  const resolvedPath = normalize(join(process.cwd(), "public", relativePath));
  const normalizedUploadDir = normalize(LOCAL_UPLOAD_DIR);
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

async function deleteCosEvidence(filePath: string): Promise<void> {
  const key = extractCosObjectKey(filePath);
  if (!key) return;

  const config = getCosConfig();
  const client = await getCosClient(config);

  try {
    await new Promise<void>((resolve, reject) => {
      client.deleteObject(
        {
          Bucket: config.bucket,
          Region: config.region,
          Key: key,
        },
        (error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        }
      );
    });
  } catch (error) {
    if (!isCosNotFoundError(error)) {
      throw error;
    }
  }
}

export async function deleteCheckinEvidence(filePath: string): Promise<void> {
  if (typeof filePath !== "string" || !filePath) {
    return;
  }

  if (isLocalEvidencePath(filePath)) {
    await deleteLocalEvidence(filePath);
    return;
  }

  const storageType = resolveStorageType();
  if (storageType === "cos") {
    await deleteCosEvidence(filePath);
  }
}

export async function resolveCheckinEvidenceFilePath(filePath: string): Promise<string> {
  if (typeof filePath !== "string" || !filePath) {
    return filePath;
  }

  if (isLocalEvidencePath(filePath)) {
    return filePath;
  }

  const storageType = resolveStorageType();
  if (storageType !== "cos") {
    return filePath;
  }

  const key = extractCosObjectKey(filePath);
  if (!key) {
    return filePath;
  }

  const config = getCosConfig();
  const client = await getCosClient(config);
  return getCosSignedObjectUrl(client, config, key);
}
