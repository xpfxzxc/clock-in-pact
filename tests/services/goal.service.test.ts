import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CreateGoalRequest } from "../../server/types/goal";
import {
  confirmGoal,
  createGoal,
  getDurationLimit,
  listGroupGoals,
  type GoalPrismaClient,
} from "../../server/services/goal.service";
import { AppError } from "../../server/utils/app-error";

async function expectAppError(
  promise: Promise<unknown>,
  expected: { statusCode: number; message: string | RegExp }
) {
  await expect(promise).rejects.toBeInstanceOf(AppError);
  const caught = await promise.catch((e: unknown) => e);
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
  const goalFindFirstMock = vi.fn();
  const goalFindUniqueMock = vi.fn();
  const goalFindManyMock = vi.fn();
  const goalCreateMock = vi.fn();
  const goalUpdateMock = vi.fn();
  const goalUpdateManyMock = vi.fn().mockResolvedValue({ count: 0 });

  const groupFindUniqueMock = vi.fn().mockResolvedValue({ timezone: "Asia/Shanghai" });

  const groupMemberFindUniqueMock = vi.fn();
  const groupMemberFindManyMock = vi.fn();

  const goalConfirmationCreateManyMock = vi.fn();
  const goalConfirmationFindUniqueMock = vi.fn();
  const goalConfirmationFindManyMock = vi.fn();
  const goalConfirmationUpdateMock = vi.fn();

  const goalParticipantCreateManyMock = vi.fn();
  const categoryCompletionFindManyMock = vi.fn();

  const transactionMock = vi.fn(async (fn: (tx: any) => Promise<unknown>) => {
    return fn({
      goal: {
        findFirst: goalFindFirstMock,
        findUnique: goalFindUniqueMock,
        findMany: goalFindManyMock,
        create: goalCreateMock,
        update: goalUpdateMock,
        updateMany: goalUpdateManyMock,
      },
      group: {
        findUnique: groupFindUniqueMock,
      },
      groupMember: {
        findUnique: groupMemberFindUniqueMock,
        findMany: groupMemberFindManyMock,
      },
      goalConfirmation: {
        createMany: goalConfirmationCreateManyMock,
        findUnique: goalConfirmationFindUniqueMock,
        findMany: goalConfirmationFindManyMock,
        update: goalConfirmationUpdateMock,
      },
      goalParticipant: {
        createMany: goalParticipantCreateManyMock,
      },
      categoryCompletion: {
        findMany: categoryCompletionFindManyMock,
      },
    });
  });

  const prisma: GoalPrismaClient = {
    $transaction: transactionMock as unknown as GoalPrismaClient["$transaction"],
    goal: {
      findFirst: goalFindFirstMock as unknown as GoalPrismaClient["goal"]["findFirst"],
      findUnique: goalFindUniqueMock as unknown as GoalPrismaClient["goal"]["findUnique"],
      findMany: goalFindManyMock as unknown as GoalPrismaClient["goal"]["findMany"],
      create: goalCreateMock as unknown as GoalPrismaClient["goal"]["create"],
      update: goalUpdateMock as unknown as GoalPrismaClient["goal"]["update"],
      updateMany: goalUpdateManyMock as unknown as GoalPrismaClient["goal"]["updateMany"],
    },
    group: {
      findUnique: groupFindUniqueMock as unknown as GoalPrismaClient["group"]["findUnique"],
    },
    groupMember: {
      findUnique: groupMemberFindUniqueMock as unknown as GoalPrismaClient["groupMember"]["findUnique"],
      findMany: groupMemberFindManyMock as unknown as GoalPrismaClient["groupMember"]["findMany"],
    },
    goalConfirmation: {
      createMany:
        goalConfirmationCreateManyMock as unknown as GoalPrismaClient["goalConfirmation"]["createMany"],
      findUnique:
        goalConfirmationFindUniqueMock as unknown as GoalPrismaClient["goalConfirmation"]["findUnique"],
      findMany:
        goalConfirmationFindManyMock as unknown as GoalPrismaClient["goalConfirmation"]["findMany"],
      update: goalConfirmationUpdateMock as unknown as GoalPrismaClient["goalConfirmation"]["update"],
    },
    goalParticipant: {
      createMany: goalParticipantCreateManyMock as unknown as GoalPrismaClient["goalParticipant"]["createMany"],
    },
    categoryCompletion: {
      findMany: categoryCompletionFindManyMock as unknown as GoalPrismaClient["categoryCompletion"]["findMany"],
    },
  };

  return {
    prisma,
    mocks: {
      transaction: transactionMock,
      goalFindFirst: goalFindFirstMock,
      goalFindUnique: goalFindUniqueMock,
      goalFindMany: goalFindManyMock,
      goalCreate: goalCreateMock,
      goalUpdate: goalUpdateMock,
      goalUpdateMany: goalUpdateManyMock,
      groupFindUnique: groupFindUniqueMock,
      groupMemberFindUnique: groupMemberFindUniqueMock,
      groupMemberFindMany: groupMemberFindManyMock,
      goalConfirmationCreateMany: goalConfirmationCreateManyMock,
      goalConfirmationFindUnique: goalConfirmationFindUniqueMock,
      goalConfirmationFindMany: goalConfirmationFindManyMock,
      goalConfirmationUpdate: goalConfirmationUpdateMock,
      goalParticipantCreateMany: goalParticipantCreateManyMock,
      categoryCompletionFindMany: categoryCompletionFindManyMock,
    },
  };
}

