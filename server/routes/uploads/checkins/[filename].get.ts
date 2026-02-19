import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { extname, join } from "node:path";
import {
  createError,
  defineEventHandler,
  getRouterParam,
  sendStream,
  setResponseHeader,
} from "h3";

const LOCAL_UPLOAD_DIR = join(process.cwd(), "public", "uploads", "checkins");
const ALLOWED_FILENAME = /^[0-9a-f-]+\.(jpg|jpeg|png|gif|webp)$/i;
const CONTENT_TYPE_MAP: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
};
const CACHE_CONTROL = "public, max-age=31536000, immutable";

function createNotFoundError() {
  return createError({
    statusCode: 404,
    statusMessage: "Not Found",
  });
}

export default defineEventHandler(async (event) => {
  const filename = getRouterParam(event, "filename");
  if (!filename || !ALLOWED_FILENAME.test(filename)) {
    throw createNotFoundError();
  }

  const filePath = join(LOCAL_UPLOAD_DIR, filename);

  let fileStat;
  try {
    fileStat = await stat(filePath);
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === "ENOENT" || err.code === "ENOTDIR") {
      throw createNotFoundError();
    }
    throw error;
  }

  if (!fileStat.isFile()) {
    throw createNotFoundError();
  }

  const ext = extname(filename).toLowerCase();
  const contentType = CONTENT_TYPE_MAP[ext] ?? "application/octet-stream";

  setResponseHeader(event, "Content-Type", contentType);
  setResponseHeader(event, "Content-Length", String(fileStat.size));
  setResponseHeader(event, "Cache-Control", CACHE_CONTROL);

  return sendStream(event, createReadStream(filePath));
});
