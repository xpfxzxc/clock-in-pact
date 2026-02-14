import { randomBytes } from "node:crypto";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createCheckin, listCheckins, reviewCheckin, type CheckinPrismaClient } from "../../server/services/checkin.service";
import { confirmGoal, createGoal, getDurationLimit, type GoalPrismaClient } from "../../server/services/goal.service";
import { createGroup, joinGroup, type GroupPrismaClient } from "../../server/services/group.service";
import { getProgress, type ProgressPrismaClient } from "../../server/services/progress.service";
import { runGoalStatusSchedulerTick } from "../../server/services/scheduler.service";
import { confirmSettlement, getSettlementResult, type SettlementPrismaClient } from "../../server/services/settlement.service";
import { AppError } from "../../server/utils/app-error";

function getDatabaseName(databaseUrl: string): string {
  const url = new URL(databaseUrl);
  return url.pathname.replace(/^\//, "");
}

function assertSafeIntegrationDatabase(databaseUrl: string): void {
  const databaseName = getDatabaseName(databaseUrl);
  if (!/(integration|test)/i.test(databaseName)) {
    throw new Error(
      'Refusing to run integration tests against database "' +
        databaseName +
        '". Please set DATABASE_URL to a *_integration or *_test database.'
    );
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

const describeIntegration = process.env.INTEGRATION_TEST === "1" ? describe : describe.skip;

describeIntegration("integration US-11 结算与归档", () => {
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
    await prisma.feedEvent.deleteMany();
    await prisma.checkinReview.deleteMany();
    await prisma.checkinEvidence.deleteMany();
    await prisma.checkin.deleteMany();
    await prisma.settlementConfirmation.deleteMany();
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

  it("按 US-11 验收：成功结算 + 达标解锁 + 历史查看", async () => {
    if (!prisma) throw new Error("Prisma not initialized");

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-31T12:00:00.000Z"));

    const suffix = shortId();
    const [supervisor, challengerA, challengerB] = await Promise.all([
      createUser(prisma, "sup_" + suffix),
      createUser(prisma, "cha_a_" + suffix),
      createUser(prisma, "cha_b_" + suffix),
    ]);

    const group = await createGroup(
      { name: "US11小组", role: "SUPERVISOR", timezone: "Asia/Shanghai" },
      supervisor.id,
      { prisma: prisma as unknown as GroupPrismaClient }
    );
    const [inviteCodeA, inviteCodeB] = group.inviteCodes;

    await joinGroup({ inviteCode: inviteCodeA!, role: "CHALLENGER" }, challengerA.id, {
      prisma: prisma as unknown as GroupPrismaClient,
    });
    await joinGroup({ inviteCode: inviteCodeB!, role: "CHALLENGER" }, challengerB.id, {
      prisma: prisma as unknown as GroupPrismaClient,
    });

    const goal = await createGoal(
      {
        groupId: group.id,
        name: "跑步目标",
        category: "跑步",
        targetValue: 10,
        unit: "km",
        startDate: "2026-02-01",
        endDate: "2026-02-05",
        rewardPunishment: "未达标者请达标者喝咖啡",
        evidenceRequirement: "跑步截图",
      },
      supervisor.id,
      { prisma: prisma as unknown as GoalPrismaClient }
    );
    await confirmGoal(goal.id, challengerA.id, "APPROVED", { prisma: prisma as unknown as GoalPrismaClient });
    await confirmGoal(goal.id, challengerB.id, "APPROVED", { prisma: prisma as unknown as GoalPrismaClient });

    const activateTime = new Date("2026-01-31T16:00:00.000Z");
    vi.setSystemTime(activateTime); // Asia/Shanghai = 2026-02-01 00:00
    await runGoalStatusSchedulerTick({ prisma, now: () => activateTime });

    vi.setSystemTime(new Date("2026-02-02T09:00:00.000Z"));
    const aConfirmed = await createCheckin(
      { goalId: goal.id, checkinDate: "2026-02-02", value: 10, note: "A-达标" },
      [{ filePath: "/uploads/checkins/us11-a-confirmed.jpg", fileSize: 1024 }],
      challengerA.id,
      { prisma: prisma as unknown as CheckinPrismaClient }
    );
    await reviewCheckin(aConfirmed.id, { action: "CONFIRMED" }, supervisor.id, {
      prisma: prisma as unknown as CheckinPrismaClient,
    });

    vi.setSystemTime(new Date("2026-02-03T09:00:00.000Z"));
    const aDisputed = await createCheckin(
      { goalId: goal.id, checkinDate: "2026-02-03", value: 5, note: "A-质疑不计入" },
      [{ filePath: "/uploads/checkins/us11-a-disputed.jpg", fileSize: 1024 }],
      challengerA.id,
      { prisma: prisma as unknown as CheckinPrismaClient }
    );
    await reviewCheckin(aDisputed.id, { action: "DISPUTED", reason: "证据不清晰" }, supervisor.id, {
      prisma: prisma as unknown as CheckinPrismaClient,
    });

    vi.setSystemTime(new Date("2026-02-04T09:00:00.000Z"));
    const bConfirmed = await createCheckin(
      { goalId: goal.id, checkinDate: "2026-02-04", value: 5, note: "B-未达标" },
      [{ filePath: "/uploads/checkins/us11-b-confirmed.jpg", fileSize: 1024 }],
      challengerB.id,
      { prisma: prisma as unknown as CheckinPrismaClient }
    );
    await reviewCheckin(bConfirmed.id, { action: "CONFIRMED" }, supervisor.id, {
      prisma: prisma as unknown as CheckinPrismaClient,
    });

    const settleTime = new Date("2026-02-05T16:00:00.000Z");
    vi.setSystemTime(settleTime); // Asia/Shanghai = 2026-02-06 00:00
    await runGoalStatusSchedulerTick({ prisma, now: () => settleTime });

    const settlingGoal = await prisma.goal.findUnique({
      where: { id: goal.id },
      select: { status: true },
    });
    expect(settlingGoal?.status).toBe("SETTLING");

    const settleResult = await confirmSettlement(goal.id, supervisor.id, {
      prisma: prisma as unknown as SettlementPrismaClient,
    });
    expect(settleResult).toEqual({ goalId: goal.id, archived: true });

    const archivedGoal = await prisma.goal.findUnique({
      where: { id: goal.id },
      select: { status: true },
    });
    expect(archivedGoal?.status).toBe("ARCHIVED");

    const result = await getSettlementResult(goal.id, supervisor.id, {
      prisma: prisma as unknown as SettlementPrismaClient,
    });

    expect(result.goal).toMatchObject({
      id: goal.id,
      status: "ARCHIVED",
      rewardPunishment: "未达标者请达标者喝咖啡",
    });
    const resultA = result.results.find((item) => item.userId === challengerA.id);
    const resultB = result.results.find((item) => item.userId === challengerB.id);
    expect(resultA).toMatchObject({
      achieved: true,
      completedValue: 10,
      percentage: 100,
      unlockedMaxMonths: 2,
    });
    expect(resultB).toMatchObject({
      achieved: false,
      completedValue: 5,
      percentage: 50,
    });
    expect(result.hasPendingCheckins).toBe(false);
    expect(result.settlementProgress.confirmed).toBe(1);
    expect(result.settlementProgress.total).toBe(1);

    const progress = await getProgress(goal.id, challengerA.id, {
      prisma: prisma as unknown as ProgressPrismaClient,
    });
    expect(progress.goal.status).toBe("ARCHIVED");
    expect(progress.remainingDays).toBe(0);
    expect(progress.contributions.length).toBe(2);

    const checkinList = await listCheckins(goal.id, supervisor.id, {
      prisma: prisma as unknown as CheckinPrismaClient,
    });
    expect(checkinList.total).toBe(3);

    const durationLimit = await getDurationLimit(group.id, "跑步", supervisor.id, {
      prisma: prisma as unknown as GoalPrismaClient,
    });
    const challengerALimit = durationLimit.challengerLimits.find((item) => item.userId === challengerA.id);
    const challengerBLimit = durationLimit.challengerLimits.find((item) => item.userId === challengerB.id);
    expect(challengerALimit?.completionCount).toBe(1);
    expect(challengerALimit?.maxAllowedMonths).toBe(2);
    expect(challengerBLimit?.completionCount).toBe(0);
    expect(challengerBLimit?.maxAllowedMonths).toBe(1);
  });

  it("有待审核打卡时不允许确认结算", async () => {
    if (!prisma) throw new Error("Prisma not initialized");

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-31T12:00:00.000Z"));

    const suffix = shortId();
    const [supervisor, challenger] = await Promise.all([
      createUser(prisma, "sup_pending_" + suffix),
      createUser(prisma, "cha_pending_" + suffix),
    ]);

    const group = await createGroup(
      { name: "US11待审核小组", role: "SUPERVISOR", timezone: "Asia/Shanghai" },
      supervisor.id,
      { prisma: prisma as unknown as GroupPrismaClient }
    );
    const [inviteCode] = group.inviteCodes;
    await joinGroup({ inviteCode: inviteCode!, role: "CHALLENGER" }, challenger.id, {
      prisma: prisma as unknown as GroupPrismaClient,
    });

    const goal = await createGoal(
      {
        groupId: group.id,
        name: "阅读目标",
        category: "阅读",
        targetValue: 5,
        unit: "次",
        startDate: "2026-02-01",
        endDate: "2026-02-05",
        rewardPunishment: "未完成请复盘",
        evidenceRequirement: "截图",
      },
      supervisor.id,
      { prisma: prisma as unknown as GoalPrismaClient }
    );
    await confirmGoal(goal.id, challenger.id, "APPROVED", { prisma: prisma as unknown as GoalPrismaClient });

    const activateTime = new Date("2026-01-31T16:00:00.000Z");
    vi.setSystemTime(activateTime);
    await runGoalStatusSchedulerTick({ prisma, now: () => activateTime });

    vi.setSystemTime(new Date("2026-02-04T08:00:00.000Z"));
    await createCheckin(
      { goalId: goal.id, checkinDate: "2026-02-04", value: 3, note: "仍待审核" },
      [{ filePath: "/uploads/checkins/us11-pending.jpg", fileSize: 1024 }],
      challenger.id,
      { prisma: prisma as unknown as CheckinPrismaClient }
    );

    const settleTime = new Date("2026-02-05T16:00:00.000Z");
    vi.setSystemTime(settleTime);
    await runGoalStatusSchedulerTick({ prisma, now: () => settleTime });

    await expectAppError(
      confirmSettlement(goal.id, supervisor.id, {
        prisma: prisma as unknown as SettlementPrismaClient,
      }),
      { statusCode: 400, message: "仍有待审核的打卡记录，请先完成审核" }
    );
  });
});
