import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  confirmSettlement,
  getSettlementResult,
  type SettlementPrismaClient,
} from "../../server/services/settlement.service";
import { AppError } from "../../server/utils/app-error";

async function expectAppError(
  promise: Promise<unknown>,
  expected: { statusCode: number; message: string | RegExp }
) {
  await expect(promise).rejects.toBeInstanceOf(AppError);
  const caught = await promise.catch((error: unknown) => error);

  if (!(caught instanceof AppError)) {
    throw caught;
  }

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
  const goalUpdateManyMock = vi.fn();
  const groupMemberFindUniqueMock = vi.fn();
  const groupMemberFindManyMock = vi.fn();
  const checkinCountMock = vi.fn();
  const checkinFindManyMock = vi.fn();
  const settlementConfirmationFindUniqueMock = vi.fn();
  const settlementConfirmationCreateMock = vi.fn();
  const settlementConfirmationCountMock = vi.fn();
  const settlementConfirmationFindManyMock = vi.fn();
  const goalParticipantFindManyMock = vi.fn();
  const categoryCompletionUpsertMock = vi.fn();
  const categoryCompletionFindUniqueMock = vi.fn();
  const categoryCompletionFindManyMock = vi.fn();
  const feedEventCreateMock = vi.fn();

  const transactionMock = vi.fn(async (fn: (tx: any) => Promise<unknown>) =>
    fn({
      goal: {
        findUnique: goalFindUniqueMock,
        update: goalUpdateMock,
        updateMany: goalUpdateManyMock,
      },
      groupMember: {
        findUnique: groupMemberFindUniqueMock,
        findMany: groupMemberFindManyMock,
      },
      checkin: {
        count: checkinCountMock,
        findMany: checkinFindManyMock,
      },
      settlementConfirmation: {
        findUnique: settlementConfirmationFindUniqueMock,
        create: settlementConfirmationCreateMock,
        count: settlementConfirmationCountMock,
      },
      goalParticipant: {
        findMany: goalParticipantFindManyMock,
      },
      categoryCompletion: {
        upsert: categoryCompletionUpsertMock,
        findUnique: categoryCompletionFindUniqueMock,
      },
      feedEvent: {
        create: feedEventCreateMock,
      },
    })
  );

  const prisma: SettlementPrismaClient = {
    $transaction: transactionMock as unknown as SettlementPrismaClient["$transaction"],
    goal: {
      findUnique: goalFindUniqueMock as unknown as SettlementPrismaClient["goal"]["findUnique"],
      update: goalUpdateMock as unknown as SettlementPrismaClient["goal"]["update"],
      updateMany: goalUpdateManyMock as unknown as SettlementPrismaClient["goal"]["updateMany"],
    },
    groupMember: {
      findUnique: groupMemberFindUniqueMock as unknown as SettlementPrismaClient["groupMember"]["findUnique"],
      findMany: groupMemberFindManyMock as unknown as SettlementPrismaClient["groupMember"]["findMany"],
    },
    checkin: {
      count: checkinCountMock as unknown as SettlementPrismaClient["checkin"]["count"],
      findMany: checkinFindManyMock as unknown as SettlementPrismaClient["checkin"]["findMany"],
    },
    settlementConfirmation: {
      findUnique:
        settlementConfirmationFindUniqueMock as unknown as SettlementPrismaClient["settlementConfirmation"]["findUnique"],
      create:
        settlementConfirmationCreateMock as unknown as SettlementPrismaClient["settlementConfirmation"]["create"],
      count: settlementConfirmationCountMock as unknown as SettlementPrismaClient["settlementConfirmation"]["count"],
      findMany:
        settlementConfirmationFindManyMock as unknown as SettlementPrismaClient["settlementConfirmation"]["findMany"],
    },
    goalParticipant: {
      findMany: goalParticipantFindManyMock as unknown as SettlementPrismaClient["goalParticipant"]["findMany"],
    },
    categoryCompletion: {
      upsert: categoryCompletionUpsertMock as unknown as SettlementPrismaClient["categoryCompletion"]["upsert"],
      findUnique:
        categoryCompletionFindUniqueMock as unknown as SettlementPrismaClient["categoryCompletion"]["findUnique"],
      findMany: categoryCompletionFindManyMock as unknown as SettlementPrismaClient["categoryCompletion"]["findMany"],
    },
    feedEvent: {
      create: feedEventCreateMock as unknown as SettlementPrismaClient["feedEvent"]["create"],
    },
  };

  return {
    prisma,
    mocks: {
      transaction: transactionMock,
      goalFindUnique: goalFindUniqueMock,
      goalUpdate: goalUpdateMock,
      goalUpdateMany: goalUpdateManyMock,
      groupMemberFindUnique: groupMemberFindUniqueMock,
      groupMemberFindMany: groupMemberFindManyMock,
      checkinCount: checkinCountMock,
      checkinFindMany: checkinFindManyMock,
      settlementConfirmationFindUnique: settlementConfirmationFindUniqueMock,
      settlementConfirmationCreate: settlementConfirmationCreateMock,
      settlementConfirmationCount: settlementConfirmationCountMock,
      settlementConfirmationFindMany: settlementConfirmationFindManyMock,
      goalParticipantFindMany: goalParticipantFindManyMock,
      categoryCompletionUpsert: categoryCompletionUpsertMock,
      categoryCompletionFindUnique: categoryCompletionFindUniqueMock,
      categoryCompletionFindMany: categoryCompletionFindManyMock,
      feedEventCreate: feedEventCreateMock,
    },
  };
}

