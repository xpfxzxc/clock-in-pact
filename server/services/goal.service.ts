import type { ConfirmationStatus, GoalStatus, MemberRole } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import type {
  CreateGoalRequest,
  ConfirmGoalResponse,
  DurationLimitResponse,
  GoalDetailResponse,
  GoalResponse,
} from "../types/goal";
import type { GoalChangeRequestResponse, GoalChangeVoteInfo, GoalProposedChanges } from "../types/goal-change-request";
import { AppError } from "../utils/app-error";
import { getGoalChangeRequestEffectiveExpiresAt } from "../utils/goal-change-request-deadline";
import { createFeedEvent } from "./feed.service";

const GOAL_NAME_MAX_LENGTH = 50;
const GOAL_CATEGORY_MAX_LENGTH = 20;
const GOAL_UNIT_MAX_LENGTH = 10;
const GOAL_REWARD_PUNISHMENT_MAX_LENGTH = 200;
const GOAL_EVIDENCE_REQUIREMENT_MAX_LENGTH = 200;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type GoalPrismaClient = PrismaClient | any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type GoalPrismaTransactionClient = any;

type DecimalLike = { toNumber(): number } | { toString(): string };

type GoalRecord = {
  id: number;
  groupId: number;
  name: string;
  category: string;
  targetValue: DecimalLike | number;
  unit: string;
  startDate: Date;
  endDate: Date;
  rewardPunishment: string;
  evidenceRequirement: string;
  status: GoalStatus;
  createdById: number;
  createdAt: Date;
};

type GoalDetailRecord = GoalRecord & {
  createdBy: { id: number; nickname: string };
  confirmations: Array<{
    memberId: number;
    status: ConfirmationStatus;
    updatedAt: Date;
    member: { userId: number; role: MemberRole; user: { nickname: string } };
  }>;
  participants: Array<{
    memberId: number;
    createdAt: Date;
    member: { userId: number; user: { nickname: string } };
  }>;
};

function assertNonEmptyString(value: unknown, errorMessage: string, maxLength?: number): asserts value is string {
  if (typeof value !== "string" || !value.trim()) {
    throw new AppError(400, errorMessage);
  }
  if (maxLength !== undefined && value.trim().length > maxLength) {
    throw new AppError(400, errorMessage);
  }
}

function assertNumber(value: unknown, errorMessage: string): asserts value is number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new AppError(400, errorMessage);
  }
}

function parseDateOnly(dateString: unknown, errorMessage: string): Date {
  if (typeof dateString !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    throw new AppError(400, errorMessage);
  }
  const parts = dateString.split("-").map((part) => Number(part));
  const year = parts[0]!;
  const month = parts[1]!;
  const day = parts[2]!;
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new AppError(400, errorMessage);
  }
  return parsed;
}

function formatDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function formatDateOnlyInTimeZone(date: Date, timeZone: string): string {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);
  } catch {
    throw new AppError(500, "小组时区配置错误");
  }

  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;
  if (!year || !month || !day) {
    throw new AppError(500, "小组时区配置错误");
  }

  return `${year}-${month}-${day}`;
}

function getTodayDateStringInTimeZone(timeZone: string): string {
  return formatDateOnlyInTimeZone(new Date(), timeZone);
}

async function getGroupTimezone(groupId: number, prisma: GoalPrismaClient): Promise<string> {
  const group = await prisma.group.findUnique({
    where: { id: groupId },
    select: { timezone: true },
  });
  if (!group) {
    throw new AppError(404, "小组不存在");
  }
  return group.timezone;
}

function decimalToNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (value && typeof value === "object") {
    const maybe = value as { toNumber?: () => number; toString?: () => string };
    if (typeof maybe.toNumber === "function") return maybe.toNumber();
    if (typeof maybe.toString === "function") return Number(maybe.toString());
  }
  return Number(value);
}

function getMaxAllowedMonths(completionCount: number): number {
  if (completionCount >= 6) return 12;
  if (completionCount >= 4) return 6;
  if (completionCount >= 2) return 3;
  if (completionCount >= 1) return 2;
  return 1;
}

function calculateDurationMonths(startDate: Date, endDate: Date): number {
  const startY = startDate.getUTCFullYear();
  const startM = startDate.getUTCMonth();
  const startD = startDate.getUTCDate();
  const endY = endDate.getUTCFullYear();
  const endM = endDate.getUTCMonth();
  const endD = endDate.getUTCDate();

  const diffMonths = (endY - startY) * 12 + (endM - startM);
  const months = endD >= startD ? diffMonths + 1 : diffMonths;
  return Math.max(1, months);
}

