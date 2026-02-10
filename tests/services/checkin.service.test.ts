import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CreateCheckinInput } from "../../server/types/checkin";
import { createCheckin, listCheckins, type CheckinPrismaClient } from "../../server/services/checkin.service";
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
  const goalFindUniqueMock = vi.fn();
  const groupMemberFindUniqueMock = vi.fn();
  const goalParticipantFindUniqueMock = vi.fn();
  const checkinCreateMock = vi.fn();
  const checkinFindUniqueMock = vi.fn();
  const checkinFindManyMock = vi.fn();
  const checkinEvidenceCreateManyMock = vi.fn();

  const transactionMock = vi.fn(async (fn: (tx: any) => Promise<unknown>) => {
    return fn({
      checkin: {
        create: checkinCreateMock,
        findUnique: checkinFindUniqueMock,
      },
      checkinEvidence: {
        createMany: checkinEvidenceCreateManyMock,
      },
    });
  });

  const prisma: CheckinPrismaClient = {
    $transaction: transactionMock as unknown as CheckinPrismaClient["$transaction"],
    goal: {
      findUnique: goalFindUniqueMock as unknown as CheckinPrismaClient["goal"]["findUnique"],
    },
    groupMember: {
      findUnique: groupMemberFindUniqueMock as unknown as CheckinPrismaClient["groupMember"]["findUnique"],
    },
    goalParticipant: {
      findUnique: goalParticipantFindUniqueMock as unknown as CheckinPrismaClient["goalParticipant"]["findUnique"],
    },
    checkin: {
      create: checkinCreateMock as unknown as CheckinPrismaClient["checkin"]["create"],
      findUnique: checkinFindUniqueMock as unknown as CheckinPrismaClient["checkin"]["findUnique"],
      findMany: checkinFindManyMock as unknown as CheckinPrismaClient["checkin"]["findMany"],
    },
    checkinEvidence: {
      createMany: checkinEvidenceCreateManyMock as unknown as CheckinPrismaClient["checkinEvidence"]["createMany"],
    },
  };

  return {
    prisma,
    mocks: {
      transaction: transactionMock,
      goalFindUnique: goalFindUniqueMock,
      groupMemberFindUnique: groupMemberFindUniqueMock,
      goalParticipantFindUnique: goalParticipantFindUniqueMock,
      checkinCreate: checkinCreateMock,
      checkinFindUnique: checkinFindUniqueMock,
      checkinFindMany: checkinFindManyMock,
      checkinEvidenceCreateMany: checkinEvidenceCreateManyMock,
    },
  };
}

const baseCreateInput: CreateCheckinInput = {
  goalId: 10,
  checkinDate: "2026-02-10",
  value: 3.5,
  note: "今天完成了训练",
};