function mockBaseSettlingGoal(mocks: ReturnType<typeof createPrismaMock>["mocks"]) {
  mocks.goalFindUnique.mockResolvedValue({
    id: 10,
    groupId: 1,
    name: "跑步目标",
    category: "跑步",
    targetValue: { toNumber: () => 10 },
    unit: "km",
    startDate: new Date(Date.UTC(2026, 1, 1)),
    endDate: new Date(Date.UTC(2026, 1, 28)),
    rewardPunishment: "失败请客",
    status: "SETTLING",
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-02-10T12:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("settlement.service confirmSettlement", () => {
  it("确认结算成功（非最后一个监督者）", async () => {
    const { prisma, mocks } = createPrismaMock();
    mockBaseSettlingGoal(mocks);

    mocks.groupMemberFindUnique.mockResolvedValueOnce({ id: 201, role: "SUPERVISOR" });
    mocks.checkinCount.mockResolvedValue(0);
    mocks.settlementConfirmationFindUnique.mockResolvedValueOnce(null);
    mocks.settlementConfirmationCreate.mockResolvedValueOnce({ id: 1 });
    mocks.groupMemberFindMany.mockResolvedValueOnce([{ id: 201 }, { id: 202 }]);
    mocks.settlementConfirmationCount.mockResolvedValueOnce(1);

    const result = await confirmSettlement(10, 1, { prisma });

    expect(result).toEqual({ goalId: 10, archived: false });
    expect(mocks.goalUpdateMany).not.toHaveBeenCalled();
    expect(mocks.categoryCompletionUpsert).not.toHaveBeenCalled();
    expect(mocks.feedEventCreate).toHaveBeenCalledTimes(1);
    expect(mocks.feedEventCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventType: "SETTLEMENT_CONFIRMED",
          actorId: 1,
          groupId: 1,
          metadata: { goalId: 10, goalName: "跑步目标" },
        }),
      })
    );
  });

  it("确认结算成功（最后一个监督者，触发归档）", async () => {
    const { prisma, mocks } = createPrismaMock();
    mockBaseSettlingGoal(mocks);

    mocks.groupMemberFindUnique.mockResolvedValueOnce({ id: 202, role: "SUPERVISOR" });
    mocks.checkinCount.mockResolvedValue(0);
    mocks.settlementConfirmationFindUnique.mockResolvedValueOnce(null);
    mocks.settlementConfirmationCreate.mockResolvedValueOnce({ id: 2 });
    mocks.groupMemberFindMany.mockResolvedValueOnce([{ id: 201 }, { id: 202 }]);
    mocks.settlementConfirmationCount.mockResolvedValueOnce(2);
    mocks.goalParticipantFindMany.mockResolvedValueOnce([
      { memberId: 101, member: { userId: 11, user: { nickname: "挑战者A" } } },
      { memberId: 102, member: { userId: 12, user: { nickname: "挑战者B" } } },
    ]);
    mocks.checkinFindMany.mockResolvedValueOnce([
      { memberId: 101, value: { toNumber: () => 8 } },
      { memberId: 101, value: { toString: () => "4.5" } },
      { memberId: 102, value: { toNumber: () => 7 } },
    ]);
    mocks.categoryCompletionUpsert.mockResolvedValue({ id: 1 });
    mocks.goalUpdateMany.mockResolvedValueOnce({ count: 1 });

    const result = await confirmSettlement(10, 2, { prisma });

    expect(result).toEqual({ goalId: 10, archived: true });
    expect(mocks.goalUpdateMany).toHaveBeenCalledWith({
      where: { id: 10, status: "SETTLING" },
      data: { status: "ARCHIVED" },
    });
    expect(mocks.categoryCompletionUpsert).toHaveBeenCalledTimes(1);
    expect(mocks.feedEventCreate).toHaveBeenCalledTimes(3);
    expect(mocks.feedEventCreate).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({
          eventType: "SETTLEMENT_COMPLETED",
          groupId: 1,
          metadata: { goalId: 10, goalName: "跑步目标" },
        }),
      })
    );
    expect(mocks.feedEventCreate).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        data: expect.objectContaining({
          eventType: "GOAL_STATUS_CHANGED",
          groupId: 1,
          metadata: {
            goalId: 10,
            goalName: "跑步目标",
            fromStatus: "SETTLING",
            toStatus: "ARCHIVED",
          },
        }),
      })
    );
  });

  it("达标判定正确：累计值 >= targetValue 视为达标", async () => {
    const { prisma, mocks } = createPrismaMock();
    mockBaseSettlingGoal(mocks);

    mocks.groupMemberFindUnique.mockResolvedValueOnce({ id: 202, role: "SUPERVISOR" });
    mocks.checkinCount.mockResolvedValue(0);
    mocks.settlementConfirmationFindUnique.mockResolvedValueOnce(null);
    mocks.settlementConfirmationCreate.mockResolvedValueOnce({ id: 3 });
    mocks.groupMemberFindMany.mockResolvedValueOnce([{ id: 201 }, { id: 202 }]);
    mocks.settlementConfirmationCount.mockResolvedValueOnce(2);
    mocks.goalParticipantFindMany.mockResolvedValueOnce([
      { memberId: 101, member: { userId: 11, user: { nickname: "挑战者A" } } },
      { memberId: 102, member: { userId: 12, user: { nickname: "挑战者B" } } },
    ]);
    mocks.checkinFindMany.mockResolvedValueOnce([
      { memberId: 101, value: { toNumber: () => 10 } }, // 刚好达标
      { memberId: 102, value: { toNumber: () => 9.99 } }, // 未达标
    ]);
    mocks.goalUpdateMany.mockResolvedValueOnce({ count: 1 });

    await confirmSettlement(10, 2, { prisma });

    expect(mocks.categoryCompletionUpsert).toHaveBeenCalledTimes(1);
    expect(mocks.categoryCompletionUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          groupId_userId_category: {
            groupId: 1,
            userId: 11,
            category: "跑步",
          },
        },
      })
    );
  });

  it("CategoryCompletion 正确更新（upsert + completionCount +1）", async () => {
    const { prisma, mocks } = createPrismaMock();
    mockBaseSettlingGoal(mocks);

    mocks.groupMemberFindUnique.mockResolvedValueOnce({ id: 202, role: "SUPERVISOR" });
    mocks.checkinCount.mockResolvedValue(0);
    mocks.settlementConfirmationFindUnique.mockResolvedValueOnce(null);
    mocks.settlementConfirmationCreate.mockResolvedValueOnce({ id: 4 });
    mocks.groupMemberFindMany.mockResolvedValueOnce([{ id: 201 }, { id: 202 }]);
    mocks.settlementConfirmationCount.mockResolvedValueOnce(2);
    mocks.goalParticipantFindMany.mockResolvedValueOnce([
      { memberId: 101, member: { userId: 11, user: { nickname: "挑战者A" } } },
    ]);
    mocks.checkinFindMany.mockResolvedValueOnce([{ memberId: 101, value: { toNumber: () => 12 } }]);
    mocks.goalUpdateMany.mockResolvedValueOnce({ count: 1 });

    await confirmSettlement(10, 2, { prisma });

    expect(mocks.categoryCompletionUpsert).toHaveBeenCalledWith({
      where: {
        groupId_userId_category: {
          groupId: 1,
          userId: 11,
          category: "跑步",
        },
      },
      create: {
        groupId: 1,
        userId: 11,
        category: "跑步",
        completionCount: 1,
      },
      update: {
        completionCount: { increment: 1 },
      },
    });
  });

  it("时长阶梯提升时，写入 DURATION_UNLOCKED 动态", async () => {
    const { prisma, mocks } = createPrismaMock();
    mockBaseSettlingGoal(mocks);

    mocks.groupMemberFindUnique.mockResolvedValueOnce({ id: 202, role: "SUPERVISOR" });
    mocks.checkinCount.mockResolvedValue(0);
    mocks.settlementConfirmationFindUnique.mockResolvedValueOnce(null);
    mocks.settlementConfirmationCreate.mockResolvedValueOnce({ id: 5 });
    mocks.groupMemberFindMany.mockResolvedValueOnce([{ id: 201 }, { id: 202 }]);
    mocks.settlementConfirmationCount.mockResolvedValueOnce(2);
    mocks.goalParticipantFindMany.mockResolvedValueOnce([
      { memberId: 101, member: { userId: 11, user: { nickname: "挑战者A" } } },
    ]);
    mocks.checkinFindMany.mockResolvedValueOnce([{ memberId: 101, value: { toNumber: () => 12 } }]);
    mocks.categoryCompletionUpsert.mockResolvedValueOnce({ id: 1 });
    mocks.categoryCompletionFindUnique.mockResolvedValueOnce({ completionCount: 1 });
    mocks.goalUpdateMany.mockResolvedValueOnce({ count: 1 });

    await confirmSettlement(10, 2, { prisma });

    expect(mocks.feedEventCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventType: "DURATION_UNLOCKED",
          groupId: 1,
          metadata: {
            goalId: 10,
            goalName: "跑步目标",
            userId: 11,
            challengerNickname: "挑战者A",
            category: "跑步",
            fromMaxMonths: 1,
            toMaxMonths: 2,
          },
        }),
      })
    );
  });

  it("非 SETTLING 状态不允许确认", async () => {
    const { prisma, mocks } = createPrismaMock();
    mocks.goalFindUnique.mockResolvedValueOnce({
      id: 10,
      groupId: 1,
      name: "跑步目标",
      category: "跑步",
      targetValue: { toNumber: () => 10 },
      unit: "km",
      startDate: new Date(Date.UTC(2026, 1, 1)),
      endDate: new Date(Date.UTC(2026, 1, 28)),
      rewardPunishment: "失败请客",
      status: "ACTIVE",
    });

    await expectAppError(confirmSettlement(10, 1, { prisma }), {
      statusCode: 400,
      message: "仅待结算状态的目标可确认结算",
    });
  });

  it("非监督者不允许确认", async () => {
    const { prisma, mocks } = createPrismaMock();
    mockBaseSettlingGoal(mocks);
    mocks.groupMemberFindUnique.mockResolvedValueOnce({ id: 101, role: "CHALLENGER" });

    await expectAppError(confirmSettlement(10, 11, { prisma }), {
      statusCode: 403,
      message: "仅监督者可确认结算",
    });
  });

  it("有待审核打卡时不允许确认", async () => {
    const { prisma, mocks } = createPrismaMock();
    mockBaseSettlingGoal(mocks);
    mocks.groupMemberFindUnique.mockResolvedValueOnce({ id: 201, role: "SUPERVISOR" });
    mocks.checkinCount.mockResolvedValueOnce(2);

    await expectAppError(confirmSettlement(10, 1, { prisma }), {
      statusCode: 400,
      message: "仍有待审核的打卡记录，请先完成审核",
    });
  });

  it("重复确认报错", async () => {
    const { prisma, mocks } = createPrismaMock();
    mockBaseSettlingGoal(mocks);
    mocks.groupMemberFindUnique.mockResolvedValueOnce({ id: 201, role: "SUPERVISOR" });
    mocks.checkinCount.mockResolvedValueOnce(0);
    mocks.settlementConfirmationFindUnique.mockResolvedValueOnce({ id: 99 });

    await expectAppError(confirmSettlement(10, 1, { prisma }), {
      statusCode: 400,
      message: "您已确认过结算",
    });
  });

  it("并发下若已被其他事务归档，不应重复累加或重复发归档动态", async () => {
    const { prisma, mocks } = createPrismaMock();
    mockBaseSettlingGoal(mocks);

    mocks.groupMemberFindUnique.mockResolvedValueOnce({ id: 202, role: "SUPERVISOR" });
    mocks.checkinCount.mockResolvedValue(0);
    mocks.settlementConfirmationFindUnique.mockResolvedValueOnce(null);
    mocks.settlementConfirmationCreate.mockResolvedValueOnce({ id: 5 });
    mocks.groupMemberFindMany.mockResolvedValueOnce([{ id: 201 }, { id: 202 }]);
    mocks.settlementConfirmationCount.mockResolvedValueOnce(2);
    mocks.goalUpdateMany.mockResolvedValueOnce({ count: 0 });

    const result = await confirmSettlement(10, 2, { prisma });

    expect(result).toEqual({ goalId: 10, archived: true });
    expect(mocks.goalParticipantFindMany).not.toHaveBeenCalled();
    expect(mocks.categoryCompletionUpsert).not.toHaveBeenCalled();
    expect(mocks.feedEventCreate).toHaveBeenCalledTimes(1);
    expect(mocks.feedEventCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventType: "SETTLEMENT_CONFIRMED",
          actorId: 2,
          groupId: 1,
          metadata: { goalId: 10, goalName: "跑步目标" },
        }),
      })
    );
  });
});

