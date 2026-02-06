import type { CreateGoalRequest, GoalResponse } from "../../types/goal";
import { createGoal } from "../../services/goal.service";
import { isAppError } from "../../utils/app-error";
import prisma from "../../utils/prisma";

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const body = await readBody<CreateGoalRequest>(event);

  try {
    const goal = await createGoal(body, session.user.id, { prisma });
    return goal satisfies GoalResponse;
  } catch (error) {
    if (isAppError(error)) {
      throw createError({ statusCode: error.statusCode, message: error.message });
    }
    throw error;
  }
});

