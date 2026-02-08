import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const cronMocks = vi.hoisted(() => {
  const stop = vi.fn();
  const schedule = vi.fn(() => ({ stop }));
  return { schedule, stop };
});

vi.mock(
  "node-cron",
  () => ({
    default: {
      schedule: cronMocks.schedule,
    },
  }),
  { virtual: true }
);

import { runGoalStatusSchedulerTick, startGoalStatusScheduler } from "../../server/services/scheduler.service";

function createPrismaMock() {
  const groupFindManyMock = vi.fn();
  const goalUpdateManyMock = vi.fn().mockResolvedValue({ count: 0 });
  const goalFindManyMock = vi.fn().mockResolvedValue([]);
  const goalChangeRequestUpdateManyMock = vi.fn().mockResolvedValue({ count: 0 });
  const goalChangeRequestFindManyMock = vi.fn().mockResolvedValue([]);

  const prisma = {
    group: {
      findMany: groupFindManyMock,
    },
    goal: {
      updateMany: goalUpdateManyMock,
      findMany: goalFindManyMock,
    },
    goalChangeRequest: {
      updateMany: goalChangeRequestUpdateManyMock,
      findMany: goalChangeRequestFindManyMock,
    },
  };

  return {
    prisma,
    mocks: {
      groupFindMany: groupFindManyMock,
      goalUpdateMany: goalUpdateManyMock,
      goalFindMany: goalFindManyMock,
      goalChangeRequestUpdateMany: goalChangeRequestUpdateManyMock,
      goalChangeRequestFindMany: goalChangeRequestFindManyMock,
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  cronMocks.schedule.mockClear();
  cronMocks.stop.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("scheduler.service runGoalStatusSchedulerTick", () => {
  it("按时区批量处理：到达开始日期 00:00:00（小组时区）时批量推进 UPCOMING→ACTIVE, PENDING→VOIDED", async () => {
    const { prisma, mocks } = createPrismaMock();
    vi.setSystemTime(new Date("2026-02-05T16:00:00.000Z")); // Asia/Shanghai = 2026-02-06 00:00:00

    mocks.groupFindMany.mockResolvedValueOnce([
      { id: 1, timezone: "Asia/Shanghai" },
      { id: 2, timezone: "Asia/Shanghai" },
    ]);
    mocks.goalUpdateMany.mockImplementation(async (args: any) => {
      if (args?.data?.status === "ACTIVE") return { count: 2 };
      if (args?.data?.status === "VOIDED") return { count: 1 };
      return { count: 0 };
    });

    const result = await runGoalStatusSchedulerTick({
      prisma: prisma as any,
      logger: { error: vi.fn() },
    });

    expect(result).toMatchObject({
      activatedCount: 2,
      voidedCount: 1,
      checkedGroupCount: 2,
      checkedTimezoneCount: 1,
      processedTimezoneCount: 1,
    });

    const findManyArgs = mocks.groupFindMany.mock.calls[0]?.[0] as any;
    expect(findManyArgs).toMatchObject({
      select: { id: true, timezone: true },
      where: {
        goals: {
          some: {
            status: { in: ["PENDING", "UPCOMING"] },
          },
        },
      },
    });
    expect(findManyArgs.where.goals.some.startDate.lte).toEqual(new Date(Date.UTC(2026, 1, 6)));

    expect(mocks.goalUpdateMany).toHaveBeenCalledTimes(2);

    const activateArgs = mocks.goalUpdateMany.mock.calls[0]?.[0] as any;
    expect(activateArgs).toMatchObject({
      where: {
        groupId: { in: [1, 2] },
        status: "UPCOMING",
      },
      data: { status: "ACTIVE" },
    });
    expect(activateArgs.where.startDate.lte).toEqual(new Date(Date.UTC(2026, 1, 6)));

    const voidArgs = mocks.goalUpdateMany.mock.calls[1]?.[0] as any;
    expect(voidArgs).toMatchObject({
      where: {
        groupId: { in: [1, 2] },
        status: "PENDING",
      },
      data: { status: "VOIDED" },
    });
    expect(voidArgs.where.startDate.lte).toEqual(new Date(Date.UTC(2026, 1, 6)));
  });

  it("正确处理不同时区：同一 UTC 时刻，不同小组的开始日判断不同", async () => {
    const { prisma, mocks } = createPrismaMock();
    vi.setSystemTime(new Date("2026-02-05T16:00:00.000Z")); // Shanghai: 2026-02-06 00:00, LA: 2026-02-05 08:00

    mocks.groupFindMany.mockResolvedValueOnce([
      { id: 1, timezone: "Asia/Shanghai" },
      { id: 2, timezone: "America/Los_Angeles" },
    ]);

    await runGoalStatusSchedulerTick({ prisma: prisma as any, logger: { error: vi.fn() } });

    const calls = mocks.goalUpdateMany.mock.calls.map((call) => call[0] as any);
    expect(calls).toHaveLength(4);

    // Asia/Shanghai uses "2026-02-06"
    expect(calls[0]).toMatchObject({
      where: { groupId: { in: [1] }, status: "UPCOMING" },
      data: { status: "ACTIVE" },
    });
    expect(calls[0].where.startDate.lte).toEqual(new Date(Date.UTC(2026, 1, 6)));

    expect(calls[1]).toMatchObject({
      where: { groupId: { in: [1] }, status: "PENDING" },
      data: { status: "VOIDED" },
    });
    expect(calls[1].where.startDate.lte).toEqual(new Date(Date.UTC(2026, 1, 6)));

    // America/Los_Angeles uses "2026-02-05"
    expect(calls[2]).toMatchObject({
      where: { groupId: { in: [2] }, status: "UPCOMING" },
      data: { status: "ACTIVE" },
    });
    expect(calls[2].where.startDate.lte).toEqual(new Date(Date.UTC(2026, 1, 5)));

    expect(calls[3]).toMatchObject({
      where: { groupId: { in: [2] }, status: "PENDING" },
      data: { status: "VOIDED" },
    });
    expect(calls[3].where.startDate.lte).toEqual(new Date(Date.UTC(2026, 1, 5)));
  });

  it("遇到非法时区不应中断任务（跳过该时区的小组）", async () => {
    const { prisma, mocks } = createPrismaMock();
    vi.setSystemTime(new Date("2026-02-05T16:00:00.000Z"));

    const loggerError = vi.fn();
    mocks.groupFindMany.mockResolvedValueOnce([{ id: 1, timezone: "Bad/Zone" }]);

    const result = await runGoalStatusSchedulerTick({ prisma: prisma as any, logger: { error: loggerError } });

    expect(result).toMatchObject({
      activatedCount: 0,
      voidedCount: 0,
      checkedGroupCount: 1,
      checkedTimezoneCount: 1,
      processedTimezoneCount: 0,
    });
    expect(mocks.goalUpdateMany).not.toHaveBeenCalled();
    expect(loggerError).toHaveBeenCalledTimes(1);
  });

  it("无待处理小组时不应更新目标状态", async () => {
    const { prisma, mocks } = createPrismaMock();
    mocks.groupFindMany.mockResolvedValueOnce([]);

    const result = await runGoalStatusSchedulerTick({ prisma: prisma as any, logger: { error: vi.fn() } });

    expect(result).toMatchObject({
      activatedCount: 0,
      voidedCount: 0,
      checkedGroupCount: 0,
      checkedTimezoneCount: 0,
      processedTimezoneCount: 0,
    });
    expect(mocks.goalUpdateMany).not.toHaveBeenCalled();
  });

  it("会处理变更请求：过期请求标记 EXPIRED，待结算目标下请求标记 VOIDED", async () => {
    const { prisma, mocks } = createPrismaMock();
    vi.setSystemTime(new Date("2026-02-05T16:00:00.000Z"));

    mocks.groupFindMany.mockResolvedValueOnce([]);

    const result = await runGoalStatusSchedulerTick({ prisma: prisma as any, logger: { error: vi.fn() } });

    expect(result).toMatchObject({
      activatedCount: 0,
      voidedCount: 0,
      expiredChangeRequestCount: 0,
      voidedChangeRequestCount: 0,
      checkedGroupCount: 0,
    });

    expect(mocks.goalChangeRequestUpdateMany).toHaveBeenCalledTimes(2);
    expect(mocks.goalChangeRequestUpdateMany.mock.calls[0]?.[0]).toMatchObject({
      where: { status: "PENDING", expiresAt: { lte: new Date("2026-02-05T16:00:00.000Z") } },
      data: { status: "EXPIRED" },
    });
    expect(mocks.goalChangeRequestUpdateMany.mock.calls[1]?.[0]).toMatchObject({
      where: {
        status: "PENDING",
        goal: { status: "SETTLING" },
      },
      data: { status: "VOIDED" },
    });
  });

  it("修改请求含新开始日期且该日期到达时：请求自动 EXPIRED（场景10）", async () => {
    const { prisma, mocks } = createPrismaMock();
    vi.setSystemTime(new Date("2026-02-05T16:00:00.000Z")); // Asia/Shanghai = 2026-02-06

    mocks.goalChangeRequestFindMany.mockResolvedValueOnce([
      {
        id: 11,
        expiresAt: new Date("2026-02-06T23:00:00.000Z"),
        proposedChanges: { startDate: "2026-02-06" },
        goal: { group: { timezone: "Asia/Shanghai" } },
      },
      {
        id: 12,
        expiresAt: new Date("2026-02-07T23:00:00.000Z"),
        proposedChanges: { startDate: "2026-02-07" },
        goal: { group: { timezone: "Asia/Shanghai" } },
      },
    ]);
    mocks.groupFindMany.mockResolvedValueOnce([]);
    mocks.goalChangeRequestUpdateMany
      .mockResolvedValueOnce({ count: 1 }) // expiredByProposedStart
      .mockResolvedValueOnce({ count: 0 }) // expired
      .mockResolvedValueOnce({ count: 0 }); // settling

    const result = await runGoalStatusSchedulerTick({ prisma: prisma as any, logger: { error: vi.fn() } });

    expect(result).toMatchObject({
      voidedChangeRequestCount: 0,
      expiredChangeRequestCount: 1,
    });

    expect(mocks.goalChangeRequestFindMany).toHaveBeenCalledWith({
      where: { status: "PENDING", type: "MODIFY" },
      select: {
        id: true,
        expiresAt: true,
        proposedChanges: true,
        goal: { select: { group: { select: { timezone: true } } } },
      },
    });

    expect(mocks.goalChangeRequestUpdateMany.mock.calls[0]?.[0]).toMatchObject({
      where: { id: { in: [11] }, status: "PENDING" },
      data: { status: "EXPIRED" },
    });
  });

  it("修改请求含新结束日期且该日期到达时：请求自动 EXPIRED（场景12）", async () => {
    const { prisma, mocks } = createPrismaMock();
    vi.setSystemTime(new Date("2026-02-05T16:00:00.000Z")); // Asia/Shanghai = 2026-02-06

    mocks.goalChangeRequestFindMany.mockResolvedValueOnce([
      {
        id: 21,
        expiresAt: new Date("2026-02-06T23:00:00.000Z"),
        proposedChanges: { endDate: "2026-02-06" },
        goal: { group: { timezone: "Asia/Shanghai" } },
      },
      {
        id: 22,
        expiresAt: new Date("2026-02-07T23:00:00.000Z"),
        proposedChanges: { endDate: "2026-02-07" },
        goal: { group: { timezone: "Asia/Shanghai" } },
      },
    ]);
    mocks.groupFindMany.mockResolvedValueOnce([]);
    mocks.goalChangeRequestUpdateMany
      .mockResolvedValueOnce({ count: 1 }) // expiredByProposedDate
      .mockResolvedValueOnce({ count: 0 }) // expired
      .mockResolvedValueOnce({ count: 0 }); // settling

    const result = await runGoalStatusSchedulerTick({ prisma: prisma as any, logger: { error: vi.fn() } });

    expect(result).toMatchObject({
      voidedChangeRequestCount: 0,
      expiredChangeRequestCount: 1,
    });

    expect(mocks.goalChangeRequestUpdateMany.mock.calls[0]?.[0]).toMatchObject({
      where: { id: { in: [21] }, status: "PENDING" },
      data: { status: "EXPIRED" },
    });
  });
});

describe("scheduler.service startGoalStatusScheduler", () => {
  it("使用 node-cron 每分钟调度一次", async () => {
    const { prisma } = createPrismaMock();

    const handle = await startGoalStatusScheduler(
      { prisma: prisma as any, logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } },
      { runOnStart: false }
    );

    expect(cronMocks.schedule).toHaveBeenCalledTimes(1);
    const [expression, callback] = cronMocks.schedule.mock.calls[0] ?? [];
    expect(expression).toBe("* * * * *");
    expect(typeof callback).toBe("function");

    handle.stop();
    expect(cronMocks.stop).toHaveBeenCalledTimes(1);
  });

  it("开发模式下使用 setInterval 调度", async () => {
    const { prisma, mocks } = createPrismaMock();
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";

    try {
      const handle = await startGoalStatusScheduler(
        { prisma: prisma as any, logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } },
        { runOnStart: false }
      );

      expect(cronMocks.schedule).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(60_000);
      expect(mocks.groupFindMany).toHaveBeenCalledTimes(1);

      handle.stop();

      const callsAfterStop = mocks.groupFindMany.mock.calls.length;
      await vi.advanceTimersByTimeAsync(60_000);
      expect(mocks.groupFindMany).toHaveBeenCalledTimes(callsAfterStop);
    } finally {
      process.env.NODE_ENV = originalNodeEnv;
    }
  });
});
