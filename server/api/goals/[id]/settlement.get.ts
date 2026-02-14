import type { SettlementResultResponse } from "../../../types/settlement";

import { getSettlementResult } from "../../../services/settlement.service";
import { isAppError } from "../../../utils/app-error";
import prisma from "../../../utils/prisma";

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const goalId = Number(getRouterParam(event, "id"));

  if (Number.isNaN(goalId)) {
    throw createError({ statusCode: 400, message: "无效的目标 ID" });
  }

  try {
    const result = await getSettlementResult(goalId, session.user.id, { prisma });
    return result satisfies SettlementResultResponse;
  } catch (error) {
    if (isAppError(error)) {
      throw createError({ statusCode: error.statusCode, message: error.message });
    }
    throw error;
  }
});
