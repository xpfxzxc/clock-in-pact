import type { GroupResponse } from "../../types/group";
import { getMyGroups } from "../../services/group.service";
import { isAppError } from "../../utils/app-error";
import prisma from "../../utils/prisma";

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);

  try {
    const groups = await getMyGroups(session.user.id, { prisma });
    return groups satisfies GroupResponse[];
  } catch (error) {
    if (isAppError(error)) {
      throw createError({ statusCode: error.statusCode, message: error.message });
    }
    throw error;
  }
});
