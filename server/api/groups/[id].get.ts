import type { GroupDetailResponse } from "../../types/group";
import { getGroupDetail } from "../../services/group.service";
import { isAppError } from "../../utils/app-error";
import prisma from "../../utils/prisma";

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const groupId = Number(getRouterParam(event, "id"));

  if (isNaN(groupId)) {
    throw createError({ statusCode: 400, message: "无效的小组 ID" });
  }

  try {
    const group = await getGroupDetail(groupId, session.user.id, { prisma });
    return group satisfies GroupDetailResponse;
  } catch (error) {
    if (isAppError(error)) {
      throw createError({ statusCode: error.statusCode, message: error.message });
    }
    throw error;
  }
});
