import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

import { createGroup, joinGroup, type GroupPrismaClient } from "../../server/services/group.service";
import { confirmGoal, createGoal, listGroupGoals, type GoalPrismaClient } from "../../server/services/goal.service";
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

describeIntegration("integration US-04 场景5：加入时有待开始/进行中目标（挑战者）自动参与", () => {
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

  it("ACTIVE 目标存在时：挑战者加入→自动写入参与；监督者加入→不写入参与", async () => {
    if (!prisma) throw new Error("Prisma not initialized");

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-05T12:00:00.000Z"));

    const suffix = randomBytes(6).toString("hex");
    try {
      const [supervisor, challenger1, challenger2, supervisor2] = await Promise.all([
        prisma.user.create({ data: { username: `u1_${suffix}`, nickname: `u1_${suffix}`, password: "pw" } }),
        prisma.user.create({ data: { username: `u2_${suffix}`, nickname: `u2_${suffix}`, password: "pw" } }),
        prisma.user.create({ data: { username: `u3_${suffix}`, nickname: `u3_${suffix}`, password: "pw" } }),
        prisma.user.create({ data: { username: `u4_${suffix}`, nickname: `u4_${suffix}`, password: "pw" } }),
      ]);

      const group = await createGroup(
        { name: "IT小组", role: "SUPERVISOR" },
        supervisor.id,
        { prisma: prisma as unknown as GroupPrismaClient }
      );

      expect(group.inviteCodes.length).toBeGreaterThanOrEqual(3);

      const [code1, code2, code3] = group.inviteCodes;

      await joinGroup(
        { inviteCode: code1, role: "CHALLENGER" },
        challenger1.id,
        { prisma: prisma as unknown as GroupPrismaClient }
      );

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
        supervisor.id,
        { prisma: prisma as unknown as GoalPrismaClient }
      );

      const confirmResult = await confirmGoal(goal.id, challenger1.id, "APPROVED", {
        prisma: prisma as unknown as GoalPrismaClient,
      });
      expect(confirmResult.goalStatus).toBe("UPCOMING");

      expect(await prisma.goalParticipant.count({ where: { goalId: goal.id } })).toBe(1);

      // US-05 场景3: 到达开始日期 00:00:00（小组时区）→ 目标自动变为 ACTIVE
      vi.setSystemTime(new Date("2026-02-05T16:00:00.000Z")); // Asia/Shanghai = 2026-02-06 00:00:00
      await runGoalStatusSchedulerTick({ prisma, logger: { error: () => {} } });
      const goalsAfterMidnight = await listGroupGoals(group.id, supervisor.id, {
        prisma: prisma as unknown as GoalPrismaClient,
      });
      expect(goalsAfterMidnight[0]?.status).toBe("ACTIVE");

      // US-04 场景4: 加入时有进行中目标（挑战者）→ 自动参与当前目标
      await joinGroup(
        { inviteCode: code2, role: "CHALLENGER" },
        challenger2.id,
        { prisma: prisma as unknown as GroupPrismaClient }
      );

      const challenger2Member = await prisma.groupMember.findUnique({
        where: { groupId_userId: { groupId: group.id, userId: challenger2.id } },
        select: { id: true },
      });
      expect(challenger2Member).not.toBeNull();

      const challenger2Participant = await prisma.goalParticipant.findUnique({
        where: { goalId_memberId: { goalId: goal.id, memberId: challenger2Member!.id } },
        select: { id: true },
      });
      expect(challenger2Participant).not.toBeNull();
      expect(await prisma.goalParticipant.count({ where: { goalId: goal.id } })).toBe(2);

      // 监督者加入时不应自动参与目标
      await joinGroup(
        { inviteCode: code3, role: "SUPERVISOR" },
        supervisor2.id,
        { prisma: prisma as unknown as GroupPrismaClient }
      );

      const supervisor2Member = await prisma.groupMember.findUnique({
        where: { groupId_userId: { groupId: group.id, userId: supervisor2.id } },
        select: { id: true },
      });
      expect(supervisor2Member).not.toBeNull();

      const supervisor2Participant = await prisma.goalParticipant.findUnique({
        where: { goalId_memberId: { goalId: goal.id, memberId: supervisor2Member!.id } },
        select: { id: true },
      });
      expect(supervisor2Participant).toBeNull();
      expect(await prisma.goalParticipant.count({ where: { goalId: goal.id } })).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
