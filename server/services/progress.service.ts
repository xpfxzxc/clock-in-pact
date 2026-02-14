import type { CheckinStatus, PrismaClient } from "@prisma/client";

import type { ChallengerContribution, ChallengerProgress, ContributionDay, LeaderboardEntry, ProgressResponse } from "../types/progress";
import { AppError } from "../utils/app-error";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ProgressPrismaClient = PrismaClient | any;

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
  status: string;
  group: {
    timezone: string;
  };
};

type MembershipRecord = {
  id: number;
  role: "CHALLENGER" | "SUPERVISOR";
  user: {
    nickname: string;
  };
};

type ChallengerRecord = {
  memberId: number;
  userId: number;
  nickname: string;
};

type CheckinRecord = {
  memberId: number;
  checkinDate: Date;
  value: DecimalLike | number;
  status: CheckinStatus;
};

type ChallengerSummary = ChallengerRecord & {
  completedValue: number;
  pendingReviewCount: number;
  disputedCount: number;
  contributionByDate: Map<string, ContributionDay>;
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

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    throw new AppError(500, "小组时区配置错误");
  }

  return `${year}-${month}-${day}`;
}

function getTodayDateStringInTimeZone(timeZone: string): string {
  return formatDateOnlyInTimeZone(new Date(), timeZone);
}

function buildDateRange(startDate: Date, endDate: Date): string[] {
  const range: string[] = [];
  const current = parseDateOnly(formatDateOnly(startDate), "目标日期格式错误");
  const end = parseDateOnly(formatDateOnly(endDate), "目标日期格式错误");

  while (current.getTime() <= end.getTime()) {
    range.push(formatDateOnly(current));
    current.setUTCDate(current.getUTCDate() + 1);
  }

  return range;
}

function calculatePercentage(completedValue: number, targetValue: number): number {
  if (targetValue <= 0) return 0;
  return (completedValue / targetValue) * 100;
}

function calculateRemainingValue(completedValue: number, targetValue: number): number {
  return Math.max(targetValue - completedValue, 0);
}

function calculateRemainingDays(endDate: Date, timeZone: string): number {
  const todayString = getTodayDateStringInTimeZone(timeZone);
  const todayDate = parseDateOnly(todayString, "日期格式错误");
  const goalEndDate = parseDateOnly(formatDateOnly(endDate), "日期格式错误");

  if (todayDate.getTime() > goalEndDate.getTime()) {
    return 0;
  }

  return Math.floor((goalEndDate.getTime() - todayDate.getTime()) / MS_PER_DAY) + 1;
}

function createEmptyContributionDay(date: string): ContributionDay {
  return {
    date,
    confirmedValue: 0,
    pendingValue: 0,
    disputedValue: 0,
  };
}

function mapMyProgress(summary: ChallengerSummary, targetValue: number): ChallengerProgress {
  return {
    memberId: summary.memberId,
    userId: summary.userId,
    nickname: summary.nickname,
    completedValue: summary.completedValue,
    percentage: calculatePercentage(summary.completedValue, targetValue),
    remainingValue: calculateRemainingValue(summary.completedValue, targetValue),
    pendingReviewCount: summary.pendingReviewCount,
    disputedCount: summary.disputedCount,
  };
}

function mapLeaderboard(summaries: ChallengerSummary[], targetValue: number): LeaderboardEntry[] {
  return summaries
    .map((summary) => ({
      memberId: summary.memberId,
      userId: summary.userId,
      nickname: summary.nickname,
      completedValue: summary.completedValue,
      percentage: calculatePercentage(summary.completedValue, targetValue),
    }))
    .sort((left, right) => {
      if (right.percentage !== left.percentage) return right.percentage - left.percentage;
      if (right.completedValue !== left.completedValue) return right.completedValue - left.completedValue;
      return left.memberId - right.memberId;
    })
    .map((entry, index) => ({
      rank: index + 1,
      ...entry,
    }));
}

function mapContributions(
  leaderboard: LeaderboardEntry[],
  summaryByMemberId: Map<number, ChallengerSummary>,
  dateRange: string[]
): ChallengerContribution[] {
  return leaderboard.map((entry) => {
    const summary = summaryByMemberId.get(entry.memberId);

    const days = dateRange.map((date) => {
      const day = summary?.contributionByDate.get(date);
      if (!day) return createEmptyContributionDay(date);
      return {
        date,
        confirmedValue: day.confirmedValue,
        pendingValue: day.pendingValue,
        disputedValue: day.disputedValue,
      };
    });

    return {
      memberId: entry.memberId,
      userId: entry.userId,
      nickname: entry.nickname,
      days,
    };
  });
}