const baseEvidence = [{ filePath: "/uploads/checkins/a.jpg", fileSize: 1000 }];

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-02-10T12:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("checkin.service createCheckin", () => {
  it("成功打卡：支持当天打卡与补卡", async () => {
    const { prisma, mocks } = createPrismaMock();
    const now = new Date();

    const goal = {
      id: 10,
      groupId: 1,
      status: "ACTIVE",
      startDate: new Date(Date.UTC(2026, 1, 8)),
      endDate: new Date(Date.UTC(2026, 1, 28)),
      group: { timezone: "Asia/Shanghai" },
    };

    mocks.goalFindUnique.mockResolvedValueOnce(goal).mockResolvedValueOnce(goal);
    mocks.groupMemberFindUnique
      .mockResolvedValueOnce({ id: 100, role: "CHALLENGER" })
      .mockResolvedValueOnce({ id: 100, role: "CHALLENGER" });
    mocks.goalParticipantFindUnique.mockResolvedValueOnce({ id: 1000 }).mockResolvedValueOnce({ id: 1000 });

    mocks.checkinCreate.mockResolvedValueOnce({ id: 501 }).mockResolvedValueOnce({ id: 502 });
    mocks.checkinEvidenceCreateMany.mockResolvedValue({ count: 1 });
    mocks.checkinFindUnique
      .mockResolvedValueOnce({
        id: 501,
        goalId: 10,
        memberId: 100,
        checkinDate: new Date(Date.UTC(2026, 1, 10)),
        value: { toNumber: () => 3.5 },
        note: "今天完成了训练",
        status: "PENDING_REVIEW",
        createdAt: now,
        evidence: [{ id: 1, filePath: "/uploads/checkins/a.jpg", fileSize: 1000 }],
        member: { user: { nickname: "挑战者A" } },
      })
      .mockResolvedValueOnce({
        id: 502,
        goalId: 10,
        memberId: 100,
        checkinDate: new Date(Date.UTC(2026, 1, 9)),
        value: { toString: () => "2.25" },
        note: "补卡",
        status: "PENDING_REVIEW",
        createdAt: now,
        evidence: [{ id: 2, filePath: "/uploads/checkins/b.jpg", fileSize: 1500 }],
        member: { user: { nickname: "挑战者A" } },
      });

    const todayCheckin = await createCheckin({ ...baseCreateInput }, baseEvidence, 1, { prisma });
    const backfillCheckin = await createCheckin(
      { ...baseCreateInput, checkinDate: "2026-02-09", value: 2.25, note: "补卡" },
      [{ filePath: "/uploads/checkins/b.jpg", fileSize: 1500 }],
      1,
      { prisma }
    );

    expect(todayCheckin).toMatchObject({
      id: 501,
      goalId: 10,
      memberId: 100,
      checkinDate: "2026-02-10",
      value: 3.5,
      createdByNickname: "挑战者A",
    });
    expect(backfillCheckin).toMatchObject({
      id: 502,
      checkinDate: "2026-02-09",
      value: 2.25,
      createdByNickname: "挑战者A",
    });

    expect(mocks.checkinEvidenceCreateMany).toHaveBeenNthCalledWith(1, {
      data: [{ checkinId: 501, filePath: "/uploads/checkins/a.jpg", fileSize: 1000 }],
    });
    expect(mocks.checkinEvidenceCreateMany).toHaveBeenNthCalledWith(2, {
      data: [{ checkinId: 502, filePath: "/uploads/checkins/b.jpg", fileSize: 1500 }],
    });
  });

  it("同一天可打多次卡", async () => {
    const { prisma, mocks } = createPrismaMock();
    const now = new Date();

    const goal = {
      id: 10,
      groupId: 1,
      status: "ACTIVE",
      startDate: new Date(Date.UTC(2026, 1, 8)),
      endDate: new Date(Date.UTC(2026, 1, 28)),
      group: { timezone: "Asia/Shanghai" },
    };

    mocks.goalFindUnique.mockResolvedValue(goal);
    mocks.groupMemberFindUnique.mockResolvedValue({ id: 100, role: "CHALLENGER" });
    mocks.goalParticipantFindUnique.mockResolvedValue({ id: 1000 });

    mocks.checkinCreate.mockResolvedValueOnce({ id: 601 }).mockResolvedValueOnce({ id: 602 });
    mocks.checkinEvidenceCreateMany.mockResolvedValue({ count: 1 });
    mocks.checkinFindUnique
      .mockResolvedValueOnce({
        id: 601,
        goalId: 10,
        memberId: 100,
        checkinDate: new Date(Date.UTC(2026, 1, 10)),
        value: { toNumber: () => 1 },
        note: "早上跑步",
        status: "PENDING_REVIEW",
        createdAt: now,
        evidence: [{ id: 1, filePath: "/uploads/checkins/a.jpg", fileSize: 1000 }],
        member: { user: { nickname: "挑战者A" } },
      })
      .mockResolvedValueOnce({
        id: 602,
        goalId: 10,
        memberId: 100,
        checkinDate: new Date(Date.UTC(2026, 1, 10)),
        value: { toNumber: () => 2 },
        note: "晚上加练",
        status: "PENDING_REVIEW",
        createdAt: now,
        evidence: [{ id: 2, filePath: "/uploads/checkins/b.jpg", fileSize: 1200 }],
        member: { user: { nickname: "挑战者A" } },
      });

    const first = await createCheckin(
      { ...baseCreateInput, value: 1, note: "早上跑步" },
      [{ filePath: "/uploads/checkins/a.jpg", fileSize: 1000 }],
      1,
      { prisma }
    );
    const second = await createCheckin(
      { ...baseCreateInput, value: 2, note: "晚上加练" },
      [{ filePath: "/uploads/checkins/b.jpg", fileSize: 1200 }],
      1,
      { prisma }
    );

    expect(first.checkinDate).toBe("2026-02-10");
    expect(second.checkinDate).toBe("2026-02-10");
    expect(first.id).not.toBe(second.id);
    expect(mocks.checkinCreate).toHaveBeenCalledTimes(2);
  });

  it("目标不存在 → 提示错误", async () => {
    const { prisma, mocks } = createPrismaMock();

    mocks.goalFindUnique.mockResolvedValueOnce(null);

    await expectAppError(createCheckin({ ...baseCreateInput }, baseEvidence, 1, { prisma }), {
      statusCode: 404,
      message: "目标不存在",
    });
  });

  it("目标 ID 非正整数 → 提示错误", async () => {
    const { prisma, mocks } = createPrismaMock();

    await expectAppError(createCheckin({ ...baseCreateInput, goalId: 0 }, baseEvidence, 1, { prisma }), {
      statusCode: 400,
      message: "无效的目标 ID",
    });

    await expectAppError(createCheckin({ ...baseCreateInput, goalId: 1.5 }, baseEvidence, 1, { prisma }), {
      statusCode: 400,
      message: "无效的目标 ID",
    });

    expect(mocks.goalFindUnique).not.toHaveBeenCalled();
  });

  it("目标不是 ACTIVE 状态 → 提示错误", async () => {
    const { prisma, mocks } = createPrismaMock();

    mocks.goalFindUnique.mockResolvedValueOnce({
      id: 10,
      groupId: 1,
      status: "UPCOMING",
      startDate: new Date(Date.UTC(2026, 1, 8)),
      endDate: new Date(Date.UTC(2026, 1, 28)),
      group: { timezone: "Asia/Shanghai" },
    });
    mocks.groupMemberFindUnique.mockResolvedValueOnce({ id: 100, role: "CHALLENGER" });

    await expectAppError(createCheckin({ ...baseCreateInput }, baseEvidence, 1, { prisma }), {
      statusCode: 400,
      message: "仅进行中的目标可打卡",
    });
  });

  it("非小组成员 → 提示错误", async () => {
    const { prisma, mocks } = createPrismaMock();

    mocks.goalFindUnique.mockResolvedValueOnce({
      id: 10,
      groupId: 1,
      status: "ACTIVE",
      startDate: new Date(Date.UTC(2026, 1, 8)),
      endDate: new Date(Date.UTC(2026, 1, 28)),
      group: { timezone: "Asia/Shanghai" },
    });
    mocks.groupMemberFindUnique.mockResolvedValueOnce(null);

    await expectAppError(createCheckin({ ...baseCreateInput }, baseEvidence, 1, { prisma }), {
      statusCode: 403,
      message: "您不是该小组成员",
    });
  });

  it("非挑战者 → 提示错误", async () => {
    const { prisma, mocks } = createPrismaMock();

    mocks.goalFindUnique.mockResolvedValueOnce({
      id: 10,
      groupId: 1,
      status: "ACTIVE",
      startDate: new Date(Date.UTC(2026, 1, 8)),
      endDate: new Date(Date.UTC(2026, 1, 28)),
      group: { timezone: "Asia/Shanghai" },
    });
    mocks.groupMemberFindUnique.mockResolvedValueOnce({ id: 100, role: "SUPERVISOR" });

    await expectAppError(createCheckin({ ...baseCreateInput }, baseEvidence, 1, { prisma }), {
      statusCode: 403,
      message: "仅挑战者可打卡",
    });
  });

  it("非目标参与者 → 提示错误", async () => {
    const { prisma, mocks } = createPrismaMock();

    mocks.goalFindUnique.mockResolvedValueOnce({
      id: 10,
      groupId: 1,
      status: "ACTIVE",
      startDate: new Date(Date.UTC(2026, 1, 8)),
      endDate: new Date(Date.UTC(2026, 1, 28)),
      group: { timezone: "Asia/Shanghai" },
    });
    mocks.groupMemberFindUnique.mockResolvedValueOnce({ id: 100, role: "CHALLENGER" });
    mocks.goalParticipantFindUnique.mockResolvedValueOnce(null);

    await expectAppError(createCheckin({ ...baseCreateInput }, baseEvidence, 1, { prisma }), {
      statusCode: 403,
      message: "您不是该目标参与者",
    });
  });

  it("打卡日期早于目标开始日期 → 提示错误", async () => {
    const { prisma, mocks } = createPrismaMock();

    mocks.goalFindUnique.mockResolvedValueOnce({
      id: 10,
      groupId: 1,
      status: "ACTIVE",
      startDate: new Date(Date.UTC(2026, 1, 8)),
      endDate: new Date(Date.UTC(2026, 1, 28)),
      group: { timezone: "Asia/Shanghai" },
    });
    mocks.groupMemberFindUnique.mockResolvedValueOnce({ id: 100, role: "CHALLENGER" });
    mocks.goalParticipantFindUnique.mockResolvedValueOnce({ id: 1000 });

    await expectAppError(
      createCheckin({ ...baseCreateInput, checkinDate: "2026-02-07" }, baseEvidence, 1, { prisma }),
      {
        statusCode: 400,
        message: "打卡日期无效",
      }
    );
  });

  it("打卡日期晚于小组时区今天 → 提示错误", async () => {
    const { prisma, mocks } = createPrismaMock();

    mocks.goalFindUnique.mockResolvedValueOnce({
      id: 10,
      groupId: 1,
      status: "ACTIVE",
      startDate: new Date(Date.UTC(2026, 1, 8)),
      endDate: new Date(Date.UTC(2026, 1, 28)),
      group: { timezone: "Asia/Shanghai" },
    });
    mocks.groupMemberFindUnique.mockResolvedValueOnce({ id: 100, role: "CHALLENGER" });
    mocks.goalParticipantFindUnique.mockResolvedValueOnce({ id: 1000 });

    await expectAppError(
      createCheckin({ ...baseCreateInput, checkinDate: "2026-02-11" }, baseEvidence, 1, { prisma }),
      {
        statusCode: 400,
        message: "打卡日期无效",
      }
    );
  });

  it("打卡日期晚于目标结束日期 → 提示错误", async () => {
    const { prisma, mocks } = createPrismaMock();

    mocks.goalFindUnique.mockResolvedValueOnce({
      id: 10,
      groupId: 1,
      status: "ACTIVE",
      startDate: new Date(Date.UTC(2026, 1, 8)),
      endDate: new Date(Date.UTC(2026, 1, 9)),
      group: { timezone: "Asia/Shanghai" },
    });
    mocks.groupMemberFindUnique.mockResolvedValueOnce({ id: 100, role: "CHALLENGER" });
    mocks.goalParticipantFindUnique.mockResolvedValueOnce({ id: 1000 });

    await expectAppError(
      createCheckin({ ...baseCreateInput, checkinDate: "2026-02-10" }, baseEvidence, 1, { prisma }),
      {
        statusCode: 400,
        message: "打卡日期无效",
      }
    );
  });

  it("打卡数值小于等于0 → 提示错误", async () => {
    const { prisma, mocks } = createPrismaMock();

    await expectAppError(createCheckin({ ...baseCreateInput, value: 0 }, baseEvidence, 1, { prisma }), {
      statusCode: 400,
      message: "打卡数值必须大于0",
    });

    expect(mocks.goalFindUnique).not.toHaveBeenCalled();
  });

  it("打卡数值非有限数值 → 提示错误", async () => {
    const { prisma, mocks } = createPrismaMock();

    await expectAppError(createCheckin({ ...baseCreateInput, value: Number.POSITIVE_INFINITY }, baseEvidence, 1, { prisma }), {
      statusCode: 400,
      message: "打卡数值无效",
    });

    expect(mocks.goalFindUnique).not.toHaveBeenCalled();
  });

  it("证据数量小于1 → 提示错误", async () => {
    const { prisma, mocks } = createPrismaMock();

    await expectAppError(createCheckin({ ...baseCreateInput }, [], 1, { prisma }), {
      statusCode: 400,
      message: "请至少上传1张图片",
    });

    expect(mocks.goalFindUnique).not.toHaveBeenCalled();
  });

  it("证据数量大于5 → 提示错误", async () => {
    const { prisma, mocks } = createPrismaMock();

    await expectAppError(
      createCheckin(
        { ...baseCreateInput },
        [
          { filePath: "1.jpg", fileSize: 1 },
          { filePath: "2.jpg", fileSize: 1 },
          { filePath: "3.jpg", fileSize: 1 },
          { filePath: "4.jpg", fileSize: 1 },
          { filePath: "5.jpg", fileSize: 1 },
          { filePath: "6.jpg", fileSize: 1 },
        ],
        1,
        { prisma }
      ),
      {
        statusCode: 400,
        message: "最多上传5张图片",
      }
    );

    expect(mocks.goalFindUnique).not.toHaveBeenCalled();
  });

  it("单张证据超过5MB → 提示错误", async () => {
    const { prisma, mocks } = createPrismaMock();

    await expectAppError(
      createCheckin(
        { ...baseCreateInput },
        [{ filePath: "/uploads/checkins/a.jpg", fileSize: 5 * 1024 * 1024 + 1 }],
        1,
        { prisma }
      ),
      {
        statusCode: 400,
        message: "单张图片不超过5MB",
      }
    );

    expect(mocks.goalFindUnique).not.toHaveBeenCalled();
  });
});

