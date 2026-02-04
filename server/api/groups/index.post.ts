import type { CreateGroupRequest, GroupDetailResponse } from "../../types/group";
import { createGroup } from "../../services/group.service";
import { isAppError } from "../../utils/app-error";
import prisma from "../../utils/prisma";

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const body = await readBody<CreateGroupRequest>(event);

  try {
    const group = await createGroup(body, session.user.id, { prisma });
    return group satisfies GroupDetailResponse;
  } catch (error) {
    if (isAppError(error)) {
      throw createError({ statusCode: error.statusCode, message: error.message });
    }
    throw error;
  }
});