function mapGoalResponse(goal: GoalRecord): GoalResponse {
  return {
    id: goal.id,
    groupId: goal.groupId,
    name: goal.name,
    category: goal.category,
    targetValue: decimalToNumber(goal.targetValue),
    unit: goal.unit,
    startDate: formatDateOnly(goal.startDate),
    endDate: formatDateOnly(goal.endDate),
    rewardPunishment: goal.rewardPunishment,
    evidenceRequirement: goal.evidenceRequirement,
    status: goal.status,
    createdById: goal.createdById,
    createdAt: goal.createdAt.toISOString(),
  };
}

function mapGoalDetailResponse(goal: GoalDetailRecord, userId: number): GoalDetailResponse {
  const confirmations = (goal.confirmations ?? []).map((c) => ({
    memberId: c.memberId,
    userId: c.member.userId,
    nickname: c.member.user.nickname,
    role: c.member.role,
    status: c.status,
    updatedAt: c.updatedAt.toISOString(),
  }));

  const participants = (goal.participants ?? []).map((p) => ({
    memberId: p.memberId,
    userId: p.member.userId,
    nickname: p.member.user.nickname,
  }));

  const myConfirmation = confirmations.find((c) => c.userId === userId);
  const isParticipant = participants.some((p) => p.userId === userId);

  return {
    ...mapGoalResponse(goal),
    createdBy: { id: goal.createdBy.id, nickname: goal.createdBy.nickname },
    confirmations,
    participants,
    myConfirmationStatus: myConfirmation?.status,
    isParticipant,
  };
}

function assertCreateGoalInput(body: CreateGoalRequest): void {
  assertNumber(body.groupId, "无效的小组 ID");
  assertNonEmptyString(body.name, "目标名称不能为空", GOAL_NAME_MAX_LENGTH);
  assertNonEmptyString(body.category, "目标类别不能为空", GOAL_CATEGORY_MAX_LENGTH);
  assertNumber(body.targetValue, "目标数值无效");
  if (body.targetValue <= 0) {
    throw new AppError(400, "目标数值必须大于0");
  }
  assertNonEmptyString(body.unit, "单位不能为空", GOAL_UNIT_MAX_LENGTH);
  assertNonEmptyString(body.rewardPunishment, "奖惩规则不能为空", GOAL_REWARD_PUNISHMENT_MAX_LENGTH);
  assertNonEmptyString(body.evidenceRequirement, "证据要求不能为空", GOAL_EVIDENCE_REQUIREMENT_MAX_LENGTH);
}

export async function getDurationLimit(
  groupId: number,
  category: string,
  userId: number,
  deps: { prisma: GoalPrismaClient }
): Promise<DurationLimitResponse> {
  if (Number.isNaN(groupId)) {
    throw new AppError(400, "无效的小组 ID");
  }
  assertNonEmptyString(category, "目标类别不能为空", GOAL_CATEGORY_MAX_LENGTH);

  const membership = await deps.prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId } },
    select: { id: true },
  });
  if (!membership) {
    throw new AppError(403, "您不是该小组成员");
  }

  const challengers = await deps.prisma.groupMember.findMany({
    where: { groupId, role: "CHALLENGER" },
    include: { user: { select: { nickname: true } } },
    orderBy: { createdAt: "asc" },
  });

  const challengerUserIds = challengers.map((c: { userId: number }) => c.userId);
  const completions =
    challengerUserIds.length === 0
      ? []
      : await deps.prisma.categoryCompletion.findMany({
          where: { groupId, category: category.trim(), userId: { in: challengerUserIds } },
        });

  const completionMap = new Map<number, number>(
    completions.map((c: { userId: number; completionCount: number }) => [c.userId, c.completionCount])
  );

  const challengerLimits = challengers.map((c: { userId: number; user: { nickname: string } }) => {
    const completionCount = completionMap.get(c.userId) ?? 0;
    const maxAllowedMonths = getMaxAllowedMonths(completionCount);
    return {
      userId: c.userId,
      nickname: c.user.nickname,
      completionCount,
      maxAllowedMonths,
    };
  });

  const maxAllowedMonths =
    challengerLimits.length === 0 ? 0 : Math.min(...challengerLimits.map((c: { maxAllowedMonths: number }) => c.maxAllowedMonths));

  return {
    groupId,
    category: category.trim(),
    maxAllowedMonths,
    challengerLimits,
  };
}

