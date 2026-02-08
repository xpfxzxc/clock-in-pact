import type { ConfirmationStatus, MemberRole } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import type {
  CreateGoalChangeRequestRequest,
  GoalChangeRequestStatus,
  GoalChangeRequestResponse,
  GoalChangeVoteInfo,
  GoalProposedChanges,
  VoteGoalChangeRequestResponse,
} from "../types/goal-change-request";
import { AppError } from "../utils/app-error";
import { getGoalChangeRequestEffectiveExpiresAt } from "../utils/goal-change-request-deadline";

const GOAL_NAME_MAX_LENGTH = 50;
const GOAL_CATEGORY_MAX_LENGTH = 20;
const GOAL_UNIT_MAX_LENGTH = 10;
const GOAL_REWARD_PUNISHMENT_MAX_LENGTH = 200;
const GOAL_EVIDENCE_REQUIREMENT_MAX_LENGTH = 200;
const CHANGE_REQUEST_EXPIRY_HOURS = 24;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type GoalChangeRequestPrismaClient = PrismaClient | any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type GoalChangeRequestTransactionClient = any;

export type GoalChangeRequestDeps = {
  prisma: GoalChangeRequestPrismaClient;
  now?: () => Date;
};

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
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;
  if (!year || !month || !day) {
    throw new AppError(500, "小组时区配置错误");
  }
  return `${year}-${month}-${day}`;
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

