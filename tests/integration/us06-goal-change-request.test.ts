import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

import { AppError } from "../../server/utils/app-error";
import { createGroup, joinGroup, type GroupPrismaClient } from "../../server/services/group.service";
import { confirmGoal, createGoal, type GoalPrismaClient } from "../../server/services/goal.service";
import {
  createGoalChangeRequest,
  voteGoalChangeRequest,
  type GoalChangeRequestPrismaClient,
} from "../../server/services/goal-change-request.service";
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

const describeIntegration = process.env.INTEGRATION_TEST === "1" ? describe : describe.skip;

describeIntegration("integration US-06 目标修改/取消请求", () => {
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

  it("场景1+6：成功修改（全员24h内同意）且发起人自动同意", async () => {
    if (!prisma) throw new Error("Prisma not initialized");

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-05T12:00:00.000Z"));

    const suffix = randomBytes(6).toString("hex");
    try {
      const [creator, challenger, supervisor] = await Promise.all([
        createUser(prisma, `u1_${suffix}`),
        createUser(prisma, `u2_${suffix}`),
        createUser(prisma, `u3_${suffix}`),
      ]);

      const group = await createGroup({ name: "US06小组", role: "SUPERVISOR" }, creator.id, {
        prisma: prisma as unknown as GroupPrismaClient,
      });
      const [code1, code2] = group.inviteCodes;

      await joinGroup({ inviteCode: code1, role: "CHALLENGER" }, challenger.id, {
        prisma: prisma as unknown as GroupPrismaClient,
      });
      await joinGroup({ inviteCode: code2, role: "SUPERVISOR" }, supervisor.id, {
        prisma: prisma as unknown as GroupPrismaClient,
      });

      const goal = await createGoal(
        {
          groupId: group.id,
          name: "跑步挑战",
          category: "跑步",
          targetValue: 60,
          unit: "km",
          startDate: "2026-02-10",
          endDate: "2026-03-09",
          rewardPunishment: "失败者请成功者吃饭",
          evidenceRequirement: "跑步APP截图",
        },
        creator.id,
        { prisma: prisma as unknown as GoalPrismaClient }
      );

      await confirmGoal(goal.id, challenger.id, "APPROVED", { prisma: prisma as unknown as GoalPrismaClient });
      const confirmResult = await confirmGoal(goal.id, supervisor.id, "APPROVED", {
        prisma: prisma as unknown as GoalPrismaClient,
      });
      expect(confirmResult.goalStatus).toBe("UPCOMING");

      const request = await createGoalChangeRequest(
        {
          goalId: goal.id,
          type: "MODIFY",
          proposedChanges: {
            name: "跑步挑战-更新版",
            endDate: "2026-03-08",
          },
        },
        creator.id,
        { prisma: prisma as unknown as GoalChangeRequestPrismaClient }
      );

      expect(request.myVoteStatus).toBe("APPROVED");

      await voteGoalChangeRequest(request.id, challenger.id, "APPROVED", {
        prisma: prisma as unknown as GoalChangeRequestPrismaClient,
      });
      const voteResult = await voteGoalChangeRequest(request.id, supervisor.id, "APPROVED", {
        prisma: prisma as unknown as GoalChangeRequestPrismaClient,
      });

      expect(voteResult.requestStatus).toBe("APPROVED");

      const goalAfterApprove = await prisma.goal.findUnique({
        where: { id: goal.id },
        select: { name: true, endDate: true, status: true },
      });
      expect(goalAfterApprove?.name).toBe("跑步挑战-更新版");
      expect(goalAfterApprove?.endDate.toISOString().slice(0, 10)).toBe("2026-03-08");
      expect(goalAfterApprove?.status).toBe("PENDING");
    } finally {
      vi.useRealTimers();
    }
  });

  it("场景2+4：修改被拒绝；已有待确认请求时不可再次发起", async () => {
    if (!prisma) throw new Error("Prisma not initialized");

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-05T12:00:00.000Z"));

    const suffix = randomBytes(6).toString("hex");
    try {
      const [creator, challenger] = await Promise.all([
        createUser(prisma, `u1_${suffix}`),
        createUser(prisma, `u2_${suffix}`),
      ]);

      const group = await createGroup({ name: "US06小组", role: "SUPERVISOR" }, creator.id, {
        prisma: prisma as unknown as GroupPrismaClient,
      });
      const [code1] = group.inviteCodes;

      await joinGroup({ inviteCode: code1, role: "CHALLENGER" }, challenger.id, {
        prisma: prisma as unknown as GroupPrismaClient,
      });

      const goal = await createGoal(
        {
          groupId: group.id,
          name: "跑步挑战",
          category: "跑步",
          targetValue: 30,
          unit: "km",
          startDate: "2026-02-10",
          endDate: "2026-02-28",
          rewardPunishment: "失败者请成功者吃饭",
          evidenceRequirement: "跑步APP截图",
        },
        creator.id,
        { prisma: prisma as unknown as GoalPrismaClient }
      );

      const request = await createGoalChangeRequest(
        {
          goalId: goal.id,
          type: "MODIFY",
          proposedChanges: { name: "跑步挑战-改名" },
        },
        creator.id,
        { prisma: prisma as unknown as GoalChangeRequestPrismaClient }
      );

      await expectAppError(
        createGoalChangeRequest(
          {
            goalId: goal.id,
            type: "CANCEL",
          },
          challenger.id,
          { prisma: prisma as unknown as GoalChangeRequestPrismaClient }
        ),
        {
          statusCode: 400,
          message: "当前已有待确认的修改/取消请求，请等待结果后再操作",
        }
      );

      const voteResult = await voteGoalChangeRequest(request.id, challenger.id, "REJECTED", {
        prisma: prisma as unknown as GoalChangeRequestPrismaClient,
      });
      expect(voteResult.requestStatus).toBe("REJECTED");

      const requestAfterRejected = await prisma.goalChangeRequest.findUnique({
        where: { id: request.id },
        select: { status: true },
      });
      expect(requestAfterRejected?.status).toBe("REJECTED");
    } finally {
      vi.useRealTimers();
    }
  });

  it("场景3：成功取消（全员同意后目标状态为 CANCELLED）", async () => {
    if (!prisma) throw new Error("Prisma not initialized");

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-05T12:00:00.000Z"));

    const suffix = randomBytes(6).toString("hex");
    try {
      const [creator, challenger] = await Promise.all([
        createUser(prisma, `u1_${suffix}`),
        createUser(prisma, `u2_${suffix}`),
      ]);

      const group = await createGroup({ name: "US06小组", role: "SUPERVISOR" }, creator.id, {
        prisma: prisma as unknown as GroupPrismaClient,
      });
      const [code1] = group.inviteCodes;

      await joinGroup({ inviteCode: code1, role: "CHALLENGER" }, challenger.id, {
        prisma: prisma as unknown as GroupPrismaClient,
      });

      const goal = await createGoal(
        {
          groupId: group.id,
          name: "跑步挑战",
          category: "跑步",
          targetValue: 30,
          unit: "km",
          startDate: "2026-02-10",
          endDate: "2026-02-28",
          rewardPunishment: "失败者请成功者吃饭",
          evidenceRequirement: "跑步APP截图",
        },
        creator.id,
        { prisma: prisma as unknown as GoalPrismaClient }
      );

      const request = await createGoalChangeRequest(
        {
          goalId: goal.id,
          type: "CANCEL",
        },
        creator.id,
        { prisma: prisma as unknown as GoalChangeRequestPrismaClient }
      );

      const voteResult = await voteGoalChangeRequest(request.id, challenger.id, "APPROVED", {
        prisma: prisma as unknown as GoalChangeRequestPrismaClient,
      });
      expect(voteResult.requestStatus).toBe("APPROVED");

      const goalAfterCancel = await prisma.goal.findUnique({
        where: { id: goal.id },
        select: { status: true },
      });
      expect(goalAfterCancel?.status).toBe("CANCELLED");
    } finally {
      vi.useRealTimers();
    }
  });

  it("场景5：请求确认期间新成员加入，需要参与投票", async () => {
    if (!prisma) throw new Error("Prisma not initialized");

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-05T12:00:00.000Z"));

    const suffix = randomBytes(6).toString("hex");
    try {
      const [creator, challenger, newcomer] = await Promise.all([
        createUser(prisma, `u1_${suffix}`),
        createUser(prisma, `u2_${suffix}`),
        createUser(prisma, `u3_${suffix}`),
      ]);

      const group = await createGroup({ name: "US06小组", role: "SUPERVISOR" }, creator.id, {
        prisma: prisma as unknown as GroupPrismaClient,
      });
      const [code1, code2] = group.inviteCodes;

      await joinGroup({ inviteCode: code1, role: "CHALLENGER" }, challenger.id, {
        prisma: prisma as unknown as GroupPrismaClient,
      });

      const goal = await createGoal(
        {
          groupId: group.id,
          name: "跑步挑战",
          category: "跑步",
          targetValue: 30,
          unit: "km",
          startDate: "2026-02-10",
          endDate: "2026-02-28",
          rewardPunishment: "失败者请成功者吃饭",
          evidenceRequirement: "跑步APP截图",
        },
        creator.id,
        { prisma: prisma as unknown as GoalPrismaClient }
      );

      const request = await createGoalChangeRequest(
        {
          goalId: goal.id,
          type: "MODIFY",
          proposedChanges: { name: "跑步挑战-新增成员后" },
        },
        creator.id,
        { prisma: prisma as unknown as GoalChangeRequestPrismaClient }
      );

      await joinGroup({ inviteCode: code2, role: "SUPERVISOR" }, newcomer.id, {
        prisma: prisma as unknown as GroupPrismaClient,
      });

      const newcomerMember = await prisma.groupMember.findUnique({
        where: { groupId_userId: { groupId: group.id, userId: newcomer.id } },
        select: { id: true },
      });
      expect(newcomerMember).not.toBeNull();

      const newcomerVote = await prisma.goalChangeVote.findUnique({
        where: {
          requestId_memberId: {
            requestId: request.id,
            memberId: newcomerMember!.id,
          },
        },
        select: { status: true },
      });
      expect(newcomerVote?.status).toBe("PENDING");

      const firstVoteResult = await voteGoalChangeRequest(request.id, challenger.id, "APPROVED", {
        prisma: prisma as unknown as GoalChangeRequestPrismaClient,
      });
      expect(firstVoteResult.requestStatus).toBe("PENDING");

      const secondVoteResult = await voteGoalChangeRequest(request.id, newcomer.id, "APPROVED", {
        prisma: prisma as unknown as GoalChangeRequestPrismaClient,
      });
      expect(secondVoteResult.requestStatus).toBe("APPROVED");
    } finally {
      vi.useRealTimers();
    }
  });

  it("场景7+8：状态流转导致请求作废（PENDING→VOIDED；UPCOMING→ACTIVE 且含 startDate 修改）", async () => {
    if (!prisma) throw new Error("Prisma not initialized");

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-05T12:00:00.000Z"));

    const suffix = randomBytes(6).toString("hex");
    try {
      const [creatorA, challengerA, creatorB, challengerB] = await Promise.all([
        createUser(prisma, `u1_${suffix}`),
        createUser(prisma, `u2_${suffix}`),
        createUser(prisma, `u3_${suffix}`),
        createUser(prisma, `u4_${suffix}`),
      ]);

      // 子场景A：PENDING 目标到达开始日自动 VOIDED，请求也 VOIDED
      const groupA = await createGroup({ name: "US06小组A", role: "SUPERVISOR" }, creatorA.id, {
        prisma: prisma as unknown as GroupPrismaClient,
      });
      const [groupACode] = groupA.inviteCodes;
      await joinGroup({ inviteCode: groupACode, role: "CHALLENGER" }, challengerA.id, {
        prisma: prisma as unknown as GroupPrismaClient,
      });

      const pendingGoal = await createGoal(
        {
          groupId: groupA.id,
          name: "待确认目标",
          category: "跑步",
          targetValue: 20,
          unit: "km",
          startDate: "2026-02-06",
          endDate: "2026-03-05",
          rewardPunishment: "失败请客",
          evidenceRequirement: "截图",
        },
        creatorA.id,
        { prisma: prisma as unknown as GoalPrismaClient }
      );

      const pendingGoalRequest = await createGoalChangeRequest(
        {
          goalId: pendingGoal.id,
          type: "CANCEL",
        },
        creatorA.id,
        { prisma: prisma as unknown as GoalChangeRequestPrismaClient }
      );

      // 子场景B：UPCOMING→ACTIVE 时，含 startDate 修改的请求自动 VOIDED
      const groupB = await createGroup({ name: "US06小组B", role: "SUPERVISOR" }, creatorB.id, {
        prisma: prisma as unknown as GroupPrismaClient,
      });
      const [groupBCode] = groupB.inviteCodes;
      await joinGroup({ inviteCode: groupBCode, role: "CHALLENGER" }, challengerB.id, {
        prisma: prisma as unknown as GroupPrismaClient,
      });

      const upcomingGoal = await createGoal(
        {
          groupId: groupB.id,
          name: "待开始目标",
          category: "跑步",
          targetValue: 20,
          unit: "km",
          startDate: "2026-02-06",
          endDate: "2026-03-05",
          rewardPunishment: "失败请客",
          evidenceRequirement: "截图",
        },
        creatorB.id,
        { prisma: prisma as unknown as GoalPrismaClient }
      );
      await confirmGoal(upcomingGoal.id, challengerB.id, "APPROVED", {
        prisma: prisma as unknown as GoalPrismaClient,
      });

      const upcomingGoalRequest = await createGoalChangeRequest(
        {
          goalId: upcomingGoal.id,
          type: "MODIFY",
          proposedChanges: {
            startDate: "2026-02-07",
          },
        },
        creatorB.id,
        { prisma: prisma as unknown as GoalChangeRequestPrismaClient }
      );

      vi.setSystemTime(new Date("2026-02-05T16:00:00.000Z")); // Asia/Shanghai = 2026-02-06 00:00:00
      await runGoalStatusSchedulerTick({ prisma, logger: { error: () => {} } });

      const [pendingGoalAfter, pendingRequestAfter, upcomingGoalAfter, upcomingRequestAfter] = await Promise.all([
        prisma.goal.findUnique({ where: { id: pendingGoal.id }, select: { status: true } }),
        prisma.goalChangeRequest.findUnique({ where: { id: pendingGoalRequest.id }, select: { status: true } }),
        prisma.goal.findUnique({ where: { id: upcomingGoal.id }, select: { status: true } }),
        prisma.goalChangeRequest.findUnique({ where: { id: upcomingGoalRequest.id }, select: { status: true } }),
      ]);

      expect(pendingGoalAfter?.status).toBe("VOIDED");
      expect(pendingRequestAfter?.status).toBe("VOIDED");
      expect(upcomingGoalAfter?.status).toBe("ACTIVE");
      expect(upcomingRequestAfter?.status).toBe("VOIDED");
    } finally {
      vi.useRealTimers();
    }
  });

  it("状态影响表：UPCOMING→ACTIVE 时 CANCEL 请求继续投票，不自动作废", async () => {
    if (!prisma) throw new Error("Prisma not initialized");

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-05T12:00:00.000Z"));

    const suffix = randomBytes(6).toString("hex");
    try {
      const [creator, challenger] = await Promise.all([
        createUser(prisma, `u1_${suffix}`),
        createUser(prisma, `u2_${suffix}`),
      ]);

      const group = await createGroup({ name: "US06-状态表-CANCEL", role: "SUPERVISOR" }, creator.id, {
        prisma: prisma as unknown as GroupPrismaClient,
      });
      const [code1] = group.inviteCodes;
      await joinGroup({ inviteCode: code1, role: "CHALLENGER" }, challenger.id, {
        prisma: prisma as unknown as GroupPrismaClient,
      });

      const goal = await createGoal(
        {
          groupId: group.id,
          name: "待开始目标",
          category: "跑步",
          targetValue: 20,
          unit: "km",
          startDate: "2026-02-06",
          endDate: "2026-03-05",
          rewardPunishment: "失败请客",
          evidenceRequirement: "截图",
        },
        creator.id,
        { prisma: prisma as unknown as GoalPrismaClient }
      );
      const confirmResult = await confirmGoal(goal.id, challenger.id, "APPROVED", {
        prisma: prisma as unknown as GoalPrismaClient,
      });
      expect(confirmResult.goalStatus).toBe("UPCOMING");

      const cancelRequest = await createGoalChangeRequest(
        {
          goalId: goal.id,
          type: "CANCEL",
        },
        creator.id,
        { prisma: prisma as unknown as GoalChangeRequestPrismaClient }
      );

      vi.setSystemTime(new Date("2026-02-05T16:00:00.000Z")); // Asia/Shanghai = 2026-02-06 00:00:00
      await runGoalStatusSchedulerTick({ prisma, logger: { error: () => {} } });

      const [goalAfter, requestAfter] = await Promise.all([
        prisma.goal.findUnique({ where: { id: goal.id }, select: { status: true } }),
        prisma.goalChangeRequest.findUnique({ where: { id: cancelRequest.id }, select: { status: true } }),
      ]);

      expect(goalAfter?.status).toBe("ACTIVE");
      expect(requestAfter?.status).toBe("PENDING");
    } finally {
      vi.useRealTimers();
    }
  });

  it("状态影响表：ACTIVE→SETTLING 时 MODIFY/CANCEL 请求都自动作废", async () => {
    if (!prisma) throw new Error("Prisma not initialized");

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-05T12:00:00.000Z"));

    const suffix = randomBytes(6).toString("hex");
    try {
      const [creatorA, challengerA, creatorB, challengerB] = await Promise.all([
        createUser(prisma, `u1_${suffix}`),
        createUser(prisma, `u2_${suffix}`),
        createUser(prisma, `u3_${suffix}`),
        createUser(prisma, `u4_${suffix}`),
      ]);

      const groupA = await createGroup({ name: "US06-SETTLING-A", role: "SUPERVISOR" }, creatorA.id, {
        prisma: prisma as unknown as GroupPrismaClient,
      });
      const [groupACode] = groupA.inviteCodes;
      await joinGroup({ inviteCode: groupACode, role: "CHALLENGER" }, challengerA.id, {
        prisma: prisma as unknown as GroupPrismaClient,
      });

      const groupB = await createGroup({ name: "US06-SETTLING-B", role: "SUPERVISOR" }, creatorB.id, {
        prisma: prisma as unknown as GroupPrismaClient,
      });
      const [groupBCode] = groupB.inviteCodes;
      await joinGroup({ inviteCode: groupBCode, role: "CHALLENGER" }, challengerB.id, {
        prisma: prisma as unknown as GroupPrismaClient,
      });

      const [activeGoalA, activeGoalB] = await Promise.all([
        createGoal(
          {
            groupId: groupA.id,
            name: "进行中目标A",
            category: "跑步",
            targetValue: 20,
            unit: "km",
            startDate: "2026-02-06",
            endDate: "2026-03-05",
            rewardPunishment: "失败请客",
            evidenceRequirement: "截图",
          },
          creatorA.id,
          { prisma: prisma as unknown as GoalPrismaClient }
        ),
        createGoal(
          {
            groupId: groupB.id,
            name: "进行中目标B",
            category: "跑步",
            targetValue: 20,
            unit: "km",
            startDate: "2026-02-06",
            endDate: "2026-03-05",
            rewardPunishment: "失败请客",
            evidenceRequirement: "截图",
          },
          creatorB.id,
          { prisma: prisma as unknown as GoalPrismaClient }
        ),
      ]);

      await confirmGoal(activeGoalA.id, challengerA.id, "APPROVED", { prisma: prisma as unknown as GoalPrismaClient });
      await confirmGoal(activeGoalB.id, challengerB.id, "APPROVED", { prisma: prisma as unknown as GoalPrismaClient });

      vi.setSystemTime(new Date("2026-02-05T16:00:00.000Z")); // 先推进到 ACTIVE
      await runGoalStatusSchedulerTick({ prisma, logger: { error: () => {} } });

      const [modifyRequest, cancelRequest] = await Promise.all([
        createGoalChangeRequest(
          {
            goalId: activeGoalA.id,
            type: "MODIFY",
            proposedChanges: { name: "进行中目标A-改名" },
          },
          creatorA.id,
          { prisma: prisma as unknown as GoalChangeRequestPrismaClient }
        ),
        createGoalChangeRequest(
          {
            goalId: activeGoalB.id,
            type: "CANCEL",
          },
          creatorB.id,
          { prisma: prisma as unknown as GoalChangeRequestPrismaClient }
        ),
      ]);

      await prisma.goal.updateMany({
        where: { id: { in: [activeGoalA.id, activeGoalB.id] } },
        data: { status: "SETTLING" },
      });

      await runGoalStatusSchedulerTick({ prisma, logger: { error: () => {} } });

      const [modifyAfter, cancelAfter] = await Promise.all([
        prisma.goalChangeRequest.findUnique({ where: { id: modifyRequest.id }, select: { status: true } }),
        prisma.goalChangeRequest.findUnique({ where: { id: cancelRequest.id }, select: { status: true } }),
      ]);

      expect(modifyAfter?.status).toBe("VOIDED");
      expect(cancelAfter?.status).toBe("VOIDED");
    } finally {
      vi.useRealTimers();
    }
  });

  it("场景9：PENDING 目标修改通过后，原有确认状态全部重置", async () => {
    if (!prisma) throw new Error("Prisma not initialized");

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-05T12:00:00.000Z"));

    const suffix = randomBytes(6).toString("hex");
    try {
      const [creator, challenger, supervisor] = await Promise.all([
        createUser(prisma, `u1_${suffix}`),
        createUser(prisma, `u2_${suffix}`),
        createUser(prisma, `u3_${suffix}`),
      ]);

      const group = await createGroup({ name: "US06小组", role: "SUPERVISOR" }, creator.id, {
        prisma: prisma as unknown as GroupPrismaClient,
      });
      const [code1, code2] = group.inviteCodes;

      await joinGroup({ inviteCode: code1, role: "CHALLENGER" }, challenger.id, {
        prisma: prisma as unknown as GroupPrismaClient,
      });
      await joinGroup({ inviteCode: code2, role: "SUPERVISOR" }, supervisor.id, {
        prisma: prisma as unknown as GroupPrismaClient,
      });

      const goal = await createGoal(
        {
          groupId: group.id,
          name: "跑步挑战",
          category: "跑步",
          targetValue: 60,
          unit: "km",
          startDate: "2026-02-10",
          endDate: "2026-03-09",
          rewardPunishment: "失败者请成功者吃饭",
          evidenceRequirement: "跑步APP截图",
        },
        creator.id,
        { prisma: prisma as unknown as GoalPrismaClient }
      );

      await confirmGoal(goal.id, challenger.id, "APPROVED", { prisma: prisma as unknown as GoalPrismaClient });

      const request = await createGoalChangeRequest(
        {
          goalId: goal.id,
          type: "MODIFY",
          proposedChanges: {
            name: "跑步挑战-重置确认",
          },
        },
        creator.id,
        { prisma: prisma as unknown as GoalChangeRequestPrismaClient }
      );

      await voteGoalChangeRequest(request.id, challenger.id, "APPROVED", {
        prisma: prisma as unknown as GoalChangeRequestPrismaClient,
      });
      const voteResult = await voteGoalChangeRequest(request.id, supervisor.id, "APPROVED", {
        prisma: prisma as unknown as GoalChangeRequestPrismaClient,
      });

      expect(voteResult.requestStatus).toBe("APPROVED");

      const confirmations = await prisma.goalConfirmation.findMany({
        where: { goalId: goal.id },
        select: { status: true },
      });

      expect(confirmations).toHaveLength(3);
      expect(confirmations.every((item) => item.status === "PENDING")).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("场景10：修改请求中的新开始日期到达时，请求自动过期", async () => {
    if (!prisma) throw new Error("Prisma not initialized");

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-05T12:00:00.000Z"));

    const suffix = randomBytes(6).toString("hex");
    try {
      const [creator, challenger, supervisor] = await Promise.all([
        createUser(prisma, `u1_${suffix}`),
        createUser(prisma, `u2_${suffix}`),
        createUser(prisma, `u3_${suffix}`),
      ]);

      const group = await createGroup({ name: "US06-场景10", role: "SUPERVISOR" }, creator.id, {
        prisma: prisma as unknown as GroupPrismaClient,
      });
      const [code1, code2] = group.inviteCodes;

      await joinGroup({ inviteCode: code1, role: "CHALLENGER" }, challenger.id, {
        prisma: prisma as unknown as GroupPrismaClient,
      });
      await joinGroup({ inviteCode: code2, role: "SUPERVISOR" }, supervisor.id, {
        prisma: prisma as unknown as GroupPrismaClient,
      });

      const goal = await createGoal(
        {
          groupId: group.id,
          name: "待开始目标",
          category: "跑步",
          targetValue: 30,
          unit: "km",
          startDate: "2026-02-10",
          endDate: "2026-02-28",
          rewardPunishment: "失败者请成功者吃饭",
          evidenceRequirement: "跑步APP截图",
        },
        creator.id,
        { prisma: prisma as unknown as GoalPrismaClient }
      );

      await confirmGoal(goal.id, challenger.id, "APPROVED", {
        prisma: prisma as unknown as GoalPrismaClient,
      });
      await confirmGoal(goal.id, supervisor.id, "APPROVED", {
        prisma: prisma as unknown as GoalPrismaClient,
      });

      const request = await createGoalChangeRequest(
        {
          goalId: goal.id,
          type: "MODIFY",
          proposedChanges: {
            startDate: "2026-02-06",
          },
        },
        creator.id,
        { prisma: prisma as unknown as GoalChangeRequestPrismaClient }
      );

      expect(request.expiresAt).toBe("2026-02-06T12:00:00.000Z");
      expect(request.effectiveExpiresAt).toBe("2026-02-05T16:00:00.000Z");

      const requestBefore = await prisma.goalChangeRequest.findUnique({
        where: { id: request.id },
        select: { status: true },
      });
      expect(requestBefore?.status).toBe("PENDING");

      vi.setSystemTime(new Date("2026-02-05T16:00:00.000Z")); // Asia/Shanghai = 2026-02-06 00:00:00
      await runGoalStatusSchedulerTick({ prisma, logger: { error: () => {} } });

      const requestAfter = await prisma.goalChangeRequest.findUnique({
        where: { id: request.id },
        select: { status: true },
      });
      expect(requestAfter?.status).toBe("EXPIRED");
    } finally {
      vi.useRealTimers();
    }
  });

  it("场景11：进行中目标修改结束日期为非未来日期时失败", async () => {
    if (!prisma) throw new Error("Prisma not initialized");

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-05T12:00:00.000Z"));

    const suffix = randomBytes(6).toString("hex");
    try {
      const [creator, challenger, supervisor] = await Promise.all([
        createUser(prisma, `u1_${suffix}`),
        createUser(prisma, `u2_${suffix}`),
        createUser(prisma, `u3_${suffix}`),
      ]);

      const group = await createGroup({ name: "US06-场景11", role: "SUPERVISOR" }, creator.id, {
        prisma: prisma as unknown as GroupPrismaClient,
      });
      const [code1, code2] = group.inviteCodes;

      await joinGroup({ inviteCode: code1, role: "CHALLENGER" }, challenger.id, {
        prisma: prisma as unknown as GroupPrismaClient,
      });
      await joinGroup({ inviteCode: code2, role: "SUPERVISOR" }, supervisor.id, {
        prisma: prisma as unknown as GroupPrismaClient,
      });

      const goal = await createGoal(
        {
          groupId: group.id,
          name: "进行中目标",
          category: "跑步",
          targetValue: 30,
          unit: "km",
          startDate: "2026-02-06",
          endDate: "2026-02-28",
          rewardPunishment: "失败者请成功者吃饭",
          evidenceRequirement: "跑步APP截图",
        },
        creator.id,
        { prisma: prisma as unknown as GoalPrismaClient }
      );

      await confirmGoal(goal.id, challenger.id, "APPROVED", {
        prisma: prisma as unknown as GoalPrismaClient,
      });
      await confirmGoal(goal.id, supervisor.id, "APPROVED", {
        prisma: prisma as unknown as GoalPrismaClient,
      });

      vi.setSystemTime(new Date("2026-02-05T16:00:00.000Z")); // Asia/Shanghai = 2026-02-06 00:00:00
      await runGoalStatusSchedulerTick({ prisma, logger: { error: () => {} } });

      const goalAfterActivate = await prisma.goal.findUnique({ where: { id: goal.id }, select: { status: true } });
      expect(goalAfterActivate?.status).toBe("ACTIVE");

      await expectAppError(
        createGoalChangeRequest(
          {
            goalId: goal.id,
            type: "MODIFY",
            proposedChanges: {
              endDate: "2026-02-06",
            },
          },
          creator.id,
          { prisma: prisma as unknown as GoalChangeRequestPrismaClient }
        ),
        { statusCode: 400, message: "结束日期必须是未来日期" }
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("场景12：修改请求中的新结束日期到达时，请求自动过期", async () => {
    if (!prisma) throw new Error("Prisma not initialized");

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-05T12:00:00.000Z"));

    const suffix = randomBytes(6).toString("hex");
    try {
      const [creator, challenger, supervisor] = await Promise.all([
        createUser(prisma, `u1_${suffix}`),
        createUser(prisma, `u2_${suffix}`),
        createUser(prisma, `u3_${suffix}`),
      ]);

      const group = await createGroup({ name: "US06-场景12", role: "SUPERVISOR" }, creator.id, {
        prisma: prisma as unknown as GroupPrismaClient,
      });
      const [code1, code2] = group.inviteCodes;

      await joinGroup({ inviteCode: code1, role: "CHALLENGER" }, challenger.id, {
        prisma: prisma as unknown as GroupPrismaClient,
      });
      await joinGroup({ inviteCode: code2, role: "SUPERVISOR" }, supervisor.id, {
        prisma: prisma as unknown as GroupPrismaClient,
      });

      const goal = await createGoal(
        {
          groupId: group.id,
          name: "进行中目标",
          category: "跑步",
          targetValue: 30,
          unit: "km",
          startDate: "2026-02-06",
          endDate: "2026-02-28",
          rewardPunishment: "失败者请成功者吃饭",
          evidenceRequirement: "跑步APP截图",
        },
        creator.id,
        { prisma: prisma as unknown as GoalPrismaClient }
      );

      await confirmGoal(goal.id, challenger.id, "APPROVED", {
        prisma: prisma as unknown as GoalPrismaClient,
      });
      await confirmGoal(goal.id, supervisor.id, "APPROVED", {
        prisma: prisma as unknown as GoalPrismaClient,
      });

      vi.setSystemTime(new Date("2026-02-05T16:00:00.000Z")); // Asia/Shanghai = 2026-02-06 00:00:00
      await runGoalStatusSchedulerTick({ prisma, logger: { error: () => {} } });

      const goalAfterActivate = await prisma.goal.findUnique({ where: { id: goal.id }, select: { status: true } });
      expect(goalAfterActivate?.status).toBe("ACTIVE");

      const request = await createGoalChangeRequest(
        {
          goalId: goal.id,
          type: "MODIFY",
          proposedChanges: {
            endDate: "2026-02-07",
          },
        },
        creator.id,
        { prisma: prisma as unknown as GoalChangeRequestPrismaClient }
      );

      expect(request.expiresAt).toBe("2026-02-06T16:00:00.000Z");
      expect(request.effectiveExpiresAt).toBe("2026-02-06T16:00:00.000Z");

      const requestBefore = await prisma.goalChangeRequest.findUnique({
        where: { id: request.id },
        select: { status: true },
      });
      expect(requestBefore?.status).toBe("PENDING");

      vi.setSystemTime(new Date("2026-02-06T16:00:00.000Z")); // Asia/Shanghai = 2026-02-07 00:00:00
      await runGoalStatusSchedulerTick({ prisma, logger: { error: () => {} } });

      const requestAfter = await prisma.goalChangeRequest.findUnique({
        where: { id: request.id },
        select: { status: true },
      });
      expect(requestAfter?.status).toBe("EXPIRED");
    } finally {
      vi.useRealTimers();
    }
  });
});
