import type { CheckinResponse } from "../../types/checkin";

import { createCheckin, type CheckinEvidenceFileInput } from "../../services/checkin.service";
import { isAppError } from "../../utils/app-error";
import prisma from "../../utils/prisma";
import { deleteCheckinEvidence, saveCheckinEvidence } from "../../utils/storage";

const MAX_EVIDENCE_COUNT = 5;
const MAX_FILE_SIZE = 5 * 1024 * 1024;

interface MultipartPart {
  name?: string;
  data?: string | Buffer;
  filename?: string;
}

function partValueToString(part: MultipartPart): string {
  if (typeof part.data === "string") {
    return part.data;
  }
  return part.data ? part.data.toString("utf-8") : "";
}

function partDataToBuffer(part: MultipartPart): Buffer | null {
  if (!part.data) return null;
  if (Buffer.isBuffer(part.data)) return part.data;
  return Buffer.from(part.data);
}

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const parts = await readMultipartFormData(event);

  if (!parts || parts.length === 0) {
    throw createError({ statusCode: 400, message: "请求体不能为空" });
  }

  let goalIdRaw = "";
  let checkinDate = "";
  let valueRaw = "";
  let note = "";
  const evidenceParts: Array<{ data: Buffer; filename: string }> = [];

  for (const part of parts) {
    if (part.name === "goalId") {
      goalIdRaw = partValueToString(part).trim();
      continue;
    }

    if (part.name === "checkinDate") {
      checkinDate = partValueToString(part).trim();
      continue;
    }

    if (part.name === "value") {
      valueRaw = partValueToString(part).trim();
      continue;
    }

    if (part.name === "note") {
      note = partValueToString(part);
      continue;
    }

    if (part.name === "evidence" && part.filename) {
      const data = partDataToBuffer(part);
      if (data) {
        evidenceParts.push({ data, filename: part.filename });
      }
    }
  }

  if (!goalIdRaw || Number.isNaN(Number(goalIdRaw))) {
    throw createError({ statusCode: 400, message: "无效的目标 ID" });
  }

  if (!checkinDate) {
    throw createError({ statusCode: 400, message: "打卡日期无效" });
  }

  if (!valueRaw || Number.isNaN(Number(valueRaw))) {
    throw createError({ statusCode: 400, message: "打卡数值无效" });
  }

  if (evidenceParts.length < 1) {
    throw createError({ statusCode: 400, message: "请至少上传1张图片" });
  }

  if (evidenceParts.length > MAX_EVIDENCE_COUNT) {
    throw createError({ statusCode: 400, message: "最多上传5张图片" });
  }

  const savedEvidence: CheckinEvidenceFileInput[] = [];
  try {
    for (const evidencePart of evidenceParts) {
      if (evidencePart.data.length > MAX_FILE_SIZE) {
        throw createError({ statusCode: 400, message: "单张图片不超过5MB" });
      }

      try {
        const saved = await saveCheckinEvidence(evidencePart.data, evidencePart.filename);
        savedEvidence.push(saved);
      } catch (error) {
        if (error instanceof Error) {
          throw createError({ statusCode: 400, message: error.message });
        }
        throw error;
      }
    }

    const result = await createCheckin(
      {
        goalId: Number(goalIdRaw),
        checkinDate,
        value: Number(valueRaw),
        note,
      },
      savedEvidence,
      session.user.id,
      { prisma }
    );
    return result satisfies CheckinResponse;
  } catch (error) {
    await Promise.allSettled(savedEvidence.map((file) => deleteCheckinEvidence(file.filePath)));

    if (isAppError(error)) {
      throw createError({ statusCode: error.statusCode, message: error.message });
    }

    throw error;
  }
});
