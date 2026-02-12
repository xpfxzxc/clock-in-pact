import type { FeedEventType } from "@prisma/client";

import type { CreateFeedEventInput, FeedListResponse } from "../types/feed";
import { AppError } from "../utils/app-error";

type FeedEventRecord = {
  id: number;
  eventType: FeedEventType;
  actor: { nickname: string } | null;
  metadata: unknown;
  createdAt: Date;
};

export interface FeedPrismaClient {
  feedEvent: {
    create(args: {
      data: {
        groupId: number;
        eventType: FeedEventType;
        actorId?: number;
        metadata: object;
      };
    }): Promise<unknown>;
    findMany(args: {
      where: { groupId: number; id?: { lt: number } };
      orderBy: Array<{ createdAt: "desc" } | { id: "desc" }>;
      take: number;
      include: { actor: { select: { nickname: true } } };
    }): Promise<FeedEventRecord[]>;
  };
  groupMember: {
    findUnique(args: {
      where: { groupId_userId: { groupId: number; userId: number } };
      select: { id: true };
    }): Promise<{ id: number } | null>;
  };
}

function toMetadataRecord(metadata: unknown): Record<string, unknown> {
  if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
    return metadata as Record<string, unknown>;
  }
  return {};
}

export async function createFeedEvent(
  input: CreateFeedEventInput,
  deps: { prisma: Pick<FeedPrismaClient, "feedEvent"> }
): Promise<void> {
  await deps.prisma.feedEvent.create({
    data: {
      groupId: input.groupId,
      eventType: input.eventType,
      actorId: input.actorId,
      metadata: input.metadata as object,
    },
  });
}

export async function getFeedEvents(
  groupId: number,
  userId: number,
  options: { cursor?: number; limit?: number },
  deps: { prisma: FeedPrismaClient }
): Promise<FeedListResponse> {
  const membership = await deps.prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId } },
    select: { id: true },
  });

  if (!membership) {
    throw new AppError(403, "您不是该小组成员");
  }

  const limit = options.limit ?? 20;
  const items = await deps.prisma.feedEvent.findMany({
    where: {
      groupId,
      ...(options.cursor ? { id: { lt: options.cursor } } : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    include: {
      actor: {
        select: { nickname: true },
      },
    },
  });

  const hasMore = items.length > limit;
  const visibleItems = hasMore ? items.slice(0, limit) : items;

  return {
    events: visibleItems.map((item) => ({
      id: item.id,
      eventType: item.eventType,
      actorNickname: item.actor?.nickname ?? null,
      metadata: toMetadataRecord(item.metadata),
      createdAt: item.createdAt.toISOString(),
    })),
    nextCursor: hasMore ? visibleItems[visibleItems.length - 1]?.id ?? null : null,
  };
}
