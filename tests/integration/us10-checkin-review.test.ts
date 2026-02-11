import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

import { createGroup, joinGroup, type GroupPrismaClient } from "../../server/services/group.service";
import { confirmGoal, createGoal, type GoalPrismaClient } from "../../server/services/goal.service";
import { createCheckin, listCheckins, reviewCheckin, type CheckinPrismaClient } from "../../server/services/checkin.service";
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

type ActiveGoalSetup = {
  goalId: number;
  challengerId: number;
  supervisor1Id: number;
  supervisor2Id?: number;
};

describeIntegration("integration US-10 监督者审核打卡", () => {
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

  async function setupActiveGoal(currentTimeIso: string, withSecondSupervisor: boolean): Promise<ActiveGoalSetup> {
    if (!prisma) throw new Error("Prisma not initialized");

    const createTime = new Date("2026-02-08T12:00:00.000Z");
    const currentTime = new Date(currentTimeIso);
    vi.useFakeTimers();
    vi.setSystemTime(createTime);

    const suffix = shortId();
    const [supervisor1, challenger] = await Promise.all([
      createUser(prisma, "sup1_" + suffix),
      createUser(prisma, "cha_" + suffix),
    ]);
    const supervisor2 = withSecondSupervisor ? await createUser(prisma, "sup2_" + suffix) : null;

    const group = await createGroup({ name: "US10小组", role: "SUPERVISOR" }, supervisor1.id, {
      prisma: prisma as unknown as GroupPrismaClient,
    });

    const [inviteCode1, inviteCode2] = group.inviteCodes;

    await joinGroup({ inviteCode: inviteCode1!, role: "CHALLENGER" }, challenger.id, {
      prisma: prisma as unknown as GroupPrismaClient,
    });

    if (supervisor2) {
      await joinGroup({ inviteCode: inviteCode2!, role: "SUPERVISOR" }, supervisor2.id, {
        prisma: prisma as unknown as GroupPrismaClient,
      });
    }

    const goal = await createGoal(
      {
        groupId: group.id,
        name: "跑步挑战",
        category: "跑步",
        targetValue: 50,
        unit: "km",
        startDate: "2026-02-09",
        endDate: "2026-02-28",
        rewardPunishment: "失败者请成功者吃饭",
        evidenceRequirement: "跑步 APP 截图",
      },
      supervisor1.id,
      { prisma: prisma as unknown as GoalPrismaClient }
    );

    await confirmGoal(goal.id, challenger.id, "APPROVED", {
      prisma: prisma as unknown as GoalPrismaClient,
    });

    if (supervisor2) {
      await confirmGoal(goal.id, supervisor2.id, "APPROVED", {
        prisma: prisma as unknown as GoalPrismaClient,
      });
    }

    vi.setSystemTime(currentTime);

    await runGoalStatusSchedulerTick({
      prisma: prisma as unknown as GoalPrismaClient,
      now: () => currentTime,
    });

    return {
      goalId: goal.id,
      challengerId: challenger.id,
      supervisor1Id: supervisor1.id,
      supervisor2Id: supervisor2?.id,
    };
  }

  it("场景1: 所有监督者确认后，打卡状态变为 CONFIRMED", async () => {
    if (!prisma) throw new Error("Prisma not initialized");

    const { goalId, challengerId, supervisor1Id, supervisor2Id } = await setupActiveGoal(
      "2026-02-10T12:00:00.000Z",
      true
    );

    const created = await createCheckin(
      {
        goalId,
        checkinDate: "2026-02-10",
        value: 5,
        note: "US10-确认场景",
      },
      [{ filePath: "/uploads/checkins/us10-confirm.jpg", fileSize: 1024 }],
      challengerId,
      { prisma: prisma as unknown as CheckinPrismaClient }
    );

    const firstReview = await reviewCheckin(created.id, { action: "CONFIRMED" }, supervisor1Id, {
      prisma: prisma as unknown as CheckinPrismaClient,
    });
    expect(firstReview.checkinStatus).toBe("PENDING_REVIEW");

    const secondReview = await reviewCheckin(created.id, { action: "CONFIRMED" }, supervisor2Id!, {
      prisma: prisma as unknown as CheckinPrismaClient,
    });
    expect(secondReview.checkinStatus).toBe("CONFIRMED");

    const checkins = await listCheckins(goalId, challengerId, {
      prisma: prisma as unknown as CheckinPrismaClient,
    });
    expect(checkins.checkins[0]?.status).toBe("CONFIRMED");
  });

  it("场景2: 任一监督者质疑后，打卡状态变为 DISPUTED 且挑战者可见理由", async () => {
    if (!prisma) throw new Error("Prisma not initialized");

    const { goalId, challengerId, supervisor1Id } = await setupActiveGoal("2026-02-10T12:00:00.000Z", true);

    const created = await createCheckin(
      {
        goalId,
        checkinDate: "2026-02-10",
        value: 6,
        note: "US10-质疑场景",
      },
      [{ filePath: "/uploads/checkins/us10-dispute.jpg", fileSize: 2048 }],
      challengerId,
      { prisma: prisma as unknown as CheckinPrismaClient }
    );

    const disputeReason = "证据不清晰，无法确认完成量";
    const reviewResult = await reviewCheckin(
      created.id,
      { action: "DISPUTED", reason: disputeReason },
      supervisor1Id,
      { prisma: prisma as unknown as CheckinPrismaClient }
    );

    expect(reviewResult.checkinStatus).toBe("DISPUTED");

    const checkins = await listCheckins(goalId, challengerId, {
      prisma: prisma as unknown as CheckinPrismaClient,
    });

    expect(checkins.checkins[0]?.status).toBe("DISPUTED");
    expect(checkins.checkins[0]?.reviews[0]?.reason).toBe(disputeReason);
  });

  it("场景3: 超过3天未审核时自动通过", async () => {
    if (!prisma) throw new Error("Prisma not initialized");

    const { goalId, challengerId } = await setupActiveGoal("2026-02-10T12:00:00.000Z", false);

    const created = await createCheckin(
      {
        goalId,
        checkinDate: "2026-02-10",
        value: 3,
        note: "US10-自动通过场景",
      },
      [{ filePath: "/uploads/checkins/us10-auto-approved.jpg", fileSize: 1024 }],
      challengerId,
      { prisma: prisma as unknown as CheckinPrismaClient }
    );

    const checkinRecord = await prisma.checkin.findUnique({
      where: { id: created.id },
      select: { createdAt: true },
    });
    if (!checkinRecord) throw new Error("Checkin not found after create");

    const schedulerNow = new Date(checkinRecord.createdAt.getTime() + 3 * 24 * 60 * 60 * 1000 + 1000);

    await runGoalStatusSchedulerTick({
      prisma: prisma as unknown as GoalPrismaClient,
      now: () => schedulerNow,
    });

    const checkins = await listCheckins(goalId, challengerId, {
      prisma: prisma as unknown as CheckinPrismaClient,
    });

    expect(checkins.checkins[0]?.status).toBe("AUTO_APPROVED");
  });
});