export async function getProgress(
  goalId: number,
  userId: number,
  deps: { prisma: ProgressPrismaClient }
): Promise<ProgressResponse> {
  assertPositiveInteger(goalId, "无效的目标 ID");

  const goal = await deps.prisma.goal.findUnique({
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
      status: true,
      group: { select: { timezone: true } },
    },
  });

  if (!goal) {
    throw new AppError(404, "目标不存在");
  }

  if (goal.status !== "ACTIVE" && goal.status !== "SETTLING" && goal.status !== "ARCHIVED") {
    throw new AppError(400, "仅进行中、待结算或已归档的目标可查看进度");
  }

  const membership = await deps.prisma.groupMember.findUnique({
    where: {
      groupId_userId: {
        groupId: goal.groupId,
        userId,
      },
    },
    select: {
      id: true,
      role: true,
      user: {
        select: { nickname: true },
      },
    },
  });

  if (!membership) {
    throw new AppError(403, "您不是该小组成员");
  }

  const participants = await deps.prisma.goalParticipant.findMany({
    where: { goalId: goal.id },
    select: {
      memberId: true,
      member: {
        select: {
          userId: true,
          role: true,
          user: { select: { nickname: true } },
        },
      },
    },
    orderBy: { memberId: "asc" },
  });

  const challengers: ChallengerRecord[] = participants
    .filter((participant: { member: { role: string } }) => participant.member.role === "CHALLENGER")
    .map((participant: { memberId: number; member: { userId: number; user: { nickname: string } } }) => ({
      memberId: participant.memberId,
      userId: participant.member.userId,
      nickname: participant.member.user.nickname,
    }));

  const summaryByMemberId = new Map<number, ChallengerSummary>(
    challengers.map((challenger) => [
      challenger.memberId,
      {
        ...challenger,
        completedValue: 0,
        pendingReviewCount: 0,
        disputedCount: 0,
        contributionByDate: new Map<string, ContributionDay>(),
      },
    ])
  );

  const checkins: CheckinRecord[] = await deps.prisma.checkin.findMany({
    where: { goalId: goal.id },
    select: {
      memberId: true,
      checkinDate: true,
      value: true,
      status: true,
    },
  });

  let totalPendingReviewCount = 0;
  let totalDisputedCount = 0;

  for (const checkin of checkins) {
    const value = decimalToNumber(checkin.value);

    if (checkin.status === "PENDING_REVIEW") {
      totalPendingReviewCount += 1;
    } else if (checkin.status === "DISPUTED") {
      totalDisputedCount += 1;
    }

    const summary = summaryByMemberId.get(checkin.memberId);
    if (!summary) {
      continue;
    }

    const dayKey = formatDateOnly(checkin.checkinDate);
    const day = summary.contributionByDate.get(dayKey) ?? createEmptyContributionDay(dayKey);

    if (checkin.status === "CONFIRMED" || checkin.status === "AUTO_APPROVED") {
      summary.completedValue += value;
      day.confirmedValue += value;
    }

    if (checkin.status === "PENDING_REVIEW") {
      summary.pendingReviewCount += 1;
      day.pendingValue += value;
    }

    if (checkin.status === "DISPUTED") {
      summary.disputedCount += 1;
      day.disputedValue += value;
    }

    summary.contributionByDate.set(dayKey, day);
  }

  const targetValue = decimalToNumber(goal.targetValue);
  const summaries = Array.from(summaryByMemberId.values());
  const leaderboard = mapLeaderboard(summaries, targetValue);
  const dateRange = buildDateRange(goal.startDate, goal.endDate);
  const contributions = mapContributions(leaderboard, summaryByMemberId, dateRange);

  let myProgress: ChallengerProgress | null = null;
  if (membership.role === "CHALLENGER") {
    const mySummary = summaryByMemberId.get(membership.id);
    if (mySummary) {
      myProgress = mapMyProgress(mySummary, targetValue);
    } else {
      myProgress = {
        memberId: membership.id,
        userId,
        nickname: membership.user.nickname,
        completedValue: 0,
        percentage: calculatePercentage(0, targetValue),
        remainingValue: calculateRemainingValue(0, targetValue),
        pendingReviewCount: 0,
        disputedCount: 0,
      };
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
      status: goal.status,
    },
    remainingDays: goal.status === "SETTLING" || goal.status === "ARCHIVED"
      ? 0
      : calculateRemainingDays(goal.endDate, goal.group.timezone),
    totalPendingReviewCount,
    totalDisputedCount,
    myRole: membership.role,
    myMemberId: membership.id,
    myProgress,
    leaderboard,
    contributions,
  };
}

