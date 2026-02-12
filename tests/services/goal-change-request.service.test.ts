import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createGoalChangeRequest,
  voteGoalChangeRequest,
  getActiveChangeRequest,
  type GoalChangeRequestPrismaClient,
} from "../../server/services/goal-change-request.service";
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
  const goalFindUniqueMock = vi.fn();
  const goalUpdateMock = vi.fn();
  const goalFindManyMock = vi.fn();

  const groupFindUniqueMock = vi.fn().mockResolvedValue({ timezone: "Asia/Shanghai" });
  const groupMemberFindUniqueMock = vi.fn();
  const groupMemberFindManyMock = vi.fn();

  const goalChangeRequestFindFirstMock = vi.fn();
  const goalChangeRequestFindManyMock = vi.fn().mockResolvedValue([]);
  const goalChangeRequestFindUniqueMock = vi.fn();
  const goalChangeRequestCreateMock = vi.fn();
  const goalChangeRequestUpdateMock = vi.fn();
  const goalChangeRequestUpdateManyMock = vi.fn().mockResolvedValue({ count: 0 });

  const goalChangeVoteCreateManyMock = vi.fn();
  const goalChangeVoteFindUniqueMock = vi.fn();
  const goalChangeVoteFindManyMock = vi.fn();
  const goalChangeVoteUpdateMock = vi.fn();

  const goalConfirmationDeleteManyMock = vi.fn();
  const goalConfirmationCreateManyMock = vi.fn();
  const goalParticipantDeleteManyMock = vi.fn();
  const feedEventCreateMock = vi.fn();

  const categoryCompletionFindManyMock = vi.fn().mockResolvedValue([]);

  const transactionMock = vi.fn(async (fn: (tx: any) => Promise<unknown>) => {
    return fn({
      goal: {
        findUnique: goalFindUniqueMock,
        update: goalUpdateMock,
        findMany: goalFindManyMock,
      },
      group: {
        findUnique: groupFindUniqueMock,
      },
      groupMember: {
        findUnique: groupMemberFindUniqueMock,
        findMany: groupMemberFindManyMock,
      },
      goalChangeRequest: {
        findFirst: goalChangeRequestFindFirstMock,
        findMany: goalChangeRequestFindManyMock,
        findUnique: goalChangeRequestFindUniqueMock,
        create: goalChangeRequestCreateMock,
        update: goalChangeRequestUpdateMock,
        updateMany: goalChangeRequestUpdateManyMock,
      },
      goalChangeVote: {
        createMany: goalChangeVoteCreateManyMock,
        findUnique: goalChangeVoteFindUniqueMock,
        findMany: goalChangeVoteFindManyMock,
        update: goalChangeVoteUpdateMock,
      },
      goalConfirmation: {
        deleteMany: goalConfirmationDeleteManyMock,
        createMany: goalConfirmationCreateManyMock,
      },
      goalParticipant: {
        deleteMany: goalParticipantDeleteManyMock,
      },
      categoryCompletion: {
        findMany: categoryCompletionFindManyMock,
      },
      feedEvent: {
        create: feedEventCreateMock,
      },
    });
  });

  const prisma: GoalChangeRequestPrismaClient = {
    $transaction: transactionMock as any,
    goal: { findUnique: goalFindUniqueMock as any, findMany: goalFindManyMock as any },
    groupMember: { findUnique: groupMemberFindUniqueMock as any },
    goalChangeRequest: {
      findFirst: goalChangeRequestFindFirstMock as any,
      findMany: goalChangeRequestFindManyMock as any,
      findUnique: goalChangeRequestFindUniqueMock as any,
      updateMany: goalChangeRequestUpdateManyMock as any,
    },
    feedEvent: {
      create: feedEventCreateMock as any,
    },
  };

  return {
    prisma,
    mocks: {
      transaction: transactionMock,
      goalFindUnique: goalFindUniqueMock,
      goalUpdate: goalUpdateMock,
      goalFindMany: goalFindManyMock,
      groupFindUnique: groupFindUniqueMock,
      groupMemberFindUnique: groupMemberFindUniqueMock,
      groupMemberFindMany: groupMemberFindManyMock,
      goalChangeRequestFindFirst: goalChangeRequestFindFirstMock,
      goalChangeRequestFindMany: goalChangeRequestFindManyMock,
      goalChangeRequestFindUnique: goalChangeRequestFindUniqueMock,
      goalChangeRequestCreate: goalChangeRequestCreateMock,
      goalChangeRequestUpdate: goalChangeRequestUpdateMock,
      goalChangeRequestUpdateMany: goalChangeRequestUpdateManyMock,
      goalChangeVoteCreateMany: goalChangeVoteCreateManyMock,
      goalChangeVoteFindUnique: goalChangeVoteFindUniqueMock,
      goalChangeVoteFindMany: goalChangeVoteFindManyMock,
      goalChangeVoteUpdate: goalChangeVoteUpdateMock,
      goalConfirmationDeleteMany: goalConfirmationDeleteManyMock,
      goalConfirmationCreateMany: goalConfirmationCreateManyMock,
      goalParticipantDeleteMany: goalParticipantDeleteManyMock,
      categoryCompletionFindMany: categoryCompletionFindManyMock,
      feedEventCreate: feedEventCreateMock,
    },
  };
}

