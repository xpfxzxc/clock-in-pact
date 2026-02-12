import { describe, expect, it, vi } from "vitest";

import { createFeedEvent, getFeedEvents, type FeedPrismaClient } from "../../server/services/feed.service";
import { AppError } from "../../server/utils/app-error";

async function expectAppError(
  promise: Promise<unknown>,
  expected: { statusCode: number; message: string | RegExp }
) {
  await expect(promise).rejects.toBeInstanceOf(AppError);
  const caught = await promise.catch((e: unknown) => e);
  if (!(caught instanceof AppError)) throw caught;
  expect(caught).toMatchObject({ statusCode: expected.statusCode });
  if (expected.message instanceof RegExp) {
    expect(String(caught.message)).toMatch(expected.message);
  } else {
    expect(String(caught.message)).toBe(expected.message);
  }
}

function createPrismaMock() {
  const feedEventCreateMock = vi.fn().mockResolvedValue({});
  const feedEventFindManyMock = vi.fn().mockResolvedValue([]);
  const groupMemberFindUniqueMock = vi.fn();

  const prisma: FeedPrismaClient = {
    feedEvent: {
      create: feedEventCreateMock as unknown as FeedPrismaClient["feedEvent"]["create"],
      findMany: feedEventFindManyMock as unknown as FeedPrismaClient["feedEvent"]["findMany"],
    },
    groupMember: {
      findUnique: groupMemberFindUniqueMock as unknown as FeedPrismaClient["groupMember"]["findUnique"],
    },
  };

  return {
    prisma,
    mocks: {
      feedEventCreate: feedEventCreateMock,
      feedEventFindMany: feedEventFindManyMock,
      groupMemberFindUnique: groupMemberFindUniqueMock,
    },
  };
}

describe("feed.service createFeedEvent", () => {
  it("正常创建 feed event", async () => {
    const { prisma, mocks } = createPrismaMock();

    await createFeedEvent(
      {
        eventType: "GROUP_CREATED",
        actorId: 1,
        groupId: 10,
        metadata: { groupName: "测试小组" },
      },
      { prisma }
    );

    expect(mocks.feedEventCreate).toHaveBeenCalledWith({
      data: {
        groupId: 10,
        eventType: "GROUP_CREATED",
        actorId: 1,
        metadata: { groupName: "测试小组" },
      },
    });
  });

  it("系统事件 actorId 为 undefined", async () => {
    const { prisma, mocks } = createPrismaMock();

    await createFeedEvent(
      {
        eventType: "GOAL_STATUS_CHANGED",
        groupId: 10,
        metadata: { goalId: 1, goalName: "跑步", fromStatus: "UPCOMING", toStatus: "ACTIVE" },
      },
      { prisma }
    );

    expect(mocks.feedEventCreate).toHaveBeenCalledWith({
      data: {
        groupId: 10,
        eventType: "GOAL_STATUS_CHANGED",
        actorId: undefined,
        metadata: { goalId: 1, goalName: "跑步", fromStatus: "UPCOMING", toStatus: "ACTIVE" },
      },
    });
  });
});

describe("feed.service getFeedEvents", () => {
  it("非成员拒绝访问", async () => {
    const { prisma, mocks } = createPrismaMock();
    mocks.groupMemberFindUnique.mockResolvedValueOnce(null);

    await expectAppError(
      getFeedEvents(10, 1, {}, { prisma }),
      { statusCode: 403, message: "您不是该小组成员" }
    );

    expect(mocks.feedEventFindMany).not.toHaveBeenCalled();
  });

  it("正常返回事件列表（无 cursor）", async () => {
    const { prisma, mocks } = createPrismaMock();
    mocks.groupMemberFindUnique.mockResolvedValueOnce({ id: 100 });
    mocks.feedEventFindMany.mockResolvedValueOnce([
      {
        id: 5,
        eventType: "GROUP_CREATED",
        actor: { nickname: "Alice" },
        metadata: { groupName: "测试" },
        createdAt: new Date("2026-02-10T10:00:00.000Z"),
      },
      {
        id: 3,
        eventType: "MEMBER_JOINED",
        actor: { nickname: "Bob" },
        metadata: { role: "CHALLENGER", inviteCode: "ABC12345" },
        createdAt: new Date("2026-02-10T09:00:00.000Z"),
      },
    ]);

    const result = await getFeedEvents(10, 1, {}, { prisma });

    expect(result.events).toHaveLength(2);
    expect(result.events[0]!.id).toBe(5);
    expect(result.events[0]!.actorNickname).toBe("Alice");
    expect(result.events[1]!.id).toBe(3);
    expect(result.events[1]!.metadata).toMatchObject({ role: "CHALLENGER", inviteCode: "ABC12345" });
    expect(result.nextCursor).toBeNull();
  });

  it("带 cursor 分页", async () => {
    const { prisma, mocks } = createPrismaMock();
    mocks.groupMemberFindUnique.mockResolvedValueOnce({ id: 100 });
    mocks.feedEventFindMany.mockResolvedValueOnce([
      {
        id: 2,
        eventType: "GOAL_CREATED",
        actor: { nickname: "Alice" },
        metadata: { goalId: 1, goalName: "跑步" },
        createdAt: new Date("2026-02-10T08:00:00.000Z"),
      },
    ]);

    const result = await getFeedEvents(10, 1, { cursor: 3, limit: 5 }, { prisma });

    expect(mocks.feedEventFindMany).toHaveBeenCalledWith({
      where: { groupId: 10, id: { lt: 3 } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 6,
      include: { actor: { select: { nickname: true } } },
    });
    expect(result.events).toHaveLength(1);
    expect(result.nextCursor).toBeNull();
  });

  it("有更多数据时返回 nextCursor", async () => {
    const { prisma, mocks } = createPrismaMock();
    mocks.groupMemberFindUnique.mockResolvedValueOnce({ id: 100 });

    const items = [
      { id: 10, eventType: "GROUP_CREATED", actor: { nickname: "A" }, metadata: {}, createdAt: new Date() },
      { id: 8, eventType: "MEMBER_JOINED", actor: { nickname: "B" }, metadata: {}, createdAt: new Date() },
      { id: 5, eventType: "GOAL_CREATED", actor: null, metadata: {}, createdAt: new Date() },
    ];
    mocks.feedEventFindMany.mockResolvedValueOnce(items);

    const result = await getFeedEvents(10, 1, { limit: 2 }, { prisma });

    expect(result.events).toHaveLength(2);
    expect(result.nextCursor).toBe(8);
  });

  it("系统事件 actorNickname 为 null", async () => {
    const { prisma, mocks } = createPrismaMock();
    mocks.groupMemberFindUnique.mockResolvedValueOnce({ id: 100 });
    mocks.feedEventFindMany.mockResolvedValueOnce([
      {
        id: 1,
        eventType: "GOAL_STATUS_CHANGED",
        actor: null,
        metadata: { goalId: 1, goalName: "跑步", fromStatus: "UPCOMING", toStatus: "ACTIVE" },
        createdAt: new Date("2026-02-10T10:00:00.000Z"),
      },
    ]);

    const result = await getFeedEvents(10, 1, {}, { prisma });

    expect(result.events[0]!.actorNickname).toBeNull();
  });

  it("默认 limit 为 20", async () => {
    const { prisma, mocks } = createPrismaMock();
    mocks.groupMemberFindUnique.mockResolvedValueOnce({ id: 100 });
    mocks.feedEventFindMany.mockResolvedValueOnce([]);

    await getFeedEvents(10, 1, {}, { prisma });

    expect(mocks.feedEventFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 21 })
    );
  });
});