describe("checkin.service listCheckins", () => {
  it("goalId 非正整数查询打卡列表 → 提示错误", async () => {
    const { prisma, mocks } = createPrismaMock();

    await expectAppError(listCheckins(0, 1, { prisma }), {
      statusCode: 400,
      message: "无效的目标 ID",
    });

    await expectAppError(listCheckins(3.14, 1, { prisma }), {
      statusCode: 400,
      message: "无效的目标 ID",
    });

    expect(mocks.goalFindUnique).not.toHaveBeenCalled();
  });

  it("成功查询目标打卡列表", async () => {
    const { prisma, mocks } = createPrismaMock();

    mocks.goalFindUnique.mockResolvedValueOnce({
      id: 10,
      groupId: 1,
      status: "ACTIVE",
      startDate: new Date(Date.UTC(2026, 1, 8)),
      endDate: new Date(Date.UTC(2026, 1, 28)),
      group: { timezone: "Asia/Shanghai" },
    });
    mocks.groupMemberFindUnique.mockResolvedValueOnce({ id: 100, role: "CHALLENGER" });
    mocks.checkinFindMany.mockResolvedValueOnce([
      {
        id: 2,
        goalId: 10,
        memberId: 101,
        checkinDate: new Date(Date.UTC(2026, 1, 10)),
        value: { toNumber: () => 3 },
        note: "第二条",
        status: "PENDING_REVIEW",
        createdAt: new Date("2026-02-10T10:00:00.000Z"),
        evidence: [{ id: 11, filePath: "/uploads/checkins/2.jpg", fileSize: 2222 }],
        member: { user: { nickname: "挑战者B" } },
      },
      {
        id: 1,
        goalId: 10,
        memberId: 100,
        checkinDate: new Date(Date.UTC(2026, 1, 9)),
        value: { toString: () => "1.5" },
        note: "第一条",
        status: "CONFIRMED",
        createdAt: new Date("2026-02-09T10:00:00.000Z"),
        evidence: [{ id: 10, filePath: "/uploads/checkins/1.jpg", fileSize: 1111 }],
        member: { user: { nickname: "挑战者A" } },
      },
    ]);

    const result = await listCheckins(10, 1, { prisma });

    expect(result.total).toBe(2);
    expect(result.checkins).toEqual([
      {
        id: 2,
        goalId: 10,
        memberId: 101,
        checkinDate: "2026-02-10",
        value: 3,
        note: "第二条",
        status: "PENDING_REVIEW",
        evidence: [{ id: 11, filePath: "/uploads/checkins/2.jpg", fileSize: 2222 }],
        createdByNickname: "挑战者B",
        createdAt: "2026-02-10T10:00:00.000Z",
      },
      {
        id: 1,
        goalId: 10,
        memberId: 100,
        checkinDate: "2026-02-09",
        value: 1.5,
        note: "第一条",
        status: "CONFIRMED",
        evidence: [{ id: 10, filePath: "/uploads/checkins/1.jpg", fileSize: 1111 }],
        createdByNickname: "挑战者A",
        createdAt: "2026-02-09T10:00:00.000Z",
      },
    ]);

    expect(mocks.checkinFindMany).toHaveBeenCalledWith({
      where: { goalId: 10 },
      include: {
        evidence: {
          select: {
            id: true,
            filePath: true,
            fileSize: true,
          },
        },
        member: {
          include: {
            user: {
              select: {
                nickname: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  });

  it("非小组成员查询打卡列表 → 提示错误", async () => {
    const { prisma, mocks } = createPrismaMock();

    mocks.goalFindUnique.mockResolvedValueOnce({
      id: 10,
      groupId: 1,
      status: "ACTIVE",
      startDate: new Date(Date.UTC(2026, 1, 8)),
      endDate: new Date(Date.UTC(2026, 1, 28)),
      group: { timezone: "Asia/Shanghai" },
    });
    mocks.groupMemberFindUnique.mockResolvedValueOnce(null);

    await expectAppError(listCheckins(10, 1, { prisma }), {
      statusCode: 403,
      message: "您不是该小组成员",
    });

    expect(mocks.checkinFindMany).not.toHaveBeenCalled();
  });
});
