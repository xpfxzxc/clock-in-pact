import type { PrismaClient } from "@prisma/client";

import type { ConfirmSettlementResponse, SettlementResultResponse } from "../types/settlement";
import { AppError } from "../utils/app-error";
import { createFeedEvent } from "./feed.service";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SettlementPrismaClient = PrismaClient | any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SettlementPrismaTransactionClient = any;

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
  status: string;
};

type ChallengerRecord = {
  memberId: number;
  userId: number;
  nickname: string;
};

function assertPositiveInteger(value: unknown, message: string): asserts value is number {
  if (typeof value !== "number" || Number.isNaN(value) || !Number.isInteger(value) || value <= 0) {
    throw new AppError(400, message);
  }
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

function formatDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function calculatePercentage(completedValue: number, targetValue: number): number {
  if (targetValue <= 0) return 0;
  return (completedValue / targetValue) * 100;
}

function getMaxAllowedMonths(completionCount: number): number {
  if (completionCount >= 6) return 12;
  if (completionCount >= 4) return 6;
  if (completionCount >= 2) return 3;
  if (completionCount >= 1) return 2;
  return 1;
}

function isPrismaUniqueConstraintError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  return (error as { code?: unknown }).code === "P2002";
}

function sumCompletedValues(
  checkins: Array<{ memberId: number; value: DecimalLike | number }>,
  challengers: ChallengerRecord[]
): Map<number, number> {
  const result = new Map<number, number>(challengers.map((challenger) => [challenger.memberId, 0]));
  for (const checkin of checkins) {
    result.set(checkin.memberId, (result.get(checkin.memberId) ?? 0) + decimalToNumber(checkin.value));
  }
  return result;
}

async function settleAndArchiveIfReady(
  goalId: number,
  deps: { prisma: SettlementPrismaClient }
): Promise<boolean> {
  return deps.prisma.$transaction(async (tx: SettlementPrismaTransactionClient) => {
    const goal: GoalRecord | null = await tx.goal.findUnique({
      where: { id: goalId },
      select: {
        id: true,
        groupId: true,
        name: true,
        category: true,
        targetValue: true,
        unit: true,
        startDate: true,
        endDate: true,
        rewardPunishment: true,
        status: true,
      },
    });

    if (!goal) {
      throw new AppError(404, "目标不存在");
    }

    if (goal.status === "ARCHIVED") {
      return true;
    }

    if (goal.status !== "SETTLING") {
      return false;
    }

    const pendingReviewCount = await tx.checkin.count({
      where: {
        goalId,
        status: "PENDING_REVIEW",
      },
    });
    if (pendingReviewCount > 0) {
      return false;
    }

    const supervisors = await tx.groupMember.findMany({
      where: { groupId: goal.groupId, role: "SUPERVISOR" },
      select: { id: true },
    });
    if (supervisors.length < 1) {
      throw new AppError(400, "至少需要1位监督者");
    }

    const confirmedCount = await tx.settlementConfirmation.count({
      where: { goalId },
    });
    if (confirmedCount < supervisors.length) {
      return false;
    }

    // CAS 更新，确保并发下只有一个事务会执行结算累加与归档事件。
    const archiveResult = await tx.goal.updateMany({
      where: {
        id: goal.id,
        status: "SETTLING",
      },
      data: { status: "ARCHIVED" },
    });
    if (archiveResult.count < 1) {
      return true;
    }

    const challengers: ChallengerRecord[] = await tx.goalParticipant.findMany({
      where: {
        goalId,
        member: { role: "CHALLENGER" },
      },
      select: {
        memberId: true,
        member: {
          select: {
            userId: true,
            user: { select: { nickname: true } },
          },
        },
      },
      orderBy: { memberId: "asc" },
    }).then(
      (
        rows: Array<{ memberId: number; member: { userId: number; user: { nickname: string } } }>
      ) =>
        rows.map((row) => ({
          memberId: row.memberId,
          userId: row.member.userId,
          nickname: row.member.user.nickname,
        }))
    );

    const challengerMemberIds = challengers.map((challenger) => challenger.memberId);
    const completedCheckins: Array<{ memberId: number; value: DecimalLike | number }> =
      challengerMemberIds.length === 0
        ? []
        : await tx.checkin.findMany({
            where: {
              goalId,
              memberId: { in: challengerMemberIds },
              status: { in: ["CONFIRMED", "AUTO_APPROVED"] },
            },
            select: {
              memberId: true,
              value: true,
            },
          });

    const completedByMemberId = sumCompletedValues(completedCheckins, challengers);
    const targetValue = decimalToNumber(goal.targetValue);
    const durationUnlockedEvents: Array<{
      goalId: number;
      goalName: string;
      userId: number;
      challengerNickname: string;
      category: string;
      fromMaxMonths: number;
      toMaxMonths: number;
    }> = [];

    for (const challenger of challengers) {
      const completedValue = completedByMemberId.get(challenger.memberId) ?? 0;
      if (completedValue < targetValue) {
        continue;
      }

      await tx.categoryCompletion.upsert({
        where: {
          groupId_userId_category: {
            groupId: goal.groupId,
            userId: challenger.userId,
            category: goal.category,
          },
        },
        create: {
          groupId: goal.groupId,
          userId: challenger.userId,
          category: goal.category,
          completionCount: 1,
        },
        update: {
          completionCount: { increment: 1 },
        },
      });

      const completionCount = Number(
        (
          await tx.categoryCompletion.findUnique({
            where: {
              groupId_userId_category: {
                groupId: goal.groupId,
                userId: challenger.userId,
                category: goal.category,
              },
            },
            select: { completionCount: true },
          })
        )?.completionCount ?? 0
      );
      const fromMaxMonths = getMaxAllowedMonths(Math.max(0, completionCount - 1));
      const toMaxMonths = getMaxAllowedMonths(completionCount);

      if (toMaxMonths > fromMaxMonths) {
        durationUnlockedEvents.push({
          goalId: goal.id,
          goalName: goal.name,
          userId: challenger.userId,
          challengerNickname: challenger.nickname,
          category: goal.category,
          fromMaxMonths,
          toMaxMonths,
        });
      }
    }

    await createFeedEvent(
      {
        eventType: "SETTLEMENT_COMPLETED",
        groupId: goal.groupId,
        metadata: {
          goalId: goal.id,
          goalName: goal.name,
        },
      },
      { prisma: tx }
    );

    for (const event of durationUnlockedEvents) {
      await createFeedEvent(
        {
          eventType: "DURATION_UNLOCKED",
          groupId: goal.groupId,
          metadata: event,
        },
        { prisma: tx }
      );
    }

    await createFeedEvent(
      {
        eventType: "GOAL_STATUS_CHANGED",
        groupId: goal.groupId,
        metadata: {
          goalId: goal.id,
          goalName: goal.name,
          fromStatus: "SETTLING",
          toStatus: "ARCHIVED",
        },
      },
      { prisma: tx }
    );

    return true;
  });
}