const baseCreateBody: CreateGoalRequest = {
  groupId: 1,
  name: "跑步挑战",
  category: "跑步",
  targetValue: 60,
  unit: "km",
  startDate: "2026-02-06",
  endDate: "2026-03-05",
  rewardPunishment: "失败者请成功者吃饭",
  evidenceRequirement: "跑步APP截图",
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-02-05T12:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("goal.service createGoal", () => {
  it("成功创建目标：小组成员可创建，创建者自动同意，其余成员待确认", async () => {
    const { prisma, mocks } = createPrismaMock();
    const now = new Date();

    mocks.groupMemberFindMany.mockResolvedValueOnce([
      { id: 1, userId: 1, role: "CHALLENGER" },
      { id: 2, userId: 2, role: "SUPERVISOR" },
    ]);
    mocks.goalFindFirst.mockResolvedValueOnce(null);
    mocks.categoryCompletionFindMany.mockResolvedValueOnce([]);
    mocks.goalCreate.mockResolvedValueOnce({
      id: 10,
      groupId: 1,
      name: baseCreateBody.name,
      category: baseCreateBody.category,
      targetValue: 60,
      unit: baseCreateBody.unit,
      startDate: new Date(Date.UTC(2026, 1, 6)),
      endDate: new Date(Date.UTC(2026, 2, 5)),
      rewardPunishment: baseCreateBody.rewardPunishment,
      evidenceRequirement: baseCreateBody.evidenceRequirement,
      status: "PENDING",
      createdById: 1,
      createdAt: now,
    });
    mocks.goalConfirmationCreateMany.mockResolvedValueOnce({ count: 2 });

    const result = await createGoal({ ...baseCreateBody }, 1, { prisma });

    expect(result).toMatchObject({
      id: 10,
      groupId: 1,
      name: "跑步挑战",
      category: "跑步",
      targetValue: 60,
      unit: "km",
      startDate: "2026-02-06",
      endDate: "2026-03-05",
      status: "PENDING",
      createdById: 1,
    });
    expect(result.createdAt).toBe(now.toISOString());

    expect(mocks.goalCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          groupId: 1,
          name: "跑步挑战",
          category: "跑步",
          targetValue: 60,
          unit: "km",
          status: "PENDING",
          createdById: 1,
          startDate: expect.any(Date),
          endDate: expect.any(Date),
        }),
      })
    );

    expect(mocks.goalConfirmationCreateMany).toHaveBeenCalledWith({
      data: [
        { goalId: 10, memberId: 1, status: "APPROVED" },
        { goalId: 10, memberId: 2, status: "PENDING" },
      ],
    });
  });

  it("开始日期是当天或过去 → 提示错误", async () => {
    const { prisma } = createPrismaMock();

    await expectAppError(
      createGoal(
        {
          ...baseCreateBody,
          startDate: "2026-02-05",
          endDate: "2026-03-05",
        },
        1,
        { prisma }
      ),
      { statusCode: 400, message: "开始日期必须是未来日期" }
    );
  });

  it("开始日期以小组时区 00:00:00 为界：到达当天 00:00:00 视为非未来日期", async () => {
    const { prisma } = createPrismaMock();
    vi.setSystemTime(new Date("2026-02-05T16:00:00.000Z")); // Asia/Shanghai = 2026-02-06 00:00:00

    await expectAppError(createGoal({ ...baseCreateBody }, 1, { prisma }), {
      statusCode: 400,
      message: "开始日期必须是未来日期",
    });
  });

  it("小组有进行中/待确认目标 → 提示错误", async () => {
    const { prisma, mocks } = createPrismaMock();

    mocks.groupMemberFindMany.mockResolvedValueOnce([{ id: 1, userId: 1, role: "CHALLENGER" }]);
    mocks.goalFindFirst.mockResolvedValueOnce({ id: 999 });

    await expectAppError(createGoal({ ...baseCreateBody }, 1, { prisma }), {
      statusCode: 400,
      message: "当前已有进行中的目标",
    });
  });

  it("目标周期超出挑战者可创建上限 → 提示错误", async () => {
    const { prisma, mocks } = createPrismaMock();

    mocks.groupMemberFindMany.mockResolvedValueOnce([
      { id: 1, userId: 1, role: "CHALLENGER" },
      { id: 2, userId: 2, role: "SUPERVISOR" },
    ]);
    mocks.goalFindFirst.mockResolvedValueOnce(null);
    mocks.categoryCompletionFindMany.mockResolvedValueOnce([]);

    await expectAppError(
      createGoal({ ...baseCreateBody, endDate: "2026-03-06" }, 1, { prisma }),
      {
        statusCode: 400,
        message: "您当前最长可创建1个月的跑步目标",
      }
    );
    expect(mocks.goalCreate).not.toHaveBeenCalled();
  });

  it("小组不存在 → 提示错误", async () => {
    const { prisma, mocks } = createPrismaMock();
    mocks.groupFindUnique.mockResolvedValueOnce(null);

    await expectAppError(createGoal({ ...baseCreateBody }, 1, { prisma }), {
      statusCode: 404,
      message: "小组不存在",
    });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});

