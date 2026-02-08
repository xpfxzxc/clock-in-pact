import type { GoalChangeRequestResponse } from "../../../../types/goal-change-request";
import { createGoalChangeRequest } from "../../../../services/goal-change-request.service";
import { isAppError } from "../../../../utils/app-error";
import prisma from "../../../../utils/prisma";

interface CreateBody {
  type: "MODIFY" | "CANCEL";
  proposedChanges?: Record<string, unknown>;
}

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const goalId = Number(getRouterParam(event, "id"));
  const body = await readBody<CreateBody>(event);

  if (isNaN(goalId)) {
    throw createError({ statusCode: 400, message: "无效的目标 ID" });
  }

  try {
    const result = await createGoalChangeRequest(
      { goalId, type: body.type, proposedChanges: body.proposedChanges },
      session.user.id,
      { prisma }
    );
    return result satisfies GoalChangeRequestResponse;
  } catch (error) {
    if (isAppError(error)) {
      throw createError({ statusCode: error.statusCode, message: error.message });
    }
    throw error;
  }
});
