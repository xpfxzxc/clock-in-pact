import type { FeedListResponse } from "../../../types/feed";

import { getFeedEvents } from "../../../services/feed.service";
import { isAppError } from "../../../utils/app-error";
import prisma from "../../../utils/prisma";

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const groupId = Number(getRouterParam(event, "id"));
  const query = getQuery(event);

  if (isNaN(groupId)) {
    throw createError({ statusCode: 400, message: "无效的小组 ID" });
  }

  const cursor = query.cursor ? Number(query.cursor) : undefined;
  const limit = query.limit ? Number(query.limit) : undefined;

  if (cursor !== undefined && (Number.isNaN(cursor) || cursor <= 0 || !Number.isInteger(cursor))) {
    throw createError({ statusCode: 400, message: "无效的 cursor" });
  }

  if (limit !== undefined && (Number.isNaN(limit) || limit <= 0 || !Number.isInteger(limit))) {
    throw createError({ statusCode: 400, message: "无效的 limit" });
  }

  try {
    const result = await getFeedEvents(groupId, session.user.id, { cursor, limit }, { prisma });
    return result satisfies FeedListResponse;
  } catch (error) {
    if (isAppError(error)) {
      throw createError({ statusCode: error.statusCode, message: error.message });
    }
    throw error;
  }
});
