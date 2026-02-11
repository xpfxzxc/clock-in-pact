import type { ReviewCheckinResponse } from "../../../types/checkin";

import { reviewCheckin } from "../../../services/checkin.service";
import { isAppError } from "../../../utils/app-error";
import prisma from "../../../utils/prisma";

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const checkinId = Number(getRouterParam(event, "id"));

  if (isNaN(checkinId)) {
    throw createError({ statusCode: 400, message: "无效的打卡 ID" });
  }

  const body = await readBody(event);

  try {
    const result = await reviewCheckin(
      checkinId,
      { action: body?.action, reason: body?.reason },
      session.user.id,
      { prisma }
    );
    return result satisfies ReviewCheckinResponse;
  } catch (error) {
    if (isAppError(error)) {
      throw createError({ statusCode: error.statusCode, message: error.message });
    }
    throw error;
  }
});
