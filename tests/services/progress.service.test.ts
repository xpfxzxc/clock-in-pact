import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getProgress, type ProgressPrismaClient } from "../../server/services/progress.service";
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
  const groupMemberFindUniqueMock = vi.fn();
  const goalParticipantFindManyMock = vi.fn();
  const checkinFindManyMock = vi.fn();

  const prisma: ProgressPrismaClient = {
    goal: {
      findUnique: goalFindUniqueMock as unknown as ProgressPrismaClient["goal"]["findUnique"],
    },
    groupMember: {
      findUnique: groupMemberFindUniqueMock as unknown as ProgressPrismaClient["groupMember"]["findUnique"],
    },
    goalParticipant: {
      findMany: goalParticipantFindManyMock as unknown as ProgressPrismaClient["goalParticipant"]["findMany"],
    },
    checkin: {
      findMany: checkinFindManyMock as unknown as ProgressPrismaClient["checkin"]["findMany"],
    },
  };

  return {
    prisma,
    mocks: {
      goalFindUnique: goalFindUniqueMock,
      groupMemberFindUnique: groupMemberFindUniqueMock,
      goalParticipantFindMany: goalParticipantFindManyMock,
      checkinFindMany: checkinFindManyMock,
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-02-10T12:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("progress.service getProgress", () => {
  it("挑战者查看进度：仅已确认/自动通过计入完成值，并返回排行榜与贡献图", async () => {
    const { prisma, mocks } = createPrismaMock();

    mocks.goalFindUnique.mockResolvedValue({
      id: 10,
      groupId: 1,
      name: "每日跑步",
      category: "运动",
      targetValue: { toNumber: () => 100 },
      unit: "km",
      startDate: new Date(Date.UTC(2026, 1, 1)),
      endDate: new Date(Date.UTC(2026, 1, 20)),
      status: "ACTIVE",
      group: { timezone: "Asia/Shanghai" },
    });

    mocks.groupMemberFindUnique.mockResolvedValue({
      id: 100,
      role: "CHALLENGER",
      user: { nickname: "挑战者A" },
    });

    mocks.goalParticipantFindMany.mockResolvedValue([
      {
        memberId: 100,
        member: {
          userId: 1,
          role: "CHALLENGER",
          user: { nickname: "挑战者A" },
        },
      },
      {
        memberId: 101,
        member: {
          userId: 2,
          role: "CHALLENGER",
          user: { nickname: "挑战者B" },
        },
      },
      {
        memberId: 102,
        member: {
          userId: 3,
          role: "SUPERVISOR",
          user: { nickname: "监督者S" },
        },
      },
    ]);

    mocks.checkinFindMany.mockResolvedValue([
      {
        memberId: 100,
        checkinDate: new Date(Date.UTC(2026, 1, 9)),
        value: { toNumber: () => 20 },
        status: "CONFIRMED",
      },
      {
        memberId: 100,
        checkinDate: new Date(Date.UTC(2026, 1, 10)),
        value: { toNumber: () => 15 },
        status: "AUTO_APPROVED",
      },
      {
        memberId: 100,
        checkinDate: new Date(Date.UTC(2026, 1, 10)),
        value: { toString: () => "5" },
        status: "PENDING_REVIEW",
      },
      {
        memberId: 100,
        checkinDate: new Date(Date.UTC(2026, 1, 11)),
        value: { toString: () => "3" },
        status: "DISPUTED",
      },
      {
        memberId: 101,
        checkinDate: new Date(Date.UTC(2026, 1, 9)),
        value: { toNumber: () => 40 },
        status: "CONFIRMED",
      },
      {
        memberId: 101,
        checkinDate: new Date(Date.UTC(2026, 1, 10)),
        value: { toNumber: () => 10 },
        status: "PENDING_REVIEW",
      },
      {
        memberId: 101,
        checkinDate: new Date(Date.UTC(2026, 1, 12)),
        value: { toNumber: () => 7 },
        status: "DISPUTED",
      },
    ]);

    const result = await getProgress(10, 1, { prisma });

    expect(result.goal).toMatchObject({
      id: 10,
      name: "每日跑步",
      category: "运动",
      targetValue: 100,
      unit: "km",
      startDate: "2026-02-01",
      endDate: "2026-02-20",
      status: "ACTIVE",
    });

    expect(result.remainingDays).toBe(11);
    expect(result.totalPendingReviewCount).toBe(2);
    expect(result.totalDisputedCount).toBe(2);

    expect(result.myRole).toBe("CHALLENGER");
    expect(result.myMemberId).toBe(100);
    expect(result.myProgress).toMatchObject({
      memberId: 100,
      userId: 1,
      nickname: "挑战者A",
      completedValue: 35,
      percentage: 35,
      remainingValue: 65,
      pendingReviewCount: 1,
      disputedCount: 1,
    });

    expect(result.leaderboard).toEqual([
      {
        rank: 1,
        memberId: 101,
        userId: 2,
        nickname: "挑战者B",
        completedValue: 40,
        percentage: 40,
      },
      {
        rank: 2,
        memberId: 100,
        userId: 1,
        nickname: "挑战者A",
        completedValue: 35,
        percentage: 35,
      },
    ]);

    expect(result.contributions).toHaveLength(2);

    const aContribution = result.contributions.find((item) => item.memberId === 100);
    const bContribution = result.contributions.find((item) => item.memberId === 101);

    expect(aContribution?.days).toHaveLength(20);
    expect(bContribution?.days).toHaveLength(20);

    expect(aContribution?.days.find((day) => day.date === "2026-02-09")).toEqual({
      date: "2026-02-09",
      confirmedValue: 20,
      pendingValue: 0,
      disputedValue: 0,
    });
    expect(aContribution?.days.find((day) => day.date === "2026-02-10")).toEqual({
      date: "2026-02-10",
      confirmedValue: 15,
      pendingValue: 5,
      disputedValue: 0,
    });
    expect(aContribution?.days.find((day) => day.date === "2026-02-11")).toEqual({
      date: "2026-02-11",
      confirmedValue: 0,
      pendingValue: 0,
      disputedValue: 3,
    });
    expect(aContribution?.days.find((day) => day.date === "2026-02-01")).toEqual({
      date: "2026-02-01",
      confirmedValue: 0,
      pendingValue: 0,
      disputedValue: 0,
    });

    expect(bContribution?.days.find((day) => day.date === "2026-02-09")).toEqual({
      date: "2026-02-09",
      confirmedValue: 40,
      pendingValue: 0,
      disputedValue: 0,
    });
    expect(bContribution?.days.find((day) => day.date === "2026-02-10")).toEqual({
      date: "2026-02-10",
      confirmedValue: 0,
      pendingValue: 10,
      disputedValue: 0,
    });
  });

  it("监督者查看进度：myProgress 为 null", async () => {
    const { prisma, mocks } = createPrismaMock();

    mocks.goalFindUnique.mockResolvedValue({
      id: 10,
      groupId: 1,
      name: "每日阅读",
      category: "学习",
      targetValue: { toNumber: () => 30 },
      unit: "小时",
      startDate: new Date(Date.UTC(2026, 1, 1)),
      endDate: new Date(Date.UTC(2026, 1, 28)),
      status: "ACTIVE",
      group: { timezone: "Asia/Shanghai" },
    });

    mocks.groupMemberFindUnique.mockResolvedValue({
      id: 102,
      role: "SUPERVISOR",
      user: { nickname: "监督者S" },
    });

    mocks.goalParticipantFindMany.mockResolvedValue([
      {
        memberId: 100,
        member: {
          userId: 1,
          role: "CHALLENGER",
          user: { nickname: "挑战者A" },
        },
      },
    ]);

    mocks.checkinFindMany.mockResolvedValue([
      {
        memberId: 100,
        checkinDate: new Date(Date.UTC(2026, 1, 10)),
        value: { toNumber: () => 8 },
        status: "CONFIRMED",
      },
      {
        memberId: 100,
        checkinDate: new Date(Date.UTC(2026, 1, 10)),
        value: { toNumber: () => 2 },
        status: "PENDING_REVIEW",
      },
    ]);

    const result = await getProgress(10, 3, { prisma });

    expect(result.myRole).toBe("SUPERVISOR");
    expect(result.myMemberId).toBe(102);
    expect(result.myProgress).toBeNull();
    expect(result.totalPendingReviewCount).toBe(1);
    expect(result.totalDisputedCount).toBe(0);
  });

  it("超额完成：百分比可超 100，剩余值为 0", async () => {
    const { prisma, mocks } = createPrismaMock();

    mocks.goalFindUnique.mockResolvedValue({
      id: 10,
      groupId: 1,
      name: "每日跳绳",
      category: "运动",
      targetValue: { toString: () => "60" },
      unit: "分钟",
      startDate: new Date(Date.UTC(2026, 1, 1)),
      endDate: new Date(Date.UTC(2026, 1, 20)),
      status: "ACTIVE",
      group: { timezone: "Asia/Shanghai" },
    });

    mocks.groupMemberFindUnique.mockResolvedValue({
      id: 100,
      role: "CHALLENGER",
      user: { nickname: "挑战者A" },
    });

    mocks.goalParticipantFindMany.mockResolvedValue([
      {
        memberId: 100,
        member: {
          userId: 1,
          role: "CHALLENGER",
          user: { nickname: "挑战者A" },
        },
      },
    ]);

    mocks.checkinFindMany.mockResolvedValue([
      {
        memberId: 100,
        checkinDate: new Date(Date.UTC(2026, 1, 9)),
        value: { toNumber: () => 50 },
        status: "CONFIRMED",
      },
      {
        memberId: 100,
        checkinDate: new Date(Date.UTC(2026, 1, 10)),
        value: { toNumber: () => 30 },
        status: "AUTO_APPROVED",
      },
    ]);

    const result = await getProgress(10, 1, { prisma });

    expect(result.myProgress).toMatchObject({
      completedValue: 80,
      percentage: 133.33333333333331,
      remainingValue: 0,
    });
    expect(result.leaderboard[0]).toMatchObject({
      completedValue: 80,
      percentage: 133.33333333333331,
    });
  });

  it("剩余天数按小组时区计算（含当天和结束日）", async () => {
    const { prisma, mocks } = createPrismaMock();

    vi.setSystemTime(new Date("2026-02-10T02:00:00.000Z"));

    mocks.goalFindUnique.mockResolvedValue({
      id: 10,
      groupId: 1,
      name: "每日学习",
      category: "学习",
      targetValue: { toNumber: () => 10 },
      unit: "次",
      startDate: new Date(Date.UTC(2026, 1, 1)),
      endDate: new Date(Date.UTC(2026, 1, 10)),
      status: "ACTIVE",
      group: { timezone: "America/Los_Angeles" },
    });

    mocks.groupMemberFindUnique.mockResolvedValue({
      id: 100,
      role: "CHALLENGER",
      user: { nickname: "挑战者A" },
    });

    mocks.goalParticipantFindMany.mockResolvedValue([
      {
        memberId: 100,
        member: {
          userId: 1,
          role: "CHALLENGER",
          user: { nickname: "挑战者A" },
        },
      },
    ]);

    mocks.checkinFindMany.mockResolvedValue([]);

    const result = await getProgress(10, 1, { prisma });

    expect(result.remainingDays).toBe(2);
  });

  it("目标 ID 非正整数 -> 提示错误", async () => {
    const { prisma, mocks } = createPrismaMock();

    await expectAppError(getProgress(0, 1, { prisma }), {
      statusCode: 400,
      message: "无效的目标 ID",
    });

    await expectAppError(getProgress(1.5, 1, { prisma }), {
      statusCode: 400,
      message: "无效的目标 ID",
    });

    expect(mocks.goalFindUnique).not.toHaveBeenCalled();
  });

  it("目标不存在 -> 提示错误", async () => {
    const { prisma, mocks } = createPrismaMock();

    mocks.goalFindUnique.mockResolvedValue(null);

    await expectAppError(getProgress(10, 1, { prisma }), {
      statusCode: 404,
      message: "目标不存在",
    });
  });

  it("目标不是 ACTIVE 状态 -> 提示错误", async () => {
    const { prisma, mocks } = createPrismaMock();

    mocks.goalFindUnique.mockResolvedValue({
      id: 10,
      groupId: 1,
      name: "每日阅读",
      category: "学习",
      targetValue: { toNumber: () => 30 },
      unit: "小时",
      startDate: new Date(Date.UTC(2026, 1, 1)),
      endDate: new Date(Date.UTC(2026, 1, 28)),
      status: "UPCOMING",
      group: { timezone: "Asia/Shanghai" },
    });

    await expectAppError(getProgress(10, 1, { prisma }), {
      statusCode: 400,
      message: "仅进行中、待结算或已归档的目标可查看进度",
    });
  });

  it("非小组成员 -> 无权限", async () => {
    const { prisma, mocks } = createPrismaMock();

    mocks.goalFindUnique.mockResolvedValue({
      id: 10,
      groupId: 1,
      name: "每日阅读",
      category: "学习",
      targetValue: { toNumber: () => 30 },
      unit: "小时",
      startDate: new Date(Date.UTC(2026, 1, 1)),
      endDate: new Date(Date.UTC(2026, 1, 28)),
      status: "ACTIVE",
      group: { timezone: "Asia/Shanghai" },
    });
    mocks.groupMemberFindUnique.mockResolvedValue(null);

    await expectAppError(getProgress(10, 1, { prisma }), {
      statusCode: 403,
      message: "您不是该小组成员",
    });
  });

  it("小组时区非法 -> 提示配置错误", async () => {
    const { prisma, mocks } = createPrismaMock();

    mocks.goalFindUnique.mockResolvedValue({
      id: 10,
      groupId: 1,
      name: "每日阅读",
      category: "学习",
      targetValue: { toNumber: () => 30 },
      unit: "小时",
      startDate: new Date(Date.UTC(2026, 1, 1)),
      endDate: new Date(Date.UTC(2026, 1, 28)),
      status: "ACTIVE",
      group: { timezone: "Invalid/Timezone" },
    });
    mocks.groupMemberFindUnique.mockResolvedValue({
      id: 100,
      role: "CHALLENGER",
      user: { nickname: "挑战者A" },
    });
    mocks.goalParticipantFindMany.mockResolvedValue([
      {
        memberId: 100,
        member: {
          userId: 1,
          role: "CHALLENGER",
          user: { nickname: "挑战者A" },
        },
      },
    ]);
    mocks.checkinFindMany.mockResolvedValue([]);

    await expectAppError(getProgress(10, 1, { prisma }), {
      statusCode: 500,
      message: "小组时区配置错误",
    });
  });
});

