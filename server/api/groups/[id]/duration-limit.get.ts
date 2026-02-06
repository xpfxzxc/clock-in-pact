import type { DurationLimitResponse } from "../../../types/goal";
import { getDurationLimit } from "../../../services/goal.service";
import { isAppError } from "../../../utils/app-error";
import prisma from "../../../utils/prisma";

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const groupId = Number(getRouterParam(event, "id"));
  const query = getQuery(event);
  const category = typeof query.category === "string" ? query.category : "";

  if (isNaN(groupId)) {
    throw createError({ statusCode: 400, message: "无效的小组 ID" });
  }

  if (!category.trim()) {
    throw createError({ statusCode: 400, message: "目标类别不能为空" });
  }

  try {
    const result = await getDurationLimit(groupId, category, session.user.id, { prisma });
    return result satisfies DurationLimitResponse;
  } catch (error) {
    if (isAppError(error)) {
      throw createError({ statusCode: error.statusCode, message: error.message });
    }
    throw error;
  }
});