const NOW = new Date("2026-03-15T10:00:00Z");
const FUTURE_START = new Date(Date.UTC(2026, 3, 1)); // 2026-04-01
const FUTURE_END = new Date(Date.UTC(2026, 3, 30)); // 2026-04-30

function makeGoal(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    groupId: 10,
    status: "PENDING",
    startDate: FUTURE_START,
    endDate: FUTURE_END,
    category: "运动",
    name: "跑步",
    targetValue: 5,
    unit: "公里",
    rewardPunishment: "请吃饭",
    evidenceRequirement: "截图",
    ...overrides,
  };
}

function makeChangeRequest(overrides: Record<string, unknown> = {}) {
  return {
    id: 100,
    goalId: 1,
    type: "MODIFY",
    status: "PENDING",
    initiatorId: 1,
    proposedChanges: { name: "新名称" },
    expiresAt: new Date(NOW.getTime() + 24 * 60 * 60 * 1000),
    createdAt: NOW,
    updatedAt: NOW,
    initiator: { id: 1, userId: 1, user: { nickname: "用户A" } },
    goal: { id: 1, name: "跑步", groupId: 10, group: { timezone: "Asia/Shanghai" } },
    votes: [
      {
        memberId: 1,
        status: "APPROVED",
        updatedAt: NOW,
        member: { userId: 1, role: "CHALLENGER", user: { nickname: "用户A" } },
      },
      {
        memberId: 2,
        status: "PENDING",
        updatedAt: NOW,
        member: { userId: 2, role: "SUPERVISOR", user: { nickname: "用户B" } },
      },
    ],
    ...overrides,
  };
}

