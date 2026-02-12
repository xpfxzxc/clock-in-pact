import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

import { createGroup, joinGroup, type GroupPrismaClient } from "../../server/services/group.service";
import { confirmGoal, createGoal, type GoalPrismaClient } from "../../server/services/goal.service";
import {
  createGoalChangeRequest,
  voteGoalChangeRequest,
  type GoalChangeRequestPrismaClient,
} from "../../server/services/goal-change-request.service";
import { getFeedEvents, type FeedPrismaClient } from "../../server/services/feed.service";
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

describeIntegration("integration US-09 新增动态场景（16/17/18/19）", () => {
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

  it("场景18: 创建目标后可看到“目标自动同意”系统动态", async () => {
    if (!prisma) throw new Error("Prisma not initialized");

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-05T12:00:00.000Z"));

    const suffix = randomBytes(6).toString("hex");
    const [supervisor, challenger] = await Promise.all([
      createUser(prisma, `sup_${suffix}`),
      createUser(prisma, `cha_${suffix}`),
    ]);

    const group = await createGroup({ name: "US09-18小组", role: "SUPERVISOR" }, supervisor.id, {
      prisma: prisma as unknown as GroupPrismaClient,
    });

    await joinGroup({ inviteCode: group.inviteCodes[0]!, role: "CHALLENGER" }, challenger.id, {
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
        endDate: "2026-02-28",
        rewardPunishment: "失败者请成功者吃饭",
        evidenceRequirement: "跑步APP截图",
      },
      supervisor.id,
      { prisma: prisma as unknown as GoalPrismaClient }
    );

    const feed = await getFeedEvents(group.id, supervisor.id, { limit: 50 }, {
      prisma: prisma as unknown as FeedPrismaClient,
    });

    const event = feed.events.find((item) => item.eventType === "GOAL_AUTO_APPROVED");
    expect(event).toBeDefined();
    expect(event?.actorNickname).toBeNull();
    expect(event?.metadata).toMatchObject({
      goalId: goal.id,
      goalName: "跑步挑战",
    });
  });

  it("场景17 + 场景16: 发起请求后可看到“请求自动同意”；成员投票后可看到“请求确认动态”", async () => {
    if (!prisma) throw new Error("Prisma not initialized");

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-05T12:00:00.000Z"));

    const suffix = randomBytes(6).toString("hex");
    const [supervisor, challenger] = await Promise.all([
      createUser(prisma, `sup_${suffix}`),
      createUser(prisma, `cha_${suffix}`),
    ]);

    const group = await createGroup({ name: "US09-17小组", role: "SUPERVISOR" }, supervisor.id, {
      prisma: prisma as unknown as GroupPrismaClient,
    });

    await joinGroup({ inviteCode: group.inviteCodes[0]!, role: "CHALLENGER" }, challenger.id, {
      prisma: prisma as unknown as GroupPrismaClient,
    });

    const goal = await createGoal(
      {
        groupId: group.id,
        name: "游泳挑战",
        category: "游泳",
        targetValue: 20,
        unit: "次",
        startDate: "2026-02-10",
        endDate: "2026-02-28",
        rewardPunishment: "失败者请成功者吃饭",
        evidenceRequirement: "打卡截图",
      },
      supervisor.id,
      { prisma: prisma as unknown as GoalPrismaClient }
    );

    const request = await createGoalChangeRequest(
      {
        goalId: goal.id,
        type: "MODIFY",
        proposedChanges: { name: "游泳挑战-更新版" },
      },
      supervisor.id,
      { prisma: prisma as unknown as GoalChangeRequestPrismaClient }
    );

    let feed = await getFeedEvents(group.id, supervisor.id, { limit: 50 }, {
      prisma: prisma as unknown as FeedPrismaClient,
    });

    const autoApprovedEvent = feed.events.find((item) => item.eventType === "CHANGE_REQUEST_AUTO_APPROVED");
    expect(autoApprovedEvent).toBeDefined();
    expect(autoApprovedEvent?.actorNickname).toBeNull();
    expect(autoApprovedEvent?.metadata).toMatchObject({
      requestId: request.id,
      goalId: goal.id,
      goalName: "游泳挑战",
      type: "MODIFY",
    });

    await voteGoalChangeRequest(request.id, challenger.id, "REJECTED", {
      prisma: prisma as unknown as GoalChangeRequestPrismaClient,
    });

    feed = await getFeedEvents(group.id, supervisor.id, { limit: 50 }, {
      prisma: prisma as unknown as FeedPrismaClient,
    });

    const confirmedEvent = feed.events.find(
      (item) =>
        item.eventType === "CHANGE_REQUEST_CONFIRMED" &&
        (item.metadata as Record<string, unknown>).requestId === request.id
    );
    expect(confirmedEvent).toBeDefined();
    expect(confirmedEvent?.actorNickname).toBe(challenger.nickname);
    expect(confirmedEvent?.metadata).toMatchObject({
      requestId: request.id,
      goalId: goal.id,
      goalName: "游泳挑战",
      type: "MODIFY",
      status: "REJECTED",
    });

    const feedIdsByRequest = feed.events
      .filter((item) => (item.metadata as Record<string, unknown>).requestId === request.id)
      .map((item) => item.id);

    const requestResultEvent = feed.events.find(
      (item) =>
        item.eventType === "CHANGE_REQUEST_RESULT" &&
        (item.metadata as Record<string, unknown>).requestId === request.id
    );

    expect(requestResultEvent).toBeDefined();
    expect(feedIdsByRequest).toEqual([...feedIdsByRequest].sort((a, b) => b - a));

    const confirmedIndex = feed.events.findIndex((item) => item.id === confirmedEvent?.id);
    const resultIndex = feed.events.findIndex((item) => item.id === requestResultEvent?.id);
    const autoApprovedIndex = feed.events.findIndex((item) => item.id === autoApprovedEvent?.id);
    const initiatedIndex = feed.events.findIndex(
      (item) =>
        item.eventType === "CHANGE_REQUEST_INITIATED" &&
        (item.metadata as Record<string, unknown>).requestId === request.id
    );

    expect(confirmedIndex).toBeGreaterThanOrEqual(0);
    expect(resultIndex).toBeGreaterThanOrEqual(0);
    expect(autoApprovedIndex).toBeGreaterThanOrEqual(0);
    expect(initiatedIndex).toBeGreaterThanOrEqual(0);
    expect(resultIndex).toBeLessThan(confirmedIndex);
    expect(confirmedIndex).toBeLessThan(autoApprovedIndex);
    expect(autoApprovedIndex).toBeLessThan(initiatedIndex);
  });

  it("场景17(通过链路顺序): 请求通过后动态顺序为“状态变更 -> 确认重置 -> 请求通过 -> 最后同意”", async () => {
    if (!prisma) throw new Error("Prisma not initialized");

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-05T12:00:00.000Z"));

    const suffix = randomBytes(6).toString("hex");
    const [supervisor, challenger] = await Promise.all([
      createUser(prisma, `so_${suffix}`),
      createUser(prisma, `co_${suffix}`),
    ]);

    const group = await createGroup({ name: "US09-17-顺序小组", role: "SUPERVISOR" }, supervisor.id, {
      prisma: prisma as unknown as GroupPrismaClient,
    });

    await joinGroup({ inviteCode: group.inviteCodes[0]!, role: "CHALLENGER" }, challenger.id, {
      prisma: prisma as unknown as GroupPrismaClient,
    });

    const goal = await createGoal(
      {
        groupId: group.id,
        name: "测试100次",
        category: "测试",
        targetValue: 100,
        unit: "次",
        startDate: "2026-02-10",
        endDate: "2026-03-09",
        rewardPunishment: "失败者请成功者吃饭",
        evidenceRequirement: "截图",
      },
      supervisor.id,
      { prisma: prisma as unknown as GoalPrismaClient }
    );

    const confirmResult = await confirmGoal(goal.id, challenger.id, "APPROVED", {
      prisma: prisma as unknown as GoalPrismaClient,
    });
    expect(confirmResult.goalStatus).toBe("UPCOMING");

    const request = await createGoalChangeRequest(
      {
        goalId: goal.id,
        type: "MODIFY",
        proposedChanges: { name: "测试100次-更新" },
      },
      supervisor.id,
      { prisma: prisma as unknown as GoalChangeRequestPrismaClient }
    );

    const voteResult = await voteGoalChangeRequest(request.id, challenger.id, "APPROVED", {
      prisma: prisma as unknown as GoalChangeRequestPrismaClient,
    });
    expect(voteResult.requestStatus).toBe("APPROVED");

    const feed = await getFeedEvents(group.id, supervisor.id, { limit: 50 }, {
      prisma: prisma as unknown as FeedPrismaClient,
    });

    const resultIndex = feed.events.findIndex(
      (item) =>
        item.eventType === "CHANGE_REQUEST_RESULT" &&
        (item.metadata as Record<string, unknown>).requestId === request.id &&
        (item.metadata as Record<string, unknown>).result === "APPROVED"
    );
    const confirmedIndex = feed.events.findIndex(
      (item) =>
        item.eventType === "CHANGE_REQUEST_CONFIRMED" &&
        (item.metadata as Record<string, unknown>).requestId === request.id &&
        (item.metadata as Record<string, unknown>).status === "APPROVED"
    );
    const statusIndex = feed.events.findIndex(
      (item) =>
        item.eventType === "GOAL_STATUS_CHANGED" &&
        (item.metadata as Record<string, unknown>).goalId === goal.id &&
        (item.metadata as Record<string, unknown>).fromStatus === "UPCOMING" &&
        (item.metadata as Record<string, unknown>).toStatus === "PENDING"
    );
    const resetIndex = feed.events.findIndex(
      (item) =>
        item.eventType === "GOAL_CONFIRMATION_RESET" &&
        (item.metadata as Record<string, unknown>).requestId === request.id
    );

    expect(resultIndex).toBeGreaterThanOrEqual(0);
    expect(confirmedIndex).toBeGreaterThanOrEqual(0);
    expect(statusIndex).toBeGreaterThanOrEqual(0);
    expect(resetIndex).toBeGreaterThanOrEqual(0);

    expect(statusIndex).toBeLessThan(resetIndex);
    expect(resetIndex).toBeLessThan(resultIndex);
    expect(resultIndex).toBeLessThan(confirmedIndex);
  });

  it("场景19: 小组有待开始目标时，新挑战者加入可看到“自动参与目标”系统动态", async () => {
    if (!prisma) throw new Error("Prisma not initialized");

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-05T12:00:00.000Z"));

    const suffix = randomBytes(6).toString("hex");
    const [supervisor, challengerA, challengerB] = await Promise.all([
      createUser(prisma, `sup_${suffix}`),
      createUser(prisma, `chaA_${suffix}`),
      createUser(prisma, `chaB_${suffix}`),
    ]);

    const group = await createGroup({ name: "US09-19小组", role: "SUPERVISOR" }, supervisor.id, {
      prisma: prisma as unknown as GroupPrismaClient,
    });

    const [codeA, codeB] = group.inviteCodes;
    await joinGroup({ inviteCode: codeA!, role: "CHALLENGER" }, challengerA.id, {
      prisma: prisma as unknown as GroupPrismaClient,
    });

    const goal = await createGoal(
      {
        groupId: group.id,
        name: "冥想挑战",
        category: "冥想",
        targetValue: 30,
        unit: "天",
        startDate: "2026-02-10",
        endDate: "2026-03-09",
        rewardPunishment: "失败者请成功者吃饭",
        evidenceRequirement: "截图",
      },
      supervisor.id,
      { prisma: prisma as unknown as GoalPrismaClient }
    );

    const confirmResult = await confirmGoal(goal.id, challengerA.id, "APPROVED", {
      prisma: prisma as unknown as GoalPrismaClient,
    });
    expect(confirmResult.goalStatus).toBe("UPCOMING");

    await joinGroup({ inviteCode: codeB!, role: "CHALLENGER" }, challengerB.id, {
      prisma: prisma as unknown as GroupPrismaClient,
    });

    const feed = await getFeedEvents(group.id, supervisor.id, { limit: 50 }, {
      prisma: prisma as unknown as FeedPrismaClient,
    });

    const enrolledEvent = feed.events.find((item) => item.eventType === "CHALLENGER_AUTO_ENROLLED");
    expect(enrolledEvent).toBeDefined();
    expect(enrolledEvent?.actorNickname).toBeNull();
    expect(enrolledEvent?.metadata).toMatchObject({
      goalId: goal.id,
      goalName: "冥想挑战",
      challengerNickname: challengerB.nickname,
    });
  });

  it("场景11补充: 单成员小组请求自动通过时，可看到“请求结果(通过)”系统动态", async () => {
    if (!prisma) throw new Error("Prisma not initialized");

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-05T12:00:00.000Z"));

    const suffix = randomBytes(6).toString("hex");
    const supervisor = await createUser(prisma, `solo_${suffix}`);

    const group = await createGroup({ name: "US09-11-单成员组", role: "SUPERVISOR" }, supervisor.id, {
      prisma: prisma as unknown as GroupPrismaClient,
    });

    const goal = await createGoal(
      {
        groupId: group.id,
        name: "单人取消测试",
        category: "测试",
        targetValue: 10,
        unit: "次",
        startDate: "2026-02-10",
        endDate: "2026-03-09",
        rewardPunishment: "失败者请成功者吃饭",
        evidenceRequirement: "截图",
      },
      supervisor.id,
      { prisma: prisma as unknown as GoalPrismaClient }
    );

    const request = await createGoalChangeRequest(
      {
        goalId: goal.id,
        type: "CANCEL",
      },
      supervisor.id,
      { prisma: prisma as unknown as GoalChangeRequestPrismaClient }
    );

    const feed = await getFeedEvents(group.id, supervisor.id, { limit: 50 }, {
      prisma: prisma as unknown as FeedPrismaClient,
    });

    const resultEvent = feed.events.find(
      (item) =>
        item.eventType === "CHANGE_REQUEST_RESULT" &&
        (item.metadata as Record<string, unknown>).requestId === request.id &&
        (item.metadata as Record<string, unknown>).result === "APPROVED"
    );

    expect(resultEvent).toBeDefined();
    expect(resultEvent?.actorNickname).toBeNull();
    expect(resultEvent?.metadata).toMatchObject({
      requestId: request.id,
      goalId: goal.id,
      goalName: "单人取消测试",
      type: "CANCEL",
      result: "APPROVED",
    });
  });

  it("场景11补充: 目标作废导致请求作废时，可看到“请求结果(作废)”系统动态", async () => {
    if (!prisma) throw new Error("Prisma not initialized");

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-05T12:00:00.000Z"));

    const suffix = randomBytes(6).toString("hex");
    const [creator, challenger, supervisor] = await Promise.all([
      createUser(prisma, `v1_${suffix}`),
      createUser(prisma, `v2_${suffix}`),
      createUser(prisma, `v3_${suffix}`),
    ]);

    const group = await createGroup({ name: "US09-11-作废结果", role: "SUPERVISOR" }, creator.id, {
      prisma: prisma as unknown as GroupPrismaClient,
    });

    const [code1, code2] = group.inviteCodes;
    await joinGroup({ inviteCode: code1!, role: "CHALLENGER" }, challenger.id, {
      prisma: prisma as unknown as GroupPrismaClient,
    });
    await joinGroup({ inviteCode: code2!, role: "SUPERVISOR" }, supervisor.id, {
      prisma: prisma as unknown as GroupPrismaClient,
    });

    const goal = await createGoal(
      {
        groupId: group.id,
        name: "测试1333次",
        category: "测试",
        targetValue: 1333,
        unit: "次",
        startDate: "2026-02-06",
        endDate: "2026-02-28",
        rewardPunishment: "失败者请成功者吃饭",
        evidenceRequirement: "截图",
      },
      creator.id,
      { prisma: prisma as unknown as GoalPrismaClient }
    );

    const request = await createGoalChangeRequest(
      {
        goalId: goal.id,
        type: "MODIFY",
        proposedChanges: { name: "测试1333次-改名" },
      },
      creator.id,
      { prisma: prisma as unknown as GoalChangeRequestPrismaClient }
    );

    expect(request.status).toBe("PENDING");

    vi.setSystemTime(new Date("2026-02-05T16:00:00.000Z")); // Asia/Shanghai=2026-02-06 00:00
    await runGoalStatusSchedulerTick({ prisma, logger: { error: () => {} } });

    const [goalAfter, requestAfter] = await Promise.all([
      prisma.goal.findUnique({ where: { id: goal.id }, select: { status: true } }),
      prisma.goalChangeRequest.findUnique({ where: { id: request.id }, select: { status: true } }),
    ]);

    expect(goalAfter?.status).toBe("VOIDED");
    expect(requestAfter?.status).toBe("VOIDED");

    const feed = await getFeedEvents(group.id, creator.id, { limit: 50 }, {
      prisma: prisma as unknown as FeedPrismaClient,
    });

    const voidedResultEvent = feed.events.find(
      (item) =>
        item.eventType === "CHANGE_REQUEST_RESULT" &&
        (item.metadata as Record<string, unknown>).requestId === request.id &&
        (item.metadata as Record<string, unknown>).result === "VOIDED"
    );

    expect(voidedResultEvent).toBeDefined();
    expect(voidedResultEvent?.metadata).toMatchObject({
      requestId: request.id,
      goalId: goal.id,
      goalName: "测试1333次",
      type: "MODIFY",
      result: "VOIDED",
    });
  });
});
