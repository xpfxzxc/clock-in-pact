import type { JoinGroupRequest, JoinGroupResponse } from "../../types/group";
import { joinGroup } from "../../services/group.service";
import { isAppError } from "../../utils/app-error";
import prisma from "../../utils/prisma";

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const body = await readBody<JoinGroupRequest>(event);

  try {
    const result = await joinGroup(body, session.user.id, { prisma });
    return result satisfies JoinGroupResponse;
  } catch (error) {
    if (isAppError(error)) {
      throw createError({ statusCode: error.statusCode, message: error.message });
    }
    throw error;
  }
});
