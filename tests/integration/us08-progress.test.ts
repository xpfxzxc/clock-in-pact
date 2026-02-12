import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

import { createGroup, joinGroup, type GroupPrismaClient } from "../../server/services/group.service";
import { confirmGoal, createGoal, type GoalPrismaClient } from "../../server/services/goal.service";
import { createCheckin, reviewCheckin, type CheckinPrismaClient } from "../../server/services/checkin.service";
import { getProgress, type ProgressPrismaClient } from "../../server/services/progress.service";
import { runGoalStatusSchedulerTick } from "../../server/services/scheduler.service";

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

const describeIntegration = process.env.INTEGRATION_TEST === "1" ? describe : describe.skip;

type ActiveGoalFixture = {
  goalId: number;
  supervisorId: number;
  challengerAId: number;
  challengerBId: number;
};

describeIntegration("integration US-08 进度查看", () => {
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

  async function setupActiveGoal(): Promise<ActiveGoalFixture> {
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
      {
        name: "US08小组",
        role: "SUPERVISOR",
        timezone: "Asia/Shanghai",
      },
      supervisor.id,
      {
        prisma: prisma as unknown as GroupPrismaClient,
      }
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
        name: "跑步挑战",
        category: "运动",
        targetValue: 60,
        unit: "km",
        startDate: "2026-02-01",
        endDate: "2026-02-20",
        rewardPunishment: "失败者请成功者吃饭",
        evidenceRequirement: "跑步 APP 截图",
      },
      supervisor.id,
      { prisma: prisma as unknown as GoalPrismaClient }
    );

    await confirmGoal(goal.id, challengerA.id, "APPROVED", {
      prisma: prisma as unknown as GoalPrismaClient,
    });
    await confirmGoal(goal.id, challengerB.id, "APPROVED", {
      prisma: prisma as unknown as GoalPrismaClient,
    });

    const activateTime = new Date("2026-02-07T00:00:00.000Z");
    vi.setSystemTime(activateTime);
    await runGoalStatusSchedulerTick({
      prisma: prisma as unknown as GoalPrismaClient,
      now: () => activateTime,
    });

    return {
      goalId: goal.id,
      supervisorId: supervisor.id,
      challengerAId: challengerA.id,
      challengerBId: challengerB.id,
    };
  }

  it("按 US-08 验收标准返回挑战者与监督者进度数据", async () => {
    if (!prisma) throw new Error("Prisma not initialized");

    const { goalId, supervisorId, challengerAId, challengerBId } = await setupActiveGoal();

    vi.setSystemTime(new Date("2026-02-07T09:00:00.000Z"));
    await createCheckin(
      {
        goalId,
        checkinDate: "2026-02-07",
        value: 50,
        note: "A-自动通过候选",
      },
      [{ filePath: "/uploads/checkins/us08-a-auto.jpg", fileSize: 1024 }],
      challengerAId,
      { prisma: prisma as unknown as CheckinPrismaClient }
    );

    vi.setSystemTime(new Date("2026-02-09T10:00:00.000Z"));
    const bConfirmed = await createCheckin(
      {
        goalId,
        checkinDate: "2026-02-09",
        value: 40,
        note: "B-已确认",
      },
      [{ filePath: "/uploads/checkins/us08-b-confirmed.jpg", fileSize: 1024 }],
      challengerBId,
      { prisma: prisma as unknown as CheckinPrismaClient }
    );
    await reviewCheckin(bConfirmed.id, { action: "CONFIRMED" }, supervisorId, {
      prisma: prisma as unknown as CheckinPrismaClient,
    });

    vi.setSystemTime(new Date("2026-02-10T10:00:00.000Z"));
    const aConfirmed = await createCheckin(
      {
        goalId,
        checkinDate: "2026-02-10",
        value: 30,
        note: "A-已确认",
      },
      [{ filePath: "/uploads/checkins/us08-a-confirmed.jpg", fileSize: 1024 }],
      challengerAId,
      { prisma: prisma as unknown as CheckinPrismaClient }
    );
    await reviewCheckin(aConfirmed.id, { action: "CONFIRMED" }, supervisorId, {
      prisma: prisma as unknown as CheckinPrismaClient,
    });

    vi.setSystemTime(new Date("2026-02-10T12:00:00.000Z"));
    await createCheckin(
      {
        goalId,
        checkinDate: "2026-02-10",
        value: 5,
        note: "A-待审核",
      },
      [{ filePath: "/uploads/checkins/us08-a-pending.jpg", fileSize: 1024 }],
      challengerAId,
      { prisma: prisma as unknown as CheckinPrismaClient }
    );

    vi.setSystemTime(new Date("2026-02-10T13:00:00.000Z"));
    await createCheckin(
      {
        goalId,
        checkinDate: "2026-02-10",
        value: 10,
        note: "B-待审核",
      },
      [{ filePath: "/uploads/checkins/us08-b-pending.jpg", fileSize: 1024 }],
      challengerBId,
      { prisma: prisma as unknown as CheckinPrismaClient }
    );

    vi.setSystemTime(new Date("2026-02-11T10:00:00.000Z"));
    const aDisputed = await createCheckin(
      {
        goalId,
        checkinDate: "2026-02-11",
        value: 3,
        note: "A-质疑",
      },
      [{ filePath: "/uploads/checkins/us08-a-disputed.jpg", fileSize: 1024 }],
      challengerAId,
      { prisma: prisma as unknown as CheckinPrismaClient }
    );
    await reviewCheckin(
      aDisputed.id,
      { action: "DISPUTED", reason: "证据不清晰" },
      supervisorId,
      {
        prisma: prisma as unknown as CheckinPrismaClient,
      }
    );

    const schedulerNow = new Date("2026-02-11T12:00:01.000Z");
    vi.setSystemTime(schedulerNow);
    await runGoalStatusSchedulerTick({
      prisma: prisma as unknown as GoalPrismaClient,
      now: () => schedulerNow,
    });

    const challengerProgress = await getProgress(goalId, challengerAId, {
      prisma: prisma as unknown as ProgressPrismaClient,
    });

    expect(challengerProgress.myRole).toBe("CHALLENGER");
    expect(challengerProgress.myProgress).not.toBeNull();
    expect(challengerProgress.myProgress?.completedValue).toBe(80);
    expect(challengerProgress.myProgress?.percentage).toBeCloseTo(133.333333, 4);
    expect(challengerProgress.myProgress?.remainingValue).toBe(0);
    expect(challengerProgress.myProgress?.pendingReviewCount).toBe(1);
    expect(challengerProgress.myProgress?.disputedCount).toBe(1);

    expect(challengerProgress.totalPendingReviewCount).toBe(2);
    expect(challengerProgress.totalDisputedCount).toBe(1);

    expect(challengerProgress.leaderboard).toHaveLength(2);
    expect(challengerProgress.leaderboard[0]?.userId).toBe(challengerAId);
    expect(challengerProgress.leaderboard[0]?.completedValue).toBe(80);
    expect(challengerProgress.leaderboard[0]?.percentage).toBeCloseTo(133.333333, 4);
    expect(challengerProgress.leaderboard[1]?.userId).toBe(challengerBId);
    expect(challengerProgress.leaderboard[1]?.completedValue).toBe(40);
    expect(challengerProgress.leaderboard[1]?.percentage).toBeCloseTo(66.666666, 4);

    const aContribution = challengerProgress.contributions.find((item) => item.userId === challengerAId);
    const bContribution = challengerProgress.contributions.find((item) => item.userId === challengerBId);

    expect(aContribution?.days.find((day) => day.date === "2026-02-07")).toEqual({
      date: "2026-02-07",
      confirmedValue: 50,
      pendingValue: 0,
      disputedValue: 0,
    });
    expect(aContribution?.days.find((day) => day.date === "2026-02-10")).toEqual({
      date: "2026-02-10",
      confirmedValue: 30,
      pendingValue: 5,
      disputedValue: 0,
    });
    expect(aContribution?.days.find((day) => day.date === "2026-02-11")).toEqual({
      date: "2026-02-11",
      confirmedValue: 0,
      pendingValue: 0,
      disputedValue: 3,
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

    const supervisorProgress = await getProgress(goalId, supervisorId, {
      prisma: prisma as unknown as ProgressPrismaClient,
    });

    expect(supervisorProgress.myRole).toBe("SUPERVISOR");
    expect(supervisorProgress.myProgress).toBeNull();
    expect(supervisorProgress.totalPendingReviewCount).toBe(2);
    expect(supervisorProgress.totalDisputedCount).toBe(1);
  });
});