describe("goal.service listGroupGoals（不自动推进状态）", () => {
  it("不应在查询时触发状态转换（由定时任务处理）", async () => {
    const { prisma, mocks } = createPrismaMock();
    vi.setSystemTime(new Date("2026-02-05T16:00:00.000Z")); // Asia/Shanghai = 2026-02-06 00:00:00

    mocks.groupMemberFindUnique.mockResolvedValueOnce({ id: 1 });
    mocks.goalFindMany.mockResolvedValueOnce([
      {
        id: 10,
        groupId: 1,
        name: "跑步挑战",
        category: "跑步",
        targetValue: 60,
        unit: "km",
        startDate: new Date(Date.UTC(2026, 1, 6)),
        endDate: new Date(Date.UTC(2026, 2, 5)),
        rewardPunishment: "失败者请成功者吃饭",
        evidenceRequirement: "跑步APP截图",
        status: "UPCOMING",
        createdById: 1,
        createdAt: new Date(),
      },
    ]);

    const result = await listGroupGoals(1, 1, { prisma });
    expect(result[0]?.status).toBe("UPCOMING");
    expect(mocks.goalUpdateMany).not.toHaveBeenCalled();
  });

  it("非小组成员查询目标列表 → 提示错误", async () => {
    const { prisma, mocks } = createPrismaMock();
    mocks.groupMemberFindUnique.mockResolvedValueOnce(null);

    await expectAppError(listGroupGoals(1, 999, { prisma }), {
      statusCode: 403,
      message: "您不是该小组成员",
    });
    expect(mocks.goalFindMany).not.toHaveBeenCalled();
  });
});