describe("settlement.service getSettlementResult", () => {
  it("ARCHIVED 状态返回结算结果与解锁周期", async () => {
    const { prisma, mocks } = createPrismaMock();
    mocks.goalFindUnique.mockResolvedValueOnce({
      id: 10,
      groupId: 1,
      name: "跑步目标",
      category: "跑步",
      targetValue: { toNumber: () => 10 },
      unit: "km",
      startDate: new Date(Date.UTC(2026, 1, 1)),
      endDate: new Date(Date.UTC(2026, 1, 28)),
      rewardPunishment: "失败请客",
      status: "ARCHIVED",
    });
    mocks.groupMemberFindUnique.mockResolvedValueOnce({ id: 201 });
    mocks.goalParticipantFindMany.mockResolvedValueOnce([
      { memberId: 101, member: { userId: 11, user: { nickname: "挑战者A" } } },
      { memberId: 102, member: { userId: 12, user: { nickname: "挑战者B" } } },
    ]);
    mocks.checkinFindMany.mockResolvedValueOnce([
      { memberId: 101, value: { toNumber: () => 10 } },
      { memberId: 102, value: { toNumber: () => 5 } },
    ]);
    mocks.groupMemberFindMany.mockResolvedValueOnce([
      { id: 201, userId: 1, user: { nickname: "监督者1" } },
      { id: 202, userId: 2, user: { nickname: "监督者2" } },
    ]);
    mocks.settlementConfirmationFindMany.mockResolvedValueOnce([{ memberId: 201, createdAt: new Date() }]);
    mocks.checkinCount.mockResolvedValueOnce(1);
    mocks.categoryCompletionFindMany.mockResolvedValueOnce([{ userId: 11, completionCount: 4 }]);

    const result = await getSettlementResult(10, 1, { prisma });

    expect(result.goal).toMatchObject({
      id: 10,
      name: "跑步目标",
      category: "跑步",
      targetValue: 10,
      unit: "km",
      startDate: "2026-02-01",
      endDate: "2026-02-28",
      rewardPunishment: "失败请客",
      status: "ARCHIVED",
    });
    expect(result.results).toEqual([
      {
        memberId: 101,
        userId: 11,
        nickname: "挑战者A",
        completedValue: 10,
        percentage: 100,
        achieved: true,
        unlockedMaxMonths: 6,
      },
      {
        memberId: 102,
        userId: 12,
        nickname: "挑战者B",
        completedValue: 5,
        percentage: 50,
        achieved: false,
      },
    ]);
    expect(result.settlementProgress.confirmed).toBe(1);
    expect(result.settlementProgress.total).toBe(2);
    expect(result.hasPendingCheckins).toBe(true);
  });
});
