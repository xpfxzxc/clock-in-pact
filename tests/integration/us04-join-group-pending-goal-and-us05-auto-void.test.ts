import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

import { createGroup, joinGroup, type GroupPrismaClient } from "../../server/services/group.service";
import { createGoal, listGroupGoals, type GoalPrismaClient } from "../../server/services/goal.service";
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

const describeIntegration = process.env.INTEGRATION_TEST === "1" ? describe : describe.skip;

describeIntegration("integration US-04 场景4 & US-05 场景5", () => {
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

  it("PENDING 目标存在时：任意角色加入→自动获得确认；到达开始日期 00:00:00（小组时区）→ 目标自动作废", async () => {
    if (!prisma) throw new Error("Prisma not initialized");

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-05T12:00:00.000Z"));

    const suffix = randomBytes(6).toString("hex");
    try {
      const [creator, existingChallenger, newChallenger, newSupervisor] = await Promise.all([
        prisma.user.create({ data: { username: `u1_${suffix}`, nickname: `u1_${suffix}`, password: "pw" } }),
        prisma.user.create({ data: { username: `u2_${suffix}`, nickname: `u2_${suffix}`, password: "pw" } }),
        prisma.user.create({ data: { username: `u3_${suffix}`, nickname: `u3_${suffix}`, password: "pw" } }),
        prisma.user.create({ data: { username: `u4_${suffix}`, nickname: `u4_${suffix}`, password: "pw" } }),
      ]);

      const group = await createGroup({ name: "IT小组", role: "SUPERVISOR" }, creator.id, {
        prisma: prisma as unknown as GroupPrismaClient,
      });
      expect(group.inviteCodes.length).toBeGreaterThanOrEqual(3);

      const [code1, code2, code3] = group.inviteCodes;

      await joinGroup({ inviteCode: code1, role: "CHALLENGER" }, existingChallenger.id, {
        prisma: prisma as unknown as GroupPrismaClient,
      });

      const goal = await createGoal(
        {
          groupId: group.id,
          name: "跑步挑战",
          category: "跑步",
          targetValue: 60,
          unit: "km",
          startDate: "2026-02-06",
          endDate: "2026-02-28",
          rewardPunishment: "失败者请成功者吃饭",
          evidenceRequirement: "跑步APP截图",
        },
        creator.id,
        { prisma: prisma as unknown as GoalPrismaClient }
      );

      const dbGoal = await prisma.goal.findUnique({ where: { id: goal.id }, select: { status: true } });
      expect(dbGoal?.status).toBe("PENDING");

      await joinGroup({ inviteCode: code2, role: "CHALLENGER" }, newChallenger.id, {
        prisma: prisma as unknown as GroupPrismaClient,
      });
      await joinGroup({ inviteCode: code3, role: "SUPERVISOR" }, newSupervisor.id, {
        prisma: prisma as unknown as GroupPrismaClient,
      });

      const [newChallengerMember, newSupervisorMember] = await Promise.all([
        prisma.groupMember.findUnique({
          where: { groupId_userId: { groupId: group.id, userId: newChallenger.id } },
          select: { id: true },
        }),
        prisma.groupMember.findUnique({
          where: { groupId_userId: { groupId: group.id, userId: newSupervisor.id } },
          select: { id: true },
        }),
      ]);
      expect(newChallengerMember).not.toBeNull();
      expect(newSupervisorMember).not.toBeNull();

      const [challengerConfirmation, supervisorConfirmation] = await Promise.all([
        prisma.goalConfirmation.findUnique({
          where: { goalId_memberId: { goalId: goal.id, memberId: newChallengerMember!.id } },
          select: { status: true },
        }),
        prisma.goalConfirmation.findUnique({
          where: { goalId_memberId: { goalId: goal.id, memberId: newSupervisorMember!.id } },
          select: { status: true },
        }),
      ]);
      expect(challengerConfirmation?.status).toBe("PENDING");
      expect(supervisorConfirmation?.status).toBe("PENDING");

      // US-05 场景5: 到达开始日期 00:00:00（小组时区）且仍有成员未同意 → 目标自动作废
      vi.setSystemTime(new Date("2026-02-05T16:00:00.000Z")); // Asia/Shanghai = 2026-02-06 00:00:00
      await runGoalStatusSchedulerTick({ prisma, logger: { error: () => {} } });
      const goalsAfterMidnight = await listGroupGoals(group.id, creator.id, {
        prisma: prisma as unknown as GoalPrismaClient,
      });
      const goalAfterMidnight = goalsAfterMidnight.find((g) => g.id === goal.id);
      expect(goalAfterMidnight?.status).toBe("VOIDED");
    } finally {
      vi.useRealTimers();
    }
  });
});
