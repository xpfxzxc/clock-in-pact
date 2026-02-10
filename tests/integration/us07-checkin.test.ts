import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

import { AppError } from "../../server/utils/app-error";
import { createGroup, joinGroup, type GroupPrismaClient } from "../../server/services/group.service";
import { confirmGoal, createGoal, type GoalPrismaClient } from "../../server/services/goal.service";
import { createCheckin, listCheckins, type CheckinPrismaClient } from "../../server/services/checkin.service";
import { runGoalStatusSchedulerTick } from "../../server/services/scheduler.service";

function getDatabaseName(databaseUrl: string): string {
  const url = new URL(databaseUrl);
  return url.pathname.replace(/^\//, "");
}

function assertSafeIntegrationDatabase(databaseUrl: string): void {
  const databaseName = getDatabaseName(databaseUrl);
  if (!/(integration|test)/i.test(databaseName)) {
    throw new Error(
      `Refusing to run integration tests against database "${databaseName}". ` +
        `Please set DATABASE_URL to a *_integration or *_test database.`
    );
  }
}

async function expectAppError(
  promise: Promise<unknown>,
  expected: { statusCode: number; message: string | RegExp }
): Promise<void> {
  await expect(promise).rejects.toBeInstanceOf(AppError);
  const caught = await promise.catch((error: unknown) => error);
  if (!(caught instanceof AppError)) {
    throw caught;
  }
  expect(caught.statusCode).toBe(expected.statusCode);
  if (expected.message instanceof RegExp) {
    expect(String(caught.message)).toMatch(expected.message);
  } else {
    expect(String(caught.message)).toBe(expected.message);
  }
}

async function createUser(prisma: PrismaClient, username: string) {
  return prisma.user.create({
    data: {
      username,
      nickname: username,
      password: "pw",
    },
  });
}

function shortId(): string {
  return randomBytes(4).toString("hex");
}

const describeIntegration = process.env.INTEGRATION_TEST === "1" ? describe : describe.skip;

describeIntegration("integration US-07 打卡记录", () => {
  let prisma: PrismaClient | undefined;
  let pool: Pool | undefined;

  beforeAll(async () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error("DATABASE_URL is required for integration tests.");
    }
    assertSafeIntegrationDatabase(databaseUrl);

    pool = new Pool({ connectionString: databaseUrl });
    const adapter = new PrismaPg(pool);
    prisma = new PrismaClient({ adapter });
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await pool?.end();
  });

  beforeEach(async () => {
    if (!prisma) return;
    await prisma.checkinEvidence.deleteMany();
    await prisma.checkin.deleteMany();
    await prisma.goalChangeVote.deleteMany();
    await prisma.goalChangeRequest.deleteMany();
    await prisma.goalParticipant.deleteMany();
    await prisma.goalConfirmation.deleteMany();
    await prisma.goal.deleteMany();
    await prisma.inviteCode.deleteMany();
    await prisma.groupMember.deleteMany();
    await prisma.categoryCompletion.deleteMany();
    await prisma.group.deleteMany();
    await prisma.user.deleteMany();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function setupActiveGoal(currentTimeIso: string) {
    if (!prisma) throw new Error("Prisma not initialized");

    const currentTime = new Date(currentTimeIso);
    const createTime = new Date("2026-02-08T12:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(createTime);

    const suffix = shortId();
    const [supervisor, challenger] = await Promise.all([
      createUser(prisma, `sup_${suffix}`),
      createUser(prisma, `cha_${suffix}`),
    ]);

    const group = await createGroup({ name: "US07小组", role: "SUPERVISOR" }, supervisor.id, {
      prisma: prisma as unknown as GroupPrismaClient,
    });
    const [inviteCode] = group.inviteCodes;

    await joinGroup({ inviteCode, role: "CHALLENGER" }, challenger.id, {
      prisma: prisma as unknown as GroupPrismaClient,
    });

    const goal = await createGoal(
      {
        groupId: group.id,
        name: "跑步挑战",
        category: "跑步",
        targetValue: 60,
        unit: "km",
        startDate: "2026-02-09",
        endDate: "2026-02-28",
        rewardPunishment: "失败者请成功者吃饭",
        evidenceRequirement: "跑步 APP 截图",
      },
      supervisor.id,
      { prisma: prisma as unknown as GoalPrismaClient }
    );

    await confirmGoal(goal.id, challenger.id, "APPROVED", {
      prisma: prisma as unknown as GoalPrismaClient,
    });

    vi.setSystemTime(currentTime);

    await runGoalStatusSchedulerTick({
      prisma: prisma as unknown as GoalPrismaClient,
      now: () => currentTime,
    });

    return { goalId: goal.id, challengerId: challenger.id };
  }

  it("场景1: 成功打卡（当天）", async () => {
    if (!prisma) throw new Error("Prisma not initialized");

    const { goalId, challengerId } = await setupActiveGoal("2026-02-10T12:00:00.000Z");

    const result = await createCheckin(
      {
        goalId,
        checkinDate: "2026-02-10",
        value: 5,
        note: "完成 5km",
      },
      [{ filePath: "/uploads/checkins/1.jpg", fileSize: 1024 }],
      challengerId,
      { prisma: prisma as unknown as CheckinPrismaClient }
    );

    expect(result.checkinDate).toBe("2026-02-10");
    expect(result.value).toBe(5);
    expect(result.status).toBe("PENDING_REVIEW");

    const list = await listCheckins(goalId, challengerId, {
      prisma: prisma as unknown as CheckinPrismaClient,
    });
    expect(list.total).toBe(1);
    expect(list.checkins[0]?.checkinDate).toBe("2026-02-10");
  });

  it("场景2: 补卡成功（昨天）", async () => {
    if (!prisma) throw new Error("Prisma not initialized");

    const { goalId, challengerId } = await setupActiveGoal("2026-02-10T12:00:00.000Z");

    const result = await createCheckin(
      {
        goalId,
        checkinDate: "2026-02-09",
        value: 3.5,
        note: "补卡",
      },
      [{ filePath: "/uploads/checkins/2.jpg", fileSize: 2048 }],
      challengerId,
      { prisma: prisma as unknown as CheckinPrismaClient }
    );

    expect(result.checkinDate).toBe("2026-02-09");
    expect(result.status).toBe("PENDING_REVIEW");
  });

  it("同一天可打多次卡", async () => {
    if (!prisma) throw new Error("Prisma not initialized");

    const { goalId, challengerId } = await setupActiveGoal("2026-02-10T12:00:00.000Z");

    const first = await createCheckin(
      {
        goalId,
        checkinDate: "2026-02-10",
        value: 1.25,
        note: "上午",
      },
      [{ filePath: "/uploads/checkins/multi-1.jpg", fileSize: 1024 }],
      challengerId,
      { prisma: prisma as unknown as CheckinPrismaClient }
    );

    const second = await createCheckin(
      {
        goalId,
        checkinDate: "2026-02-10",
        value: 2.75,
        note: "晚上",
      },
      [{ filePath: "/uploads/checkins/multi-2.jpg", fileSize: 1024 }],
      challengerId,
      { prisma: prisma as unknown as CheckinPrismaClient }
    );

    expect(first.checkinDate).toBe("2026-02-10");
    expect(second.checkinDate).toBe("2026-02-10");
    expect(first.id).not.toBe(second.id);

    const list = await listCheckins(goalId, challengerId, {
      prisma: prisma as unknown as CheckinPrismaClient,
    });

    expect(list.total).toBe(2);
    expect(list.checkins.filter((item) => item.checkinDate === "2026-02-10")).toHaveLength(2);
  });

  it("场景3: 尝试上传第6张截图 → 提示错误", async () => {
    if (!prisma) throw new Error("Prisma not initialized");

    const { goalId, challengerId } = await setupActiveGoal("2026-02-10T12:00:00.000Z");

    await expectAppError(
      createCheckin(
        {
          goalId,
          checkinDate: "2026-02-10",
          value: 2,
          note: "图太多",
        },
        [
          { filePath: "/uploads/checkins/1.jpg", fileSize: 1000 },
          { filePath: "/uploads/checkins/2.jpg", fileSize: 1000 },
          { filePath: "/uploads/checkins/3.jpg", fileSize: 1000 },
          { filePath: "/uploads/checkins/4.jpg", fileSize: 1000 },
          { filePath: "/uploads/checkins/5.jpg", fileSize: 1000 },
          { filePath: "/uploads/checkins/6.jpg", fileSize: 1000 },
        ],
        challengerId,
        { prisma: prisma as unknown as CheckinPrismaClient }
      ),
      {
        statusCode: 400,
        message: "最多上传5张图片",
      }
    );
  });
});
