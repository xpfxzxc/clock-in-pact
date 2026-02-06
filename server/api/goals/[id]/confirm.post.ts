import type { ConfirmGoalResponse } from "../../../types/goal";
import { confirmGoal } from "../../../services/goal.service";
import { isAppError } from "../../../utils/app-error";
import prisma from "../../../utils/prisma";

interface ConfirmBody {
  status: "APPROVED" | "REJECTED";
}

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const goalId = Number(getRouterParam(event, "id"));
  const body = await readBody<ConfirmBody>(event);

  if (isNaN(goalId)) {
    throw createError({ statusCode: 400, message: "无效的目标 ID" });
  }

  try {
    const result = await confirmGoal(goalId, session.user.id, body.status, { prisma });
    return result satisfies ConfirmGoalResponse;
  } catch (error) {
    if (isAppError(error)) {
      throw createError({ statusCode: error.statusCode, message: error.message });
    }
    throw error;
  }
});