describe("goal.service getDurationLimit", () => {
  it("按时长阶梯返回所有挑战者中最短的可创建周期", async () => {
    const { prisma, mocks } = createPrismaMock();

    mocks.groupMemberFindUnique.mockResolvedValueOnce({ id: 1 });
    mocks.groupMemberFindMany.mockResolvedValueOnce([
      { id: 11, userId: 1, role: "CHALLENGER", user: { nickname: "A" } },
      { id: 12, userId: 2, role: "CHALLENGER", user: { nickname: "B" } },
      { id: 13, userId: 3, role: "CHALLENGER", user: { nickname: "C" } },
      { id: 14, userId: 4, role: "CHALLENGER", user: { nickname: "D" } },
      { id: 15, userId: 5, role: "CHALLENGER", user: { nickname: "E" } },
      { id: 16, userId: 6, role: "CHALLENGER", user: { nickname: "F" } },
    ]);
    mocks.categoryCompletionFindMany.mockResolvedValueOnce([
      { userId: 1, completionCount: 0 }, // 1个月
      { userId: 2, completionCount: 1 }, // 2个月
      { userId: 3, completionCount: 2 }, // 3个月
      { userId: 4, completionCount: 3 }, // 3个月
      { userId: 5, completionCount: 4 }, // 6个月
      { userId: 6, completionCount: 6 }, // 12个月
    ]);

    const result = await getDurationLimit(1, "跑步", 1, { prisma });

    expect(result).toEqual({
      groupId: 1,
      category: "跑步",
      maxAllowedMonths: 1,
      challengerLimits: [
        { userId: 1, nickname: "A", completionCount: 0, maxAllowedMonths: 1 },
        { userId: 2, nickname: "B", completionCount: 1, maxAllowedMonths: 2 },
        { userId: 3, nickname: "C", completionCount: 2, maxAllowedMonths: 3 },
        { userId: 4, nickname: "D", completionCount: 3, maxAllowedMonths: 3 },
        { userId: 5, nickname: "E", completionCount: 4, maxAllowedMonths: 6 },
        { userId: 6, nickname: "F", completionCount: 6, maxAllowedMonths: 12 },
      ],
    });
  });
});