export async function createGoal(
  body: CreateGoalRequest,
  userId: number,
  deps: { prisma: GoalPrismaClient }
): Promise<GoalResponse> {
  assertCreateGoalInput(body);

  const name = body.name.trim();
  const category = body.category.trim();
  const unit = body.unit.trim();
  const rewardPunishment = body.rewardPunishment.trim();
  const evidenceRequirement = body.evidenceRequirement.trim();

  const startDate = parseDateOnly(body.startDate, "开始日期格式错误");
  const endDate = parseDateOnly(body.endDate, "结束日期格式错误");

  const timeZone = await getGroupTimezone(body.groupId, deps.prisma);

  if (formatDateOnly(startDate) <= getTodayDateStringInTimeZone(timeZone)) {
    throw new AppError(400, "开始日期必须是未来日期");
  }

  if (endDate.getTime() < startDate.getTime()) {
    throw new AppError(400, "结束日期不能早于开始日期");
  }

  const durationMonths = calculateDurationMonths(startDate, endDate);

  return deps.prisma.$transaction(async (tx: GoalPrismaTransactionClient) => {
    const members = await tx.groupMember.findMany({
      where: { groupId: body.groupId },
      select: { id: true, userId: true, role: true },
      orderBy: { createdAt: "asc" },
    });

    const myMember = members.find((m: { userId: number }) => m.userId === userId);
    if (!myMember) {
      throw new AppError(403, "您不是该小组成员");
    }

    const existingGoal = await tx.goal.findFirst({
      where: { groupId: body.groupId, status: { in: ["PENDING", "UPCOMING", "ACTIVE"] } },
      select: { id: true },
    });
    if (existingGoal) {
      throw new AppError(400, "当前已有进行中的目标");
    }

    const challengers = members.filter((m: { role: string }) => m.role === "CHALLENGER");
    if (challengers.length > 0) {
      const completionRows = await tx.categoryCompletion.findMany({
        where: {
          groupId: body.groupId,
          category,
          userId: { in: challengers.map((c: { userId: number }) => c.userId) },
        },
      });
      const completionMap = new Map<number, number>(
        completionRows.map((row: { userId: number; completionCount: number }) => [row.userId, row.completionCount])
      );
      const allowedMonths = Math.min(
        ...challengers.map((c: { userId: number }) => getMaxAllowedMonths(completionMap.get(c.userId) ?? 0))
      );
      if (durationMonths > allowedMonths) {
        throw new AppError(400, `您当前最长可创建${allowedMonths}个月的${category}目标`);
      }
    }

    const goal = await tx.goal.create({
      data: {
        groupId: body.groupId,
        name,
        category,
        targetValue: body.targetValue,
        unit,
        startDate,
        endDate,
        rewardPunishment,
        evidenceRequirement,
        status: "PENDING",
        createdById: userId,
      },
    });

    await createFeedEvent(
      {
        eventType: "GOAL_CREATED",
        actorId: userId,
        groupId: body.groupId,
        metadata: { goalId: goal.id, goalName: name },
      },
      { prisma: tx }
    );

    await createFeedEvent(
      {
        eventType: "GOAL_AUTO_APPROVED",
        groupId: body.groupId,
        metadata: { goalId: goal.id, goalName: name },
      },
      { prisma: tx }
    );

    await tx.goalConfirmation.createMany({
      data: members.map((m: { id: number }) => ({
        goalId: goal.id,
        memberId: m.id,
        status: m.id === myMember.id ? "APPROVED" : "PENDING",
      })),
    });

    return mapGoalResponse(goal);
  });
}