export async function confirmSettlement(
  goalId: number,
  userId: number,
  deps: { prisma: SettlementPrismaClient }
): Promise<ConfirmSettlementResponse> {
  assertPositiveInteger(goalId, "无效的目标 ID");

  await deps.prisma.$transaction(async (tx: SettlementPrismaTransactionClient) => {
    const goal: GoalRecord | null = await tx.goal.findUnique({
      where: { id: goalId },
      select: {
        id: true,
        groupId: true,
        name: true,
        category: true,
        targetValue: true,
        unit: true,
        startDate: true,
        endDate: true,
        rewardPunishment: true,
        status: true,
      },
    });

    if (!goal) {
      throw new AppError(404, "目标不存在");
    }

    if (goal.status !== "SETTLING") {
      throw new AppError(400, "仅待结算状态的目标可确认结算");
    }

    const member = await tx.groupMember.findUnique({
      where: { groupId_userId: { groupId: goal.groupId, userId } },
      select: { id: true, role: true },
    });
    if (!member) {
      throw new AppError(403, "您不是该小组成员");
    }
    if (member.role !== "SUPERVISOR") {
      throw new AppError(403, "仅监督者可确认结算");
    }

    const pendingReviewCount = await tx.checkin.count({
      where: {
        goalId,
        status: "PENDING_REVIEW",
      },
    });
    if (pendingReviewCount > 0) {
      throw new AppError(400, "仍有待审核的打卡记录，请先完成审核");
    }

    const existingConfirmation = await tx.settlementConfirmation.findUnique({
      where: { goalId_memberId: { goalId, memberId: member.id } },
      select: { id: true },
    });
    if (existingConfirmation) {
      throw new AppError(400, "您已确认过结算");
    }

    try {
      await tx.settlementConfirmation.create({
        data: {
          goalId,
          memberId: member.id,
        },
      });
    } catch (error) {
      if (isPrismaUniqueConstraintError(error)) {
        throw new AppError(400, "您已确认过结算");
      }
      throw error;
    }

    await createFeedEvent(
      {
        eventType: "SETTLEMENT_CONFIRMED",
        actorId: userId,
        groupId: goal.groupId,
        metadata: {
          goalId: goal.id,
          goalName: goal.name,
        },
      },
      { prisma: tx }
    );
  });

  const archived = await settleAndArchiveIfReady(goalId, deps);
  return { goalId, archived };
}