describe("goal.service confirmGoal", () => {
  it("开始日期已到且仍为 PENDING：确认时自动作废并拒绝确认", async () => {
    const { prisma, mocks } = createPrismaMock();

    mocks.goalFindUnique.mockResolvedValueOnce({
      id: 10,
      groupId: 1,
      status: "PENDING",
      startDate: new Date(Date.UTC(2026, 1, 5)),
    });
    mocks.groupMemberFindUnique.mockResolvedValueOnce({ id: 100 });
    mocks.goalUpdateMany.mockResolvedValueOnce({ count: 1 });

    await expectAppError(confirmGoal(10, 1, "APPROVED", { prisma }), {
      statusCode: 400,
      message: "目标已作废",
    });

    expect(mocks.goalUpdateMany).toHaveBeenCalledWith({
      where: { id: 10, status: "PENDING" },
      data: { status: "VOIDED" },
    });
    expect(mocks.goalConfirmationFindUnique).not.toHaveBeenCalled();
    expect(mocks.goalConfirmationUpdate).not.toHaveBeenCalled();
  });

  it("有人拒绝 → 目标状态变为 VOIDED", async () => {
    const { prisma, mocks } = createPrismaMock();

    mocks.goalFindUnique.mockResolvedValueOnce({
      id: 10,
      groupId: 1,
      status: "PENDING",
      startDate: new Date(Date.UTC(2026, 1, 6)),
    });
    mocks.groupMemberFindUnique.mockResolvedValueOnce({ id: 100 });
    mocks.goalConfirmationFindUnique.mockResolvedValueOnce({ status: "PENDING" });
    mocks.goalConfirmationUpdate.mockResolvedValueOnce({ status: "REJECTED" });
    mocks.goalUpdate.mockResolvedValueOnce({ status: "VOIDED" });

    const result = await confirmGoal(10, 1, "REJECTED", { prisma });

    expect(result).toEqual({ goalId: 10, status: "REJECTED", goalStatus: "VOIDED" });
    expect(mocks.goalParticipantCreateMany).not.toHaveBeenCalled();
  });

  it("未全员同意 → 目标保持 PENDING", async () => {
    const { prisma, mocks } = createPrismaMock();

    mocks.goalFindUnique.mockResolvedValueOnce({
      id: 10,
      groupId: 1,
      status: "PENDING",
      startDate: new Date(Date.UTC(2026, 1, 6)),
    });
    mocks.groupMemberFindUnique.mockResolvedValueOnce({ id: 100 });
    mocks.goalConfirmationFindUnique.mockResolvedValueOnce({ status: "PENDING" });
    mocks.goalConfirmationUpdate.mockResolvedValueOnce({ status: "APPROVED" });
    mocks.goalConfirmationFindMany.mockResolvedValueOnce([{ status: "APPROVED" }, { status: "PENDING" }]);

    const result = await confirmGoal(10, 1, "APPROVED", { prisma });

    expect(result).toEqual({ goalId: 10, status: "APPROVED", goalStatus: "PENDING" });
    expect(mocks.goalUpdate).not.toHaveBeenCalled();
    expect(mocks.goalParticipantCreateMany).not.toHaveBeenCalled();
  });

  it("全员同意且满足角色条件 → 目标变为 UPCOMING，并为挑战者创建参与记录", async () => {
    const { prisma, mocks } = createPrismaMock();

    mocks.goalFindUnique.mockResolvedValueOnce({
      id: 10,
      groupId: 1,
      status: "PENDING",
      startDate: new Date(Date.UTC(2026, 1, 6)),
    });
    mocks.groupMemberFindUnique.mockResolvedValueOnce({ id: 101 });
    mocks.goalConfirmationFindUnique.mockResolvedValueOnce({ status: "PENDING" });
    mocks.goalConfirmationUpdate.mockResolvedValueOnce({ status: "APPROVED" });
    mocks.goalConfirmationFindMany.mockResolvedValueOnce([{ status: "APPROVED" }, { status: "APPROVED" }]);
    mocks.groupMemberFindMany.mockResolvedValueOnce([
      { id: 101, userId: 1, role: "CHALLENGER" },
      { id: 102, userId: 2, role: "SUPERVISOR" },
    ]);
    mocks.goalUpdate.mockResolvedValueOnce({ status: "UPCOMING" });
    mocks.goalParticipantCreateMany.mockResolvedValueOnce({ count: 1 });

    const result = await confirmGoal(10, 1, "APPROVED", { prisma });

    expect(result).toEqual({ goalId: 10, status: "APPROVED", goalStatus: "UPCOMING" });
    expect(mocks.goalUpdate).toHaveBeenCalledWith({
      where: { id: 10 },
      data: { status: "UPCOMING" },
      select: { status: true },
    });
    expect(mocks.goalParticipantCreateMany).toHaveBeenCalledWith({
      data: [{ goalId: 10, memberId: 101 }],
      skipDuplicates: true,
    });
  });

  it("目标已是 VOIDED → 不允许确认", async () => {
    const { prisma, mocks } = createPrismaMock();

    mocks.goalFindUnique.mockResolvedValueOnce({
      id: 10,
      groupId: 1,
      status: "VOIDED",
      startDate: new Date(Date.UTC(2026, 1, 6)),
    });
    mocks.groupMemberFindUnique.mockResolvedValueOnce({ id: 101 });

    await expectAppError(confirmGoal(10, 1, "APPROVED", { prisma }), {
      statusCode: 400,
      message: "目标已作废",
    });

    expect(mocks.goalConfirmationFindUnique).not.toHaveBeenCalled();
    expect(mocks.goalConfirmationUpdate).not.toHaveBeenCalled();
  });

  it("全员同意但缺少监督者 → 不能进入 UPCOMING", async () => {
    const { prisma, mocks } = createPrismaMock();

    mocks.goalFindUnique.mockResolvedValueOnce({
      id: 10,
      groupId: 1,
      status: "PENDING",
      startDate: new Date(Date.UTC(2026, 1, 6)),
    });
    mocks.groupMemberFindUnique.mockResolvedValueOnce({ id: 101 });
    mocks.goalConfirmationFindUnique.mockResolvedValueOnce({ status: "PENDING" });
    mocks.goalConfirmationUpdate.mockResolvedValueOnce({ status: "APPROVED" });
    mocks.goalConfirmationFindMany.mockResolvedValueOnce([{ status: "APPROVED" }, { status: "APPROVED" }]);
    mocks.groupMemberFindMany.mockResolvedValueOnce([
      { id: 101, userId: 1, role: "CHALLENGER" },
      { id: 102, userId: 2, role: "CHALLENGER" },
    ]);

    await expectAppError(confirmGoal(10, 1, "APPROVED", { prisma }), {
      statusCode: 400,
      message: "至少需要1位监督者",
    });

    expect(mocks.goalUpdate).not.toHaveBeenCalled();
    expect(mocks.goalParticipantCreateMany).not.toHaveBeenCalled();
  });
});
