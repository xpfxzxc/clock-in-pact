import type { CheckinListResponse } from "../../../types/checkin";

import { listCheckins } from "../../../services/checkin.service";
import { isAppError } from "../../../utils/app-error";
import prisma from "../../../utils/prisma";

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const goalId = Number(getRouterParam(event, "id"));

  if (isNaN(goalId)) {
    throw createError({ statusCode: 400, message: "无效的目标 ID" });
  }

  try {
    const result = await listCheckins(goalId, session.user.id, { prisma });
    return result satisfies CheckinListResponse;
  } catch (error) {
    if (isAppError(error)) {
      throw createError({ statusCode: error.statusCode, message: error.message });
    }
    throw error;
  }
});