function mapChangeRequestResponse(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  request: any,
  userId: number
): GoalChangeRequestResponse {
  const votes: GoalChangeVoteInfo[] = (request.votes ?? []).map(
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
  const effectiveExpiresAt = getGoalChangeRequestEffectiveExpiresAt({
    type: request.type,
    expiresAt: request.expiresAt,
    proposedChanges: request.proposedChanges,
    timezone: request.goal?.group?.timezone,
  });

  return {
    id: request.id,
    goalId: request.goalId,
    type: request.type,
    status: request.status,
    initiatorId: request.initiatorId,
    initiatorNickname: request.initiator.user.nickname,
    proposedChanges: request.proposedChanges as GoalProposedChanges | null,
    expiresAt: request.expiresAt.toISOString(),
    effectiveExpiresAt: effectiveExpiresAt.toISOString(),
    votes,
    myVoteStatus: myVote?.status as ConfirmationStatus | undefined,
    createdAt: request.createdAt.toISOString(),
  };
}

function isExpiredByEffectiveDeadline(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  request: any,
  now: Date
): boolean {
  const effectiveExpiresAt = getGoalChangeRequestEffectiveExpiresAt({
    type: request.type,
    expiresAt: request.expiresAt,
    proposedChanges: request.proposedChanges,
    timezone: request.goal?.group?.timezone,
  });

  return effectiveExpiresAt.getTime() <= now.getTime();
}

function validateProposedChanges(changes: GoalProposedChanges): void {
  if (changes.name !== undefined) {
    if (typeof changes.name !== "string" || !changes.name.trim()) {
      throw new AppError(400, "目标名称不能为空");
    }
    if (changes.name.trim().length > GOAL_NAME_MAX_LENGTH) {
      throw new AppError(400, "目标名称不能为空");
    }
  }
  if (changes.category !== undefined) {
    if (typeof changes.category !== "string" || !changes.category.trim()) {
      throw new AppError(400, "目标类别不能为空");
    }
    if (changes.category.trim().length > GOAL_CATEGORY_MAX_LENGTH) {
      throw new AppError(400, "目标类别不能为空");
    }
  }
  if (changes.targetValue !== undefined) {
    if (typeof changes.targetValue !== "number" || Number.isNaN(changes.targetValue)) {
      throw new AppError(400, "目标数值无效");
    }
    if (changes.targetValue <= 0) {
      throw new AppError(400, "目标数值必须大于0");
    }
  }
  if (changes.unit !== undefined) {
    if (typeof changes.unit !== "string" || !changes.unit.trim()) {
      throw new AppError(400, "单位不能为空");
    }
    if (changes.unit.trim().length > GOAL_UNIT_MAX_LENGTH) {
      throw new AppError(400, "单位不能为空");
    }
  }
  if (changes.rewardPunishment !== undefined) {
    if (typeof changes.rewardPunishment !== "string" || !changes.rewardPunishment.trim()) {
      throw new AppError(400, "奖惩规则不能为空");
    }
    if (changes.rewardPunishment.trim().length > GOAL_REWARD_PUNISHMENT_MAX_LENGTH) {
      throw new AppError(400, "奖惩规则不能为空");
    }
  }
  if (changes.evidenceRequirement !== undefined) {
    if (typeof changes.evidenceRequirement !== "string" || !changes.evidenceRequirement.trim()) {
      throw new AppError(400, "证据要求不能为空");
    }
    if (changes.evidenceRequirement.trim().length > GOAL_EVIDENCE_REQUIREMENT_MAX_LENGTH) {
      throw new AppError(400, "证据要求不能为空");
    }
  }
  if (changes.startDate !== undefined) {
    parseDateOnly(changes.startDate, "开始日期格式错误");
  }
  if (changes.endDate !== undefined) {
    parseDateOnly(changes.endDate, "结束日期格式错误");
  }
}

async function applyGoalChangeRequest(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  request: any,
  tx: GoalChangeRequestTransactionClient
): Promise<void> {
  const goal = await tx.goal.findUnique({
    where: { id: request.goalId },
    select: {
      id: true,
      groupId: true,
      status: true,
      startDate: true,
      endDate: true,
      name: true,
      category: true,
      targetValue: true,
      unit: true,
      rewardPunishment: true,
      evidenceRequirement: true,
    },
  });

  if (!goal) {
    throw new AppError(404, "目标不存在");
  }

  if (request.type === "CANCEL") {
    await tx.goal.update({
      where: { id: goal.id },
      data: { status: "CANCELLED" },
    });
    // TODO: 已有打卡记录保留，标记为"已取消目标的记录"，不计入成绩（US-07 之后实现）
  } else {
    // MODIFY
    const changes = request.proposedChanges as GoalProposedChanges;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateData: any = {};

    if (changes.name !== undefined) updateData.name = changes.name.trim();
    if (changes.category !== undefined) updateData.category = changes.category.trim();
    if (changes.targetValue !== undefined) updateData.targetValue = changes.targetValue;
    if (changes.unit !== undefined) updateData.unit = changes.unit.trim();
    if (changes.startDate !== undefined) updateData.startDate = parseDateOnly(changes.startDate, "开始日期格式错误");
    if (changes.endDate !== undefined) updateData.endDate = parseDateOnly(changes.endDate, "结束日期格式错误");
    if (changes.rewardPunishment !== undefined) updateData.rewardPunishment = changes.rewardPunishment.trim();
    if (changes.evidenceRequirement !== undefined) updateData.evidenceRequirement = changes.evidenceRequirement.trim();

    if (Object.keys(updateData).length > 0) {
      await tx.goal.update({
        where: { id: goal.id },
        data: updateData,
      });
    }

    if (goal.status === "PENDING") {
      // 删除所有确认，重新为全员创建（全部 PENDING）
      await tx.goalConfirmation.deleteMany({ where: { goalId: goal.id } });
      const members = await tx.groupMember.findMany({
        where: { groupId: goal.groupId },
        select: { id: true },
      });
      await tx.goalConfirmation.createMany({
        data: members.map((m: { id: number }) => ({
          goalId: goal.id,
          memberId: m.id,
          status: "PENDING" as const,
        })),
      });
    } else if (goal.status === "UPCOMING") {
      // 状态回退为 PENDING
      await tx.goal.update({
        where: { id: goal.id },
        data: { status: "PENDING" },
      });
      // 删除所有确认，重新为全员创建
      await tx.goalConfirmation.deleteMany({ where: { goalId: goal.id } });
      const members = await tx.groupMember.findMany({
        where: { groupId: goal.groupId },
        select: { id: true },
      });
      await tx.goalConfirmation.createMany({
        data: members.map((m: { id: number }) => ({
          goalId: goal.id,
          memberId: m.id,
          status: "PENDING" as const,
        })),
      });
      // 删除所有参与者
      await tx.goalParticipant.deleteMany({ where: { goalId: goal.id } });
    }
    // ACTIVE: 只更新字段（不含 startDate），无需重置确认/参与者
  }

  await tx.goalChangeRequest.update({
    where: { id: request.id },
    data: { status: "APPROVED" },
  });
}

export async function createGoalChangeRequest(
  body: CreateGoalChangeRequestRequest,
  userId: number,
  deps: GoalChangeRequestDeps
): Promise<GoalChangeRequestResponse> {
  const now = deps.now?.() ?? new Date();

  if (body.type !== "MODIFY" && body.type !== "CANCEL") {
    throw new AppError(400, "无效的请求类型");
  }

  return deps.prisma.$transaction(async (tx: GoalChangeRequestTransactionClient) => {
    const goal = await tx.goal.findUnique({
      where: { id: body.goalId },
      select: {
        id: true,
        groupId: true,
        status: true,
        startDate: true,
        endDate: true,
        category: true,
      },
    });

    if (!goal) {
      throw new AppError(404, "目标不存在");
    }

    if (!["PENDING", "UPCOMING", "ACTIVE"].includes(goal.status)) {
      throw new AppError(400, "当前目标状态不允许发起修改/取消请求");
    }

    const member = await tx.groupMember.findUnique({
      where: { groupId_userId: { groupId: goal.groupId, userId } },
      select: { id: true },
    });
    if (!member) {
      throw new AppError(403, "您不是该小组成员");
    }

    // 先清理本目标已过期的请求，确保“过期后可立即重新发起”
    await tx.goalChangeRequest.updateMany({
      where: {
        goalId: body.goalId,
        status: "PENDING",
        expiresAt: { lte: now },
      },
      data: { status: "EXPIRED" },
    });

    // 场景10/12：新开始日期或新结束日期到达后即视为过期（不依赖定时任务）
    const pendingRequestsWithFutureExpiresAt = await tx.goalChangeRequest.findMany({
      where: {
        goalId: body.goalId,
        status: "PENDING",
        expiresAt: { gt: now },
      },
      select: {
        id: true,
        type: true,
        expiresAt: true,
        proposedChanges: true,
        goal: { select: { group: { select: { timezone: true } } } },
      },
    });

    const expiredByEffectiveDeadlineIds = pendingRequestsWithFutureExpiresAt
      .filter((request: { id: number }) => isExpiredByEffectiveDeadline(request, now))
      .map((request: { id: number }) => request.id);

    if (expiredByEffectiveDeadlineIds.length > 0) {
      await tx.goalChangeRequest.updateMany({
        where: {
          id: { in: expiredByEffectiveDeadlineIds },
          status: "PENDING",
        },
        data: { status: "EXPIRED" },
      });
    }

    const existingRequest = await tx.goalChangeRequest.findFirst({
      where: {
        goalId: body.goalId,
        status: "PENDING",
        expiresAt: { gt: now },
      },
      select: { id: true },
    });
    if (existingRequest) {
      throw new AppError(400, "当前已有待确认的修改/取消请求，请等待结果后再操作");
    }

    if (body.type === "MODIFY") {
      if (!body.proposedChanges || Object.keys(body.proposedChanges).length === 0) {
        throw new AppError(400, "修改请求必须包含修改内容");
      }

      validateProposedChanges(body.proposedChanges);

      if (goal.status === "ACTIVE" && body.proposedChanges.startDate !== undefined) {
        throw new AppError(400, "进行中的目标不可修改开始日期");
      }

      // ACTIVE：若修改结束日期，须为未来日期（小组时区）
      if (goal.status === "ACTIVE" && body.proposedChanges.endDate !== undefined) {
        const group = await tx.group.findUnique({
          where: { id: goal.groupId },
          select: { timezone: true },
        });
        if (!group) throw new AppError(404, "小组不存在");
        const todayStr = formatDateOnlyInTimeZone(now, group.timezone);
        if (body.proposedChanges.endDate <= todayStr) {
          throw new AppError(400, "结束日期必须是未来日期");
        }
      }

      // 校验 startDate 须为未来日期（PENDING/UPCOMING）
      if (body.proposedChanges.startDate !== undefined && goal.status !== "ACTIVE") {
        const group = await tx.group.findUnique({
          where: { id: goal.groupId },
          select: { timezone: true },
        });
        if (!group) throw new AppError(404, "小组不存在");
        const todayStr = formatDateOnlyInTimeZone(now, group.timezone);
        if (body.proposedChanges.startDate <= todayStr) {
          throw new AppError(400, "开始日期必须是未来日期");
        }
      }

      // 时长阶梯校验
      const proposedStartDate = body.proposedChanges.startDate
        ? parseDateOnly(body.proposedChanges.startDate, "开始日期格式错误")
        : goal.startDate;
      const proposedEndDate = body.proposedChanges.endDate
        ? parseDateOnly(body.proposedChanges.endDate, "结束日期格式错误")
        : goal.endDate;

      if (proposedEndDate.getTime() < proposedStartDate.getTime()) {
        throw new AppError(400, "结束日期不能早于开始日期");
      }

      const proposedCategory = body.proposedChanges.category?.trim() ?? goal.category;
      const durationMonths = calculateDurationMonths(proposedStartDate, proposedEndDate);

      const challengers = await tx.groupMember.findMany({
        where: { groupId: goal.groupId, role: "CHALLENGER" },
        select: { userId: true },
      });

      if (challengers.length > 0) {
        const completions = await tx.categoryCompletion.findMany({
          where: {
            groupId: goal.groupId,
            category: proposedCategory,
            userId: { in: challengers.map((c: { userId: number }) => c.userId) },
          },
        });
        const completionMap = new Map<number, number>(
          completions.map((c: { userId: number; completionCount: number }) => [c.userId, c.completionCount])
        );
        const allowedMonths = Math.min(
          ...challengers.map((c: { userId: number }) => getMaxAllowedMonths(completionMap.get(c.userId) ?? 0))
        );
        if (durationMonths > allowedMonths) {
          throw new AppError(400, `修改后时长超出限制，最长可设置${allowedMonths}个月`);
        }
      }
    }

    const expiresAt = new Date(now.getTime() + CHANGE_REQUEST_EXPIRY_HOURS * 60 * 60 * 1000);

    const changeRequest = await tx.goalChangeRequest.create({
      data: {
        goalId: body.goalId,
        type: body.type,
        status: "PENDING",
        initiatorId: member.id,
        proposedChanges: body.type === "MODIFY" ? (body.proposedChanges as object) : undefined,
        expiresAt,
      },
    });

    const members = await tx.groupMember.findMany({
      where: { groupId: goal.groupId },
      select: { id: true },
    });

    await tx.goalChangeVote.createMany({
      data: members.map((m: { id: number }) => ({
        requestId: changeRequest.id,
        memberId: m.id,
        status: m.id === member.id ? "APPROVED" : "PENDING",
      })),
    });

    // 若发起人自动同意后已全员通过（如单人小组）
    if (members.length === 1) {
      await applyGoalChangeRequest(changeRequest, tx);
    }

    // 重新查询完整数据
    const result = await tx.goalChangeRequest.findUnique({
      where: { id: changeRequest.id },
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

    return mapChangeRequestResponse(result, userId);
  });
}

export async function voteGoalChangeRequest(
  requestId: number,
  userId: number,
  status: "APPROVED" | "REJECTED",
  deps: GoalChangeRequestDeps
): Promise<VoteGoalChangeRequestResponse> {
  const now = deps.now?.() ?? new Date();

  if (status !== "APPROVED" && status !== "REJECTED") {
    throw new AppError(400, "无效的投票状态");
  }

  return deps.prisma.$transaction(async (tx: GoalChangeRequestTransactionClient) => {
    const request = await tx.goalChangeRequest.findUnique({
      where: { id: requestId },
      include: {
        goal: {
          select: {
            groupId: true,
            group: { select: { timezone: true } },
          },
        },
      },
    });

    if (!request) {
      throw new AppError(404, "请求不存在");
    }

    if (request.status !== "PENDING") {
      throw new AppError(400, "该请求已结束");
    }

    if (isExpiredByEffectiveDeadline(request, now)) {
      await tx.goalChangeRequest.update({
        where: { id: requestId },
        data: { status: "EXPIRED" },
      });
      throw new AppError(400, "请求已过期");
    }

    const member = await tx.groupMember.findUnique({
      where: { groupId_userId: { groupId: request.goal.groupId, userId } },
      select: { id: true },
    });
    if (!member) {
      throw new AppError(403, "您不是该小组成员");
    }

    const vote = await tx.goalChangeVote.findUnique({
      where: { requestId_memberId: { requestId, memberId: member.id } },
      select: { status: true },
    });
    if (!vote) {
      throw new AppError(403, "您没有该请求的投票记录");
    }
    if (vote.status !== "PENDING") {
      throw new AppError(400, "您已投过票");
    }

    await tx.goalChangeVote.update({
      where: { requestId_memberId: { requestId, memberId: member.id } },
      data: { status },
    });

    if (status === "REJECTED") {
      await tx.goalChangeRequest.update({
        where: { id: requestId },
        data: { status: "REJECTED" },
      });
      return {
        requestId,
        voteStatus: status as ConfirmationStatus,
        requestStatus: "REJECTED" as GoalChangeRequestStatus,
      };
    }

    // APPROVED: 检查是否全员通过
    const currentMembers = await tx.groupMember.findMany({
      where: { groupId: request.goal.groupId },
      select: { id: true },
    });
    const currentMemberIds = new Set(currentMembers.map((m: { id: number }) => m.id));

    const allVotes = await tx.goalChangeVote.findMany({
      where: { requestId },
      select: { memberId: true, status: true },
    });

    const allCurrentApproved = currentMembers.every((m: { id: number }) => {
      const v = allVotes.find((vote: { memberId: number }) => vote.memberId === m.id);
      return v && v.status === "APPROVED";
    });

    if (allCurrentApproved) {
      await applyGoalChangeRequest(request, tx);
      return {
        requestId,
        voteStatus: status as ConfirmationStatus,
        requestStatus: "APPROVED" as GoalChangeRequestStatus,
      };
    }

    return {
      requestId,
      voteStatus: status as ConfirmationStatus,
      requestStatus: "PENDING" as GoalChangeRequestStatus,
    };
  });
}

export async function getActiveChangeRequest(
  goalId: number,
  userId: number,
  deps: GoalChangeRequestDeps
): Promise<GoalChangeRequestResponse | null> {
  const now = deps.now?.() ?? new Date();

  if (Number.isNaN(goalId)) {
    throw new AppError(400, "无效的目标 ID");
  }

  const goal = await deps.prisma.goal.findUnique({
    where: { id: goalId },
    select: { id: true, groupId: true },
  });
  if (!goal) {
    throw new AppError(404, "目标不存在");
  }

  const member = await deps.prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId: goal.groupId, userId } },
    select: { id: true },
  });
  if (!member) {
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

  const request = await deps.prisma.goalChangeRequest.findFirst({
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

  if (!request) return null;

  if (isExpiredByEffectiveDeadline(request, now)) {
    await deps.prisma.goalChangeRequest.update({
      where: { id: request.id },
      data: { status: "EXPIRED" },
    });
    return null;
  }

  return mapChangeRequestResponse(request, userId);
}