export async function getGoalDetail(
  goalId: number,
  userId: number,
  deps: { prisma: GoalPrismaClient; now?: () => Date }
): Promise<GoalDetailResponse> {
  const now = deps.now?.() ?? new Date();

  if (Number.isNaN(goalId)) {
    throw new AppError(400, "无效的目标 ID");
  }

  const goal = await deps.prisma.goal.findUnique({
    where: { id: goalId },
    include: {
      createdBy: { select: { id: true, nickname: true } },
      confirmations: {
        include: {
          member: {
            include: {
              user: { select: { nickname: true } },
            },
          },
        },
        orderBy: { updatedAt: "asc" },
      },
      participants: {
        include: {
          member: {
            include: {
              user: { select: { nickname: true } },
            },
          },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!goal) {
    throw new AppError(404, "目标不存在");
  }

  const membership = await deps.prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId: goal.groupId, userId } },
    select: { id: true, role: true },
  });
  if (!membership) {
    throw new AppError(403, "您不是该小组成员");
  }

  await deps.prisma.goalChangeRequest.updateMany({
    where: {
      goalId,
      status: "PENDING",
      expiresAt: { lte: now },
    },
    data: { status: "EXPIRED" },
  });

  const activeChangeRequest = await deps.prisma.goalChangeRequest.findFirst({
    where: {
      goalId,
      status: "PENDING",
      expiresAt: { gt: now },
    },
    include: {
      initiator: { include: { user: { select: { nickname: true } } } },
      goal: { select: { group: { select: { timezone: true } } } },
      votes: {
        include: {
          member: { include: { user: { select: { nickname: true } } } },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  const detail = mapGoalDetailResponse(goal, userId);
  detail.myRole = membership.role;

  if (activeChangeRequest) {
    const effectiveExpiresAt = getGoalChangeRequestEffectiveExpiresAt({
      type: activeChangeRequest.type,
      expiresAt: activeChangeRequest.expiresAt,
      proposedChanges: activeChangeRequest.proposedChanges,
      timezone: activeChangeRequest.goal?.group?.timezone,
    });

    if (effectiveExpiresAt.getTime() <= now.getTime()) {
      await deps.prisma.goalChangeRequest.updateMany({
        where: { id: activeChangeRequest.id, status: "PENDING" },
        data: { status: "EXPIRED" },
      });
      detail.activeChangeRequest = null;
      return detail;
    }

    const votes: GoalChangeVoteInfo[] = (activeChangeRequest.votes ?? []).map(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (v: any) => ({
        memberId: v.memberId,
        userId: v.member.userId,
        nickname: v.member.user.nickname,
        role: v.member.role,
        status: v.status,
        updatedAt: v.updatedAt.toISOString(),
      })
    );
    const myVote = votes.find((v) => v.userId === userId);

    detail.activeChangeRequest = {
      id: activeChangeRequest.id,
      goalId: activeChangeRequest.goalId,
      type: activeChangeRequest.type,
      status: activeChangeRequest.status,
      initiatorId: activeChangeRequest.initiatorId,
      initiatorNickname: activeChangeRequest.initiator.user.nickname,
      proposedChanges: activeChangeRequest.proposedChanges as GoalProposedChanges | null,
      expiresAt: activeChangeRequest.expiresAt.toISOString(),
      effectiveExpiresAt: effectiveExpiresAt.toISOString(),
      votes,
      myVoteStatus: myVote?.status as ConfirmationStatus | undefined,
      createdAt: activeChangeRequest.createdAt.toISOString(),
    };
  } else {
    detail.activeChangeRequest = null;
  }

  return detail;
}

export async function confirmGoal(
  goalId: number,
  userId: number,
  status: "APPROVED" | "REJECTED",
  deps: { prisma: GoalPrismaClient }
): Promise<ConfirmGoalResponse> {
  if (Number.isNaN(goalId)) {
    throw new AppError(400, "无效的目标 ID");
  }
  if (status !== "APPROVED" && status !== "REJECTED") {
    throw new AppError(400, "无效的确认状态");
  }

  return deps.prisma.$transaction(async (tx: GoalPrismaTransactionClient) => {
    const goal = await tx.goal.findUnique({
      where: { id: goalId },
      select: { id: true, groupId: true, status: true, startDate: true, name: true },
    });

    if (!goal) {
      throw new AppError(404, "目标不存在");
    }

    const member = await tx.groupMember.findUnique({
      where: { groupId_userId: { groupId: goal.groupId, userId } },
      select: { id: true },
    });
    if (!member) {
      throw new AppError(403, "您不是该小组成员");
    }

    const timeZone = await getGroupTimezone(goal.groupId, tx);

    const todayInGroup = getTodayDateStringInTimeZone(timeZone);
    const todayDate = parseDateOnly(todayInGroup, "日期格式错误");
    const hasReachedStartDate = goal.startDate.getTime() <= todayDate.getTime();

    const voidPendingRequestsAndEmit = async () => {
      const pendingRequests = await tx.goalChangeRequest.findMany({
        where: { goalId, status: "PENDING" },
        select: { id: true, type: true },
      });

      await tx.goalChangeRequest.updateMany({
        where: { goalId, status: "PENDING" },
        data: { status: "VOIDED" },
      });

      for (const request of pendingRequests) {
        await createFeedEvent(
          {
            eventType: "CHANGE_REQUEST_RESULT",
            groupId: goal.groupId,
            metadata: {
              requestId: request.id,
              goalId,
              goalName: goal.name,
              type: request.type,
              result: "VOIDED",
            },
          },
          { prisma: tx }
        );
      }
    };

    if (goal.status === "PENDING" && hasReachedStartDate) {
      await tx.goal.updateMany({
        where: { id: goalId, status: "PENDING" },
        data: { status: "VOIDED" },
      });
      await voidPendingRequestsAndEmit();

      await createFeedEvent(
        {
          eventType: "GOAL_STATUS_CHANGED",
          groupId: goal.groupId,
          metadata: {
            goalId,
            goalName: goal.name,
            fromStatus: "PENDING",
            toStatus: "VOIDED",
          },
        },
        { prisma: tx }
      );

      throw new AppError(400, "目标已作废");
    }

    if (goal.status === "VOIDED") {
      throw new AppError(400, "目标已作废");
    }

    if (goal.status !== "PENDING") {
      throw new AppError(400, "只能确认待确认状态的目标");
    }

    const confirmation = await tx.goalConfirmation.findUnique({
      where: { goalId_memberId: { goalId, memberId: member.id } },
      select: { status: true },
    });
    if (!confirmation) {
      throw new AppError(403, "您没有该目标的确认记录");
    }
    if (confirmation.status !== "PENDING") {
      throw new AppError(400, "您已确认过该目标");
    }

    const updatedConfirmation = await tx.goalConfirmation.update({
      where: { goalId_memberId: { goalId, memberId: member.id } },
      data: { status },
      select: { status: true },
    });

    await createFeedEvent(
      {
        eventType: "GOAL_CONFIRMED",
        actorId: userId,
        groupId: goal.groupId,
        metadata: {
          goalId,
          goalName: goal.name,
          status,
        },
      },
      { prisma: tx }
    );

    if (updatedConfirmation.status === "REJECTED") {
      await tx.goal.update({ where: { id: goalId }, data: { status: "VOIDED" }, select: { status: true } });
      await voidPendingRequestsAndEmit();

      await createFeedEvent(
        {
          eventType: "GOAL_STATUS_CHANGED",
          groupId: goal.groupId,
          metadata: {
            goalId,
            goalName: goal.name,
            fromStatus: "PENDING",
            toStatus: "VOIDED",
          },
        },
        { prisma: tx }
      );

      return { goalId, status: updatedConfirmation.status, goalStatus: "VOIDED" };
    }

    const allConfirmations = await tx.goalConfirmation.findMany({
      where: { goalId },
      select: { status: true },
    });

    const isAllApproved = allConfirmations.every((c: { status: string }) => c.status === "APPROVED");
    if (!isAllApproved) {
      return { goalId, status: updatedConfirmation.status, goalStatus: "PENDING" };
    }

    const members = await tx.groupMember.findMany({
      where: { groupId: goal.groupId },
      select: { id: true, userId: true, role: true },
      orderBy: { createdAt: "asc" },
    });

    const challengers = members.filter((m: { role: string }) => m.role === "CHALLENGER");
    const supervisors = members.filter((m: { role: string }) => m.role === "SUPERVISOR");
    if (challengers.length < 1) {
      throw new AppError(400, "至少需要1位挑战者");
    }
    if (supervisors.length < 1) {
      throw new AppError(400, "至少需要1位监督者");
    }

    await tx.goal.update({ where: { id: goalId }, data: { status: "UPCOMING" }, select: { status: true } });

    await createFeedEvent(
      {
        eventType: "GOAL_STATUS_CHANGED",
        groupId: goal.groupId,
        metadata: {
          goalId,
          goalName: goal.name,
          fromStatus: "PENDING",
          toStatus: "UPCOMING",
        },
      },
      { prisma: tx }
    );

    await tx.goalParticipant.createMany({
      data: challengers.map((m: { id: number }) => ({ goalId, memberId: m.id })),
      skipDuplicates: true,
    });

    return { goalId, status: updatedConfirmation.status, goalStatus: "UPCOMING" };
  });
}

export async function listGroupGoals(
  groupId: number,
  userId: number,
  deps: { prisma: GoalPrismaClient }
): Promise<GoalResponse[]> {
  if (Number.isNaN(groupId)) {
    throw new AppError(400, "无效的小组 ID");
  }

  const membership = await deps.prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId } },
    select: { id: true },
  });
  if (!membership) {
    throw new AppError(403, "您不是该小组成员");
  }

  const goals = await deps.prisma.goal.findMany({
    where: { groupId },
    orderBy: { createdAt: "desc" },
  });

  return goals.map(mapGoalResponse);
}

export { getMaxAllowedMonths as _getMaxAllowedMonths, calculateDurationMonths as _calculateDurationMonths };
