import type { VoteGoalChangeRequestResponse } from "../../../types/goal-change-request";
import { voteGoalChangeRequest } from "../../../services/goal-change-request.service";
import { isAppError } from "../../../utils/app-error";
import prisma from "../../../utils/prisma";

interface VoteBody {
  status: "APPROVED" | "REJECTED";
}

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const requestId = Number(getRouterParam(event, "id"));
  const body = await readBody<VoteBody>(event);

  if (isNaN(requestId)) {
    throw createError({ statusCode: 400, message: "无效的请求 ID" });
  }

  try {
    const result = await voteGoalChangeRequest(requestId, session.user.id, body.status, { prisma });
    return result satisfies VoteGoalChangeRequestResponse;
  } catch (error) {
    if (isAppError(error)) {
      throw createError({ statusCode: error.statusCode, message: error.message });
    }
    throw error;
  }
});
