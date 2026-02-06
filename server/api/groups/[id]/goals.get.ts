import type { GoalResponse } from "../../../types/goal";
import { listGroupGoals } from "../../../services/goal.service";
import { isAppError } from "../../../utils/app-error";
import prisma from "../../../utils/prisma";

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const groupId = Number(getRouterParam(event, "id"));

  if (isNaN(groupId)) {
    throw createError({ statusCode: 400, message: "无效的小组 ID" });
  }

  try {
    const goals = await listGroupGoals(groupId, session.user.id, { prisma });
    return goals satisfies GoalResponse[];
  } catch (error) {
    if (isAppError(error)) {
      throw createError({ statusCode: error.statusCode, message: error.message });
    }
    throw error;
  }
});