export async function getSettlementResult(
  goalId: number,
  userId: number,
  deps: { prisma: SettlementPrismaClient }
): Promise<SettlementResultResponse> {
  assertPositiveInteger(goalId, "无效的目标 ID");

  const goal: GoalRecord | null = await deps.prisma.goal.findUnique({
    where: { id: goalId },
    select: {
      id: true,
      groupId: true,
      name: true,
      category: true,
      targetValue: true,
      unit: true,
      startDate: true,
      endDate: true,
      rewardPunishment: true,
      status: true,
    },
  });
  if (!goal) {
    throw new AppError(404, "目标不存在");
  }

  if (goal.status !== "SETTLING" && goal.status !== "ARCHIVED") {
    throw new AppError(400, "仅待结算或已归档的目标可查看结算结果");
  }

  const membership = await deps.prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId: goal.groupId, userId } },
    select: { id: true },
  });
  if (!membership) {
    throw new AppError(403, "您不是该小组成员");
  }

  const challengers: ChallengerRecord[] = await deps.prisma.goalParticipant.findMany({
    where: {
      goalId,
      member: { role: "CHALLENGER" },
    },
    select: {
      memberId: true,
      member: {
        select: {
          userId: true,
          user: { select: { nickname: true } },
        },
      },
    },
    orderBy: { memberId: "asc" },
  }).then(
    (
      rows: Array<{ memberId: number; member: { userId: number; user: { nickname: string } } }>
    ) =>
      rows.map((row) => ({
        memberId: row.memberId,
        userId: row.member.userId,
        nickname: row.member.user.nickname,
      }))
  );

  const challengerMemberIds = challengers.map((challenger) => challenger.memberId);
  const completedCheckins: Array<{ memberId: number; value: DecimalLike | number }> =
    challengerMemberIds.length === 0
      ? []
      : await deps.prisma.checkin.findMany({
          where: {
            goalId,
            memberId: { in: challengerMemberIds },
            status: { in: ["CONFIRMED", "AUTO_APPROVED"] },
          },
          select: {
            memberId: true,
            value: true,
          },
        });
  const completedByMemberId = sumCompletedValues(completedCheckins, challengers);
  const targetValue = decimalToNumber(goal.targetValue);

  const supervisors = await deps.prisma.groupMember.findMany({
    where: {
      groupId: goal.groupId,
      role: "SUPERVISOR",
    },
    select: {
      id: true,
      userId: true,
      user: { select: { nickname: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const confirmations = await deps.prisma.settlementConfirmation.findMany({
    where: { goalId },
    select: {
      memberId: true,
      createdAt: true,
    },
  });
  const confirmationByMemberId = new Map<number, Date>(
    confirmations.map((confirmation: { memberId: number; createdAt: Date }) => [
      confirmation.memberId,
      confirmation.createdAt,
    ])
  );

  const pendingReviewCount = await deps.prisma.checkin.count({
    where: {
      goalId,
      status: "PENDING_REVIEW",
    },
  });

  const results = challengers.map((challenger) => {
    const completedValue = completedByMemberId.get(challenger.memberId) ?? 0;
    return {
      memberId: challenger.memberId,
      userId: challenger.userId,
      nickname: challenger.nickname,
      completedValue,
      percentage: calculatePercentage(completedValue, targetValue),
      achieved: completedValue >= targetValue,
    };
  });

  if (goal.status === "ARCHIVED") {
    const challengerUserIds = challengers.map((challenger) => challenger.userId);
    const completionRows =
      challengerUserIds.length === 0
        ? []
        : await deps.prisma.categoryCompletion.findMany({
            where: {
              groupId: goal.groupId,
              category: goal.category,
              userId: { in: challengerUserIds },
            },
            select: {
              userId: true,
              completionCount: true,
            },
          });

    const completionByUserId = new Map<number, number>(
      completionRows.map((row: { userId: number; completionCount: number }) => [row.userId, row.completionCount])
    );

    for (const item of results) {
      if (!item.achieved) {
        continue;
      }
      const completionCount = completionByUserId.get(item.userId);
      if (completionCount === undefined) {
        continue;
      }
      item.unlockedMaxMonths = getMaxAllowedMonths(completionCount);
    }
  }

  return {
    goal: {
      id: goal.id,
      name: goal.name,
      category: goal.category,
      targetValue,
      unit: goal.unit,
      startDate: formatDateOnly(goal.startDate),
      endDate: formatDateOnly(goal.endDate),
      rewardPunishment: goal.rewardPunishment,
      status: goal.status,
    },
    results,
    settlementProgress: {
      confirmed: supervisors.filter((supervisor: { id: number }) => confirmationByMemberId.has(supervisor.id)).length,
      total: supervisors.length,
      confirmations: supervisors.map((supervisor: { id: number; userId: number; user: { nickname: string } }) => {
        const confirmedAt = confirmationByMemberId.get(supervisor.id);
        return {
          memberId: supervisor.id,
          userId: supervisor.userId,
          nickname: supervisor.user.nickname,
          confirmed: Boolean(confirmedAt),
          confirmedAt: confirmedAt?.toISOString(),
        };
      }),
    },
    hasPendingCheckins: pendingReviewCount > 0,
  };
}