describe("goal-change-request.service", () => {
  let ctx: ReturnType<typeof createPrismaMock>;

  beforeEach(() => {
    ctx = createPrismaMock();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe("createGoalChangeRequest", () => {
    it("成功创建 MODIFY 请求（发起人自动同意）", async () => {
      const goal = makeGoal();
      ctx.mocks.goalFindUnique.mockResolvedValue(goal);
      ctx.mocks.groupMemberFindUnique.mockResolvedValue({ id: 1 });
      ctx.mocks.goalChangeRequestFindFirst.mockResolvedValue(null);
      ctx.mocks.groupMemberFindMany
        .mockResolvedValueOnce([{ userId: 1 }]) // challengers
        .mockResolvedValueOnce([{ id: 1 }, { id: 2 }]); // all members
      ctx.mocks.categoryCompletionFindMany.mockResolvedValue([]);
      ctx.mocks.goalChangeRequestCreate.mockResolvedValue({
        id: 100,
        goalId: 1,
        type: "MODIFY",
        status: "PENDING",
        initiatorId: 1,
        proposedChanges: { name: "新名称" },
        expiresAt: new Date(NOW.getTime() + 24 * 60 * 60 * 1000),
        createdAt: NOW,
      });
      ctx.mocks.goalChangeRequestFindUnique.mockResolvedValue(makeChangeRequest());

      const result = await createGoalChangeRequest(
        { goalId: 1, type: "MODIFY", proposedChanges: { name: "新名称" } },
        1,
        { prisma: ctx.prisma, now: () => NOW }
      );

      expect(result.id).toBe(100);
      expect(result.type).toBe("MODIFY");
      expect(result.votes).toHaveLength(2);
      const initiatorVote = result.votes.find((v) => v.userId === 1);
      expect(initiatorVote?.status).toBe("APPROVED");
      expect(ctx.mocks.goalChangeVoteCreateMany).toHaveBeenCalled();
      expect(ctx.mocks.feedEventCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            eventType: "CHANGE_REQUEST_AUTO_APPROVED",
            actorId: undefined,
            groupId: 10,
            metadata: {
              requestId: 100,
              goalId: 1,
              goalName: "跑步",
              type: "MODIFY",
            },
          }),
        })
      );
    });

    it("成功创建 CANCEL 请求", async () => {
      const goal = makeGoal();
      ctx.mocks.goalFindUnique.mockResolvedValue(goal);
      ctx.mocks.groupMemberFindUnique.mockResolvedValue({ id: 1 });
      ctx.mocks.goalChangeRequestFindFirst.mockResolvedValue(null);
      ctx.mocks.groupMemberFindMany.mockResolvedValue([{ id: 1 }, { id: 2 }]);
      ctx.mocks.goalChangeRequestCreate.mockResolvedValue({
        id: 101,
        goalId: 1,
        type: "CANCEL",
        status: "PENDING",
        initiatorId: 1,
        proposedChanges: null,
        expiresAt: new Date(NOW.getTime() + 24 * 60 * 60 * 1000),
        createdAt: NOW,
      });
      ctx.mocks.goalChangeRequestFindUnique.mockResolvedValue(
        makeChangeRequest({ id: 101, type: "CANCEL", proposedChanges: null })
      );

      const result = await createGoalChangeRequest(
        { goalId: 1, type: "CANCEL" },
        1,
        { prisma: ctx.prisma, now: () => NOW }
      );

      expect(result.type).toBe("CANCEL");
    });

    it("单成员小组自动通过时，写入 CHANGE_REQUEST_RESULT(APPROVED) 动态", async () => {
      const goal = makeGoal();
      ctx.mocks.goalFindUnique.mockResolvedValue(goal);
      ctx.mocks.groupMemberFindUnique.mockResolvedValue({ id: 1 });
      ctx.mocks.goalChangeRequestFindFirst.mockResolvedValue(null);
      ctx.mocks.groupMemberFindMany.mockResolvedValue([{ id: 1 }]);
      ctx.mocks.goalChangeRequestCreate.mockResolvedValue({
        id: 102,
        goalId: 1,
        type: "CANCEL",
        status: "PENDING",
        initiatorId: 1,
        proposedChanges: null,
        expiresAt: new Date(NOW.getTime() + 24 * 60 * 60 * 1000),
        createdAt: NOW,
      });
      ctx.mocks.goalChangeRequestFindUnique.mockResolvedValue(
        makeChangeRequest({
          id: 102,
          type: "CANCEL",
          status: "APPROVED",
          proposedChanges: null,
          votes: [
            {
              memberId: 1,
              status: "APPROVED",
              updatedAt: NOW,
              member: { userId: 1, role: "SUPERVISOR", user: { nickname: "用户A" } },
            },
          ],
        })
      );

      const result = await createGoalChangeRequest(
        { goalId: 1, type: "CANCEL" },
        1,
        { prisma: ctx.prisma, now: () => NOW }
      );

      expect(result.type).toBe("CANCEL");
      expect(ctx.mocks.feedEventCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            eventType: "CHANGE_REQUEST_RESULT",
            actorId: undefined,
            groupId: 10,
            metadata: {
              requestId: 102,
              goalId: 1,
              goalName: "跑步",
              type: "CANCEL",
              result: "APPROVED",
            },
          }),
        })
      );
    });

    it("已有 PENDING 请求时不可发起新请求", async () => {
      ctx.mocks.goalFindUnique.mockResolvedValue(makeGoal());
      ctx.mocks.groupMemberFindUnique.mockResolvedValue({ id: 1 });
      ctx.mocks.goalChangeRequestFindFirst.mockResolvedValue({ id: 99 });

      await expectAppError(
        createGoalChangeRequest(
          { goalId: 1, type: "CANCEL" },
          1,
          { prisma: ctx.prisma, now: () => NOW }
        ),
        { statusCode: 400, message: "当前已有待确认的修改/取消请求，请等待结果后再操作" }
      );
    });

    it("过期请求不阻塞新请求：创建前先清理过期记录", async () => {
      const goal = makeGoal();
      ctx.mocks.goalFindUnique.mockResolvedValue(goal);
      ctx.mocks.groupMemberFindUnique.mockResolvedValue({ id: 1 });
      ctx.mocks.goalChangeRequestUpdateMany.mockResolvedValue({ count: 1 });
      ctx.mocks.goalChangeRequestFindFirst.mockResolvedValue(null);
      ctx.mocks.groupMemberFindMany.mockResolvedValue([{ id: 1 }, { id: 2 }]);
      ctx.mocks.goalChangeRequestCreate.mockResolvedValue({
        id: 102,
        goalId: 1,
        type: "CANCEL",
        status: "PENDING",
        initiatorId: 1,
        proposedChanges: null,
        expiresAt: new Date(NOW.getTime() + 24 * 60 * 60 * 1000),
        createdAt: NOW,
      });
      ctx.mocks.goalChangeRequestFindUnique.mockResolvedValue(
        makeChangeRequest({ id: 102, type: "CANCEL", proposedChanges: null })
      );

      const result = await createGoalChangeRequest(
        { goalId: 1, type: "CANCEL" },
        1,
        { prisma: ctx.prisma, now: () => NOW }
      );

      expect(result.id).toBe(102);
      expect(ctx.mocks.goalChangeRequestUpdateMany).toHaveBeenCalledWith({
        where: {
          goalId: 1,
          status: "PENDING",
          expiresAt: { lte: NOW },
        },
        data: { status: "EXPIRED" },
      });
      expect(ctx.mocks.goalChangeRequestFindFirst).toHaveBeenCalledWith({
        where: {
          goalId: 1,
          status: "PENDING",
          expiresAt: { gt: NOW },
        },
        select: { id: true },
      });
    });

    it("场景10：新开始日期已到达时，创建前会将该请求标记为 EXPIRED", async () => {
      const now = new Date("2026-03-15T16:00:00.000Z"); // Asia/Shanghai = 2026-03-16 00:00:00
      const goal = makeGoal();
      ctx.mocks.goalFindUnique.mockResolvedValue(goal);
      ctx.mocks.groupMemberFindUnique.mockResolvedValue({ id: 1 });
      ctx.mocks.goalChangeRequestFindMany.mockResolvedValue([
        {
          id: 77,
          type: "MODIFY",
          expiresAt: new Date("2026-03-16T10:00:00.000Z"),
          proposedChanges: { startDate: "2026-03-16" },
          goal: { group: { timezone: "Asia/Shanghai" } },
        },
      ]);
      ctx.mocks.goalChangeRequestFindFirst.mockResolvedValue(null);
      ctx.mocks.groupMemberFindMany.mockResolvedValue([{ id: 1 }, { id: 2 }]);
      ctx.mocks.goalChangeRequestCreate.mockResolvedValue({
        id: 103,
        goalId: 1,
        type: "CANCEL",
        status: "PENDING",
        initiatorId: 1,
        proposedChanges: null,
        expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
        createdAt: now,
      });
      ctx.mocks.goalChangeRequestFindUnique.mockResolvedValue(
        makeChangeRequest({
          id: 103,
          type: "CANCEL",
          proposedChanges: null,
          createdAt: now,
          expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
        })
      );

      const result = await createGoalChangeRequest(
        { goalId: 1, type: "CANCEL" },
        1,
        { prisma: ctx.prisma, now: () => now }
      );

      expect(result.id).toBe(103);
      expect(ctx.mocks.goalChangeRequestUpdateMany).toHaveBeenNthCalledWith(2, {
        where: {
          id: { in: [77] },
          status: "PENDING",
        },
        data: { status: "EXPIRED" },
      });
    });

    it("ACTIVE 目标不可修改 startDate", async () => {
      ctx.mocks.goalFindUnique.mockResolvedValue(makeGoal({ status: "ACTIVE" }));
      ctx.mocks.groupMemberFindUnique.mockResolvedValue({ id: 1 });
      ctx.mocks.goalChangeRequestFindFirst.mockResolvedValue(null);

      await expectAppError(
        createGoalChangeRequest(
          { goalId: 1, type: "MODIFY", proposedChanges: { startDate: "2026-05-01" } },
          1,
          { prisma: ctx.prisma, now: () => NOW }
        ),
        { statusCode: 400, message: "进行中的目标不可修改开始日期" }
      );
    });

    it("场景11：ACTIVE 目标修改 endDate 为当天或过去日期时失败", async () => {
      ctx.mocks.goalFindUnique.mockResolvedValue(makeGoal({ status: "ACTIVE" }));
      ctx.mocks.groupMemberFindUnique.mockResolvedValue({ id: 1 });
      ctx.mocks.goalChangeRequestFindFirst.mockResolvedValue(null);

      await expectAppError(
        createGoalChangeRequest(
          { goalId: 1, type: "MODIFY", proposedChanges: { endDate: "2026-03-15" } },
          1,
          { prisma: ctx.prisma, now: () => NOW }
        ),
        { statusCode: 400, message: "结束日期必须是未来日期" }
      );
    });

    it("MODIFY 请求中结束日期早于开始日期时失败", async () => {
      ctx.mocks.goalFindUnique.mockResolvedValue(makeGoal({ status: "PENDING" }));
      ctx.mocks.groupMemberFindUnique.mockResolvedValue({ id: 1 });
      ctx.mocks.goalChangeRequestFindFirst.mockResolvedValue(null);

      await expectAppError(
        createGoalChangeRequest(
          {
            goalId: 1,
            type: "MODIFY",
            proposedChanges: {
              startDate: "2026-04-20",
              endDate: "2026-04-19",
            },
          },
          1,
          { prisma: ctx.prisma, now: () => NOW }
        ),
        { statusCode: 400, message: "结束日期不能早于开始日期" }
      );
    });

    it("非可修改状态不可发起请求", async () => {
      for (const status of ["VOIDED", "CANCELLED", "ARCHIVED", "SETTLING"]) {
        ctx.mocks.goalFindUnique.mockResolvedValue(makeGoal({ status }));
        ctx.mocks.groupMemberFindUnique.mockResolvedValue({ id: 1 });

        await expectAppError(
          createGoalChangeRequest(
            { goalId: 1, type: "CANCEL" },
            1,
            { prisma: ctx.prisma, now: () => NOW }
          ),
          { statusCode: 400, message: "当前目标状态不允许发起修改/取消请求" }
        );
      }
    });

    it("ACTIVE 目标修改 endDate 需符合时长阶梯", async () => {
      const goal = makeGoal({
        status: "ACTIVE",
        startDate: new Date(Date.UTC(2026, 2, 1)), // 2026-03-01
        endDate: new Date(Date.UTC(2026, 3, 30)),
      });
      ctx.mocks.goalFindUnique.mockResolvedValue(goal);
      ctx.mocks.groupMemberFindUnique.mockResolvedValue({ id: 1 });
      ctx.mocks.goalChangeRequestFindFirst.mockResolvedValue(null);
      ctx.mocks.groupMemberFindMany
        .mockResolvedValueOnce([{ userId: 1 }]) // challengers
        .mockResolvedValueOnce([{ id: 1 }, { id: 2 }]); // all members
      ctx.mocks.categoryCompletionFindMany.mockResolvedValue([]);

      // 新手最长1个月，改到3个月后应失败
      await expectAppError(
        createGoalChangeRequest(
          { goalId: 1, type: "MODIFY", proposedChanges: { endDate: "2026-06-30" } },
          1,
          { prisma: ctx.prisma, now: () => NOW }
        ),
        { statusCode: 400, message: /修改后时长超出限制/ }
      );
    });
  });

  describe("voteGoalChangeRequest", () => {
    it("投票 APPROVED 但未全员通过 → 请求保持 PENDING", async () => {
      ctx.mocks.goalChangeRequestFindUnique.mockResolvedValue(makeChangeRequest());
      ctx.mocks.groupMemberFindUnique.mockResolvedValue({ id: 2 });
      ctx.mocks.goalChangeVoteFindUnique.mockResolvedValue({ status: "PENDING" });
      ctx.mocks.goalChangeVoteUpdate.mockResolvedValue({});
      ctx.mocks.groupMemberFindMany.mockResolvedValue([{ id: 1 }, { id: 2 }, { id: 3 }]);
      ctx.mocks.goalChangeVoteFindMany.mockResolvedValue([
        { memberId: 1, status: "APPROVED" },
        { memberId: 2, status: "APPROVED" },
        { memberId: 3, status: "PENDING" },
      ]);

      const result = await voteGoalChangeRequest(100, 2, "APPROVED", {
        prisma: ctx.prisma,
        now: () => NOW,
      });

      expect(result.requestStatus).toBe("PENDING");
      expect(result.voteStatus).toBe("APPROVED");
      expect(ctx.mocks.feedEventCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            eventType: "CHANGE_REQUEST_CONFIRMED",
            actorId: 2,
            groupId: 10,
            metadata: {
              requestId: 100,
              goalId: 1,
              goalName: "跑步",
              type: "MODIFY",
              status: "APPROVED",
            },
          }),
        })
      );
    });

    it("全员通过 MODIFY（PENDING 目标）→ 确认重置", async () => {
      ctx.mocks.goalChangeRequestFindUnique.mockResolvedValue(makeChangeRequest());
      ctx.mocks.groupMemberFindUnique.mockResolvedValue({ id: 2 });
      ctx.mocks.goalChangeVoteFindUnique.mockResolvedValue({ status: "PENDING" });
      ctx.mocks.goalChangeVoteUpdate.mockResolvedValue({});
      ctx.mocks.groupMemberFindMany.mockResolvedValue([{ id: 1 }, { id: 2 }]);
      ctx.mocks.goalChangeVoteFindMany.mockResolvedValue([
        { memberId: 1, status: "APPROVED" },
        { memberId: 2, status: "APPROVED" },
      ]);
      // applyGoalChangeRequest mocks
      ctx.mocks.goalFindUnique.mockResolvedValue(makeGoal({ status: "PENDING" }));
      ctx.mocks.goalUpdate.mockResolvedValue({});
      ctx.mocks.goalConfirmationDeleteMany.mockResolvedValue({});
      ctx.mocks.goalConfirmationCreateMany.mockResolvedValue({});
      ctx.mocks.goalChangeRequestUpdate.mockResolvedValue({});

      const result = await voteGoalChangeRequest(100, 2, "APPROVED", {
        prisma: ctx.prisma,
        now: () => NOW,
      });

      expect(result.requestStatus).toBe("APPROVED");
      expect(ctx.mocks.goalConfirmationDeleteMany).toHaveBeenCalledWith({ where: { goalId: 1 } });
      expect(ctx.mocks.goalConfirmationCreateMany).toHaveBeenCalled();
    });

    it("全员通过 MODIFY（UPCOMING 目标）→ 状态回退 PENDING + 确认重置", async () => {
      ctx.mocks.goalChangeRequestFindUnique.mockResolvedValue(makeChangeRequest());
      ctx.mocks.groupMemberFindUnique.mockResolvedValue({ id: 2 });
      ctx.mocks.goalChangeVoteFindUnique.mockResolvedValue({ status: "PENDING" });
      ctx.mocks.goalChangeVoteUpdate.mockResolvedValue({});
      ctx.mocks.groupMemberFindMany.mockResolvedValue([{ id: 1 }, { id: 2 }]);
      ctx.mocks.goalChangeVoteFindMany.mockResolvedValue([
        { memberId: 1, status: "APPROVED" },
        { memberId: 2, status: "APPROVED" },
      ]);
      ctx.mocks.goalFindUnique.mockResolvedValue(makeGoal({ status: "UPCOMING" }));
      ctx.mocks.goalUpdate.mockResolvedValue({});
      ctx.mocks.goalConfirmationDeleteMany.mockResolvedValue({});
      ctx.mocks.goalConfirmationCreateMany.mockResolvedValue({});
      ctx.mocks.goalParticipantDeleteMany.mockResolvedValue({});
      ctx.mocks.goalChangeRequestUpdate.mockResolvedValue({});

      const result = await voteGoalChangeRequest(100, 2, "APPROVED", {
        prisma: ctx.prisma,
        now: () => NOW,
      });

      expect(result.requestStatus).toBe("APPROVED");
      // 状态回退为 PENDING
      expect(ctx.mocks.goalUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: "PENDING" } })
      );
      expect(ctx.mocks.goalParticipantDeleteMany).toHaveBeenCalledWith({ where: { goalId: 1 } });
    });

    it("全员通过 CANCEL → 目标 CANCELLED", async () => {
      const cancelRequest = makeChangeRequest({ type: "CANCEL", proposedChanges: null });
      ctx.mocks.goalChangeRequestFindUnique.mockResolvedValue(cancelRequest);
      ctx.mocks.groupMemberFindUnique.mockResolvedValue({ id: 2 });
      ctx.mocks.goalChangeVoteFindUnique.mockResolvedValue({ status: "PENDING" });
      ctx.mocks.goalChangeVoteUpdate.mockResolvedValue({});
      ctx.mocks.groupMemberFindMany.mockResolvedValue([{ id: 1 }, { id: 2 }]);
      ctx.mocks.goalChangeVoteFindMany.mockResolvedValue([
        { memberId: 1, status: "APPROVED" },
        { memberId: 2, status: "APPROVED" },
      ]);
      ctx.mocks.goalFindUnique.mockResolvedValue(makeGoal());
      ctx.mocks.goalUpdate.mockResolvedValue({});
      ctx.mocks.goalChangeRequestUpdate.mockResolvedValue({});

      const result = await voteGoalChangeRequest(100, 2, "APPROVED", {
        prisma: ctx.prisma,
        now: () => NOW,
      });

      expect(result.requestStatus).toBe("APPROVED");
      expect(ctx.mocks.goalUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: "CANCELLED" } })
      );
    });

    it("投票 REJECTED → 请求 REJECTED", async () => {
      ctx.mocks.goalChangeRequestFindUnique.mockResolvedValue(makeChangeRequest());
      ctx.mocks.groupMemberFindUnique.mockResolvedValue({ id: 2 });
      ctx.mocks.goalChangeVoteFindUnique.mockResolvedValue({ status: "PENDING" });
      ctx.mocks.goalChangeVoteUpdate.mockResolvedValue({});
      ctx.mocks.goalChangeRequestUpdate.mockResolvedValue({});

      const result = await voteGoalChangeRequest(100, 2, "REJECTED", {
        prisma: ctx.prisma,
        now: () => NOW,
      });

      expect(result.requestStatus).toBe("REJECTED");
      expect(result.voteStatus).toBe("REJECTED");
      expect(ctx.mocks.feedEventCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            eventType: "CHANGE_REQUEST_CONFIRMED",
            actorId: 2,
            groupId: 10,
            metadata: {
              requestId: 100,
              goalId: 1,
              goalName: "跑步",
              type: "MODIFY",
              status: "REJECTED",
            },
          }),
        })
      );
    });

    it("过期请求不可投票", async () => {
      const expiredRequest = makeChangeRequest({
        expiresAt: new Date(NOW.getTime() - 1000),
      });
      ctx.mocks.goalChangeRequestFindUnique.mockResolvedValue(expiredRequest);
      ctx.mocks.goalChangeRequestUpdate.mockResolvedValue({});

      await expectAppError(
        voteGoalChangeRequest(100, 2, "APPROVED", {
          prisma: ctx.prisma,
          now: () => NOW,
        }),
        { statusCode: 400, message: "请求已过期" }
      );
    });

    it("场景12：新结束日期已到达时不可投票", async () => {
      const now = new Date("2026-03-15T16:00:00.000Z"); // Asia/Shanghai = 2026-03-16 00:00:00
      const expiredByEndDateRequest = makeChangeRequest({
        expiresAt: new Date("2026-03-16T10:00:00.000Z"),
        proposedChanges: { endDate: "2026-03-16" },
        goal: { groupId: 10, group: { timezone: "Asia/Shanghai" } },
      });
      ctx.mocks.goalChangeRequestFindUnique.mockResolvedValue(expiredByEndDateRequest);
      ctx.mocks.goalChangeRequestUpdate.mockResolvedValue({});

      await expectAppError(
        voteGoalChangeRequest(100, 2, "APPROVED", {
          prisma: ctx.prisma,
          now: () => now,
        }),
        { statusCode: 400, message: "请求已过期" }
      );
    });
  });

  describe("getActiveChangeRequest", () => {
    it("仅返回未过期的 PENDING 请求", async () => {
      ctx.mocks.goalFindUnique.mockResolvedValue({ id: 1, groupId: 10 });
      ctx.mocks.groupMemberFindUnique.mockResolvedValue({ id: 2 });
      ctx.mocks.goalChangeRequestUpdateMany.mockResolvedValue({ count: 1 });
      ctx.mocks.goalChangeRequestFindFirst.mockResolvedValue(makeChangeRequest());

      const result = await getActiveChangeRequest(1, 2, {
        prisma: ctx.prisma,
        now: () => NOW,
      });

      expect(result?.id).toBe(100);
      expect(result?.myVoteStatus).toBe("PENDING");
      expect(ctx.mocks.goalChangeRequestUpdateMany).toHaveBeenCalledWith({
        where: {
          goalId: 1,
          status: "PENDING",
          expiresAt: { lte: NOW },
        },
        data: { status: "EXPIRED" },
      });
      expect(ctx.mocks.goalChangeRequestFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            goalId: 1,
            status: "PENDING",
            expiresAt: { gt: NOW },
          },
        })
      );
    });


    it("MODIFY + startDate 返回场景10的有效截止时间", async () => {
      ctx.mocks.goalFindUnique.mockResolvedValue({ id: 1, groupId: 10 });
      ctx.mocks.groupMemberFindUnique.mockResolvedValue({ id: 2 });
      ctx.mocks.goalChangeRequestFindFirst.mockResolvedValue(
        makeChangeRequest({
          proposedChanges: { startDate: "2026-03-16" },
          goal: { groupId: 10, group: { timezone: "Asia/Shanghai" } },
        })
      );

      const result = await getActiveChangeRequest(1, 2, {
        prisma: ctx.prisma,
        now: () => NOW,
      });

      expect(result?.expiresAt).toBe("2026-03-16T10:00:00.000Z");
      expect(result?.effectiveExpiresAt).toBe("2026-03-15T16:00:00.000Z");
    });

    it("MODIFY + endDate 返回场景12的有效截止时间", async () => {
      ctx.mocks.goalFindUnique.mockResolvedValue({ id: 1, groupId: 10 });
      ctx.mocks.groupMemberFindUnique.mockResolvedValue({ id: 2 });
      ctx.mocks.goalChangeRequestFindFirst.mockResolvedValue(
        makeChangeRequest({
          proposedChanges: { endDate: "2026-03-16" },
          goal: { groupId: 10, group: { timezone: "Asia/Shanghai" } },
        })
      );

      const result = await getActiveChangeRequest(1, 2, {
        prisma: ctx.prisma,
        now: () => NOW,
      });

      expect(result?.expiresAt).toBe("2026-03-16T10:00:00.000Z");
      expect(result?.effectiveExpiresAt).toBe("2026-03-15T16:00:00.000Z");
    });

    it("不存在有效请求时返回 null", async () => {
      ctx.mocks.goalFindUnique.mockResolvedValue({ id: 1, groupId: 10 });
      ctx.mocks.groupMemberFindUnique.mockResolvedValue({ id: 2 });
      ctx.mocks.goalChangeRequestFindFirst.mockResolvedValue(null);

      const result = await getActiveChangeRequest(1, 2, {
        prisma: ctx.prisma,
        now: () => NOW,
      });

      expect(result).toBeNull();
    });
  });
});
