import type { PrismaClient } from "@prisma/client";
import { createFeedEvent } from "./feed.service";

export type SchedulerPrismaClient =
  | PrismaClient
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  | any;

type Logger = Pick<Console, "info" | "warn" | "error">;

export type GoalStatusSchedulerDeps = {
  prisma: SchedulerPrismaClient;
  logger?: Partial<Logger>;
  now?: () => Date;
};

export type GoalStatusSchedulerTickResult = {
  activatedCount: number;
  settlingCount: number;
  voidedCount: number;
  expiredChangeRequestCount: number;
  voidedChangeRequestCount: number;
  autoApprovedCheckinCount: number;
  checkedGroupCount: number;
  checkedTimezoneCount: number;
  processedTimezoneCount: number;
};

type CronTask = {
  stop: () => void;
};

function parseDateOnly(dateString: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    throw new Error("Invalid date-only string");
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
    throw new Error("Invalid date-only string");
  }
  return parsed;
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
    throw new Error("Invalid timezone");
  }
  return `${year}-${month}-${day}`;
}

function getTomorrowUtcMidnight(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
}

function getTodayUtcDateForTimeZone(now: Date, timeZone: string): Date | null {
  try {
    const dateString = formatDateOnlyInTimeZone(now, timeZone);
    return parseDateOnly(dateString);
  } catch {
    return null;
  }
}

function groupIdsByTimezone(groups: Array<{ id: number; timezone: string }>): Map<string, number[]> {
  const result = new Map<string, number[]>();
  for (const group of groups) {
    const timezone = typeof group.timezone === "string" && group.timezone.trim() ? group.timezone : "UTC";
    const list = result.get(timezone);
    if (list) {
      list.push(group.id);
    } else {
      result.set(timezone, [group.id]);
    }
  }
  return result;
}

export async function runGoalStatusSchedulerTick(deps: GoalStatusSchedulerDeps): Promise<GoalStatusSchedulerTickResult> {
  const now = deps.now?.() ?? new Date();
  const tomorrowUtcMidnight = getTomorrowUtcMidnight(now);

  // 修改请求中新开始/结束日期到达后自动过期（独立于 24h 超时；以先到者为准）
  const pendingModifyRequests = await deps.prisma.goalChangeRequest.findMany({
    where: { status: "PENDING", type: "MODIFY" },
    select: {
      id: true,
      expiresAt: true,
      proposedChanges: true,
      goal: { select: { group: { select: { timezone: true } } } },
    },
  });

  const reachedProposedDateRequestIds: number[] = [];
  for (const request of pendingModifyRequests) {
    const changes = request.proposedChanges as Record<string, unknown> | null;
    const proposedStartDate = typeof changes?.startDate === "string" ? changes.startDate : null;
    const proposedEndDate = typeof changes?.endDate === "string" ? changes.endDate : null;
    const proposedDate = proposedStartDate ?? proposedEndDate;
    if (!proposedDate) {
      continue;
    }

    const timeZone = request.goal?.group?.timezone ?? "UTC";
    const todayDate = getTodayUtcDateForTimeZone(now, timeZone);
    if (!todayDate) {
      deps.logger?.error?.(`[scheduler] Invalid timezone "${timeZone}", skip request ${request.id}.`);
      continue;
    }

    let proposedDateUtc: Date;
    try {
      proposedDateUtc = parseDateOnly(proposedDate);
    } catch {
      deps.logger?.error?.(`[scheduler] Invalid proposed date in request ${request.id}, skip.`);
      continue;
    }

    if (proposedDateUtc.getTime() > todayDate.getTime()) {
      continue;
    }

    // 若超时也已到，按“先到者为准”判断：
    // - 超时时区日期早于新提议日期：EXPIRED 先发生
    // - 其他情况（同日或更晚）：新提议日期先/同时发生，过期请求
    if (request.expiresAt.getTime() <= now.getTime()) {
      const expiresDateInGroup = formatDateOnlyInTimeZone(request.expiresAt, timeZone);
      if (expiresDateInGroup < proposedDate) {
        continue;
      }
    }

    reachedProposedDateRequestIds.push(request.id);
  }

  const expiredByProposedDate = reachedProposedDateRequestIds.length
    ? await deps.prisma.goalChangeRequest.updateMany({
        where: { id: { in: reachedProposedDateRequestIds }, status: "PENDING" },
        data: { status: "EXPIRED" },
      })
    : { count: 0 };

  const expiredByProposedDateRequests = reachedProposedDateRequestIds.length
    ? await deps.prisma.goalChangeRequest.findMany({
        where: { id: { in: reachedProposedDateRequestIds } },
        select: {
          id: true,
          goalId: true,
          type: true,
          goal: {
            select: {
              name: true,
              groupId: true,
            },
          },
        },
      })
    : [];

  // 过期超时的变更请求
  const expiredRequestsToEmit = await deps.prisma.goalChangeRequest.findMany({
    where: { status: "PENDING", expiresAt: { lte: now } },
    select: {
      id: true,
      goalId: true,
      type: true,
      goal: {
        select: {
          name: true,
          groupId: true,
        },
      },
    },
  });

  const expiredRequests = await deps.prisma.goalChangeRequest.updateMany({
    where: { status: "PENDING", expiresAt: { lte: now } },
    data: { status: "EXPIRED" },
  });

  const groups = await deps.prisma.group.findMany({
    where: {
      goals: {
        some: {
          OR: [
            {
              status: { in: ["PENDING", "UPCOMING"] },
              startDate: { lte: tomorrowUtcMidnight },
            },
            {
              status: "ACTIVE",
              endDate: { lt: tomorrowUtcMidnight },
            },
          ],
        },
      },
    },
    select: { id: true, timezone: true },
  });

  const grouped = groupIdsByTimezone(groups);

  let activatedCount = 0;
  let settlingCount = 0;
  let voidedCount = 0;
  let voidedChangeRequestCount = 0;
  let processedTimezoneCount = 0;

  for (const [timeZone, groupIds] of grouped) {
    const todayDate = getTodayUtcDateForTimeZone(now, timeZone);
    if (!todayDate) {
      deps.logger?.error?.(`[scheduler] Invalid timezone "${timeZone}", skip ${groupIds.length} group(s).`);
      continue;
    }
    processedTimezoneCount += 1;

    // UPCOMING → ACTIVE
    const goalsToActivate = await deps.prisma.goal.findMany({
      where: {
        groupId: { in: groupIds },
        status: "UPCOMING",
        startDate: { lte: todayDate },
      },
      select: { id: true, name: true, groupId: true },
    });

    const activated = await deps.prisma.goal.updateMany({
      where: {
        groupId: { in: groupIds },
        status: "UPCOMING",
        startDate: { lte: todayDate },
      },
      data: { status: "ACTIVE" },
    });

    for (const goal of goalsToActivate) {
      await createFeedEvent(
        {
          eventType: "GOAL_STATUS_CHANGED",
          groupId: goal.groupId,
          metadata: {
            goalId: goal.id,
            goalName: goal.name,
            fromStatus: "UPCOMING",
            toStatus: "ACTIVE",
          },
        },
        { prisma: deps.prisma }
      );
    }

    // UPCOMING→ACTIVE 后：作废含 startDate 修改的 MODIFY 请求（CANCEL 请求不受影响）
    if (activated.count > 0) {
      const activatedGoals = await deps.prisma.goal.findMany({
        where: {
          groupId: { in: groupIds },
          status: "ACTIVE",
          startDate: { lte: todayDate },
        },
        select: { id: true },
      });
      const activatedGoalIds = activatedGoals.map((g: { id: number }) => g.id);

      if (activatedGoalIds.length > 0) {
        // 查找含 startDate 修改的 MODIFY 请求
        const modifyRequests = await deps.prisma.goalChangeRequest.findMany({
          where: {
            goalId: { in: activatedGoalIds },
            status: "PENDING",
            type: "MODIFY",
          },
          select: { id: true, proposedChanges: true },
        });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const requestsWithStartDate = modifyRequests.filter((r: any) => {
          const changes = r.proposedChanges as Record<string, unknown> | null;
          return changes && changes.startDate !== undefined;
        });

        if (requestsWithStartDate.length > 0) {
          const requestsWithStartDateToEmit = await deps.prisma.goalChangeRequest.findMany({
            where: { id: { in: requestsWithStartDate.map((r: { id: number }) => r.id) }, status: "PENDING" },
            select: {
              id: true,
              goalId: true,
              type: true,
              goal: {
                select: {
                  name: true,
                  groupId: true,
                },
              },
            },
          });

          const voidedReqs = await deps.prisma.goalChangeRequest.updateMany({
            where: { id: { in: requestsWithStartDate.map((r: { id: number }) => r.id) } },
            data: { status: "VOIDED" },
          });
          voidedChangeRequestCount += voidedReqs.count;

          for (const request of requestsWithStartDateToEmit) {
            await createFeedEvent(
              {
                eventType: "CHANGE_REQUEST_RESULT",
                groupId: request.goal.groupId,
                metadata: {
                  requestId: request.id,
                  goalId: request.goalId,
                  goalName: request.goal.name,
                  type: request.type,
                  result: "VOIDED",
                },
              },
              { prisma: deps.prisma }
            );
          }
        }
      }
    }

    // ACTIVE → SETTLING（小组时区“今天”已晚于 endDate）
    const goalsToSettle = await deps.prisma.goal.findMany({
      where: {
        groupId: { in: groupIds },
        status: "ACTIVE",
        endDate: { lt: todayDate },
      },
      select: { id: true, name: true, groupId: true },
    });

    const settling = await deps.prisma.goal.updateMany({
      where: {
        groupId: { in: groupIds },
        status: "ACTIVE",
        endDate: { lt: todayDate },
      },
      data: { status: "SETTLING" },
    });

    for (const goal of goalsToSettle) {
      await createFeedEvent(
        {
          eventType: "GOAL_STATUS_CHANGED",
          groupId: goal.groupId,
          metadata: {
            goalId: goal.id,
            goalName: goal.name,
            fromStatus: "ACTIVE",
            toStatus: "SETTLING",
          },
        },
        { prisma: deps.prisma }
      );
    }

    // PENDING → VOIDED
    const goalsToVoid = await deps.prisma.goal.findMany({
      where: {
        groupId: { in: groupIds },
        status: "PENDING",
        startDate: { lte: todayDate },
      },
      select: { id: true, name: true, groupId: true },
    });

    const voided = await deps.prisma.goal.updateMany({
      where: {
        groupId: { in: groupIds },
        status: "PENDING",
        startDate: { lte: todayDate },
      },
      data: { status: "VOIDED" },
    });

    for (const goal of goalsToVoid) {
      await createFeedEvent(
        {
          eventType: "GOAL_STATUS_CHANGED",
          groupId: goal.groupId,
          metadata: {
            goalId: goal.id,
            goalName: goal.name,
            fromStatus: "PENDING",
            toStatus: "VOIDED",
          },
        },
        { prisma: deps.prisma }
      );
    }

    // PENDING→VOIDED 后：作废相关请求
    if (voided.count > 0) {
      const voidedGoals = await deps.prisma.goal.findMany({
        where: {
          groupId: { in: groupIds },
          status: "VOIDED",
          startDate: { lte: todayDate },
        },
        select: { id: true },
      });
      const voidedGoalIds = voidedGoals.map((g: { id: number }) => g.id);

      if (voidedGoalIds.length > 0) {
        const voidedReqsToEmit = await deps.prisma.goalChangeRequest.findMany({
          where: { goalId: { in: voidedGoalIds }, status: "PENDING" },
          select: {
            id: true,
            goalId: true,
            type: true,
            goal: {
              select: {
                name: true,
                groupId: true,
              },
            },
          },
        });

        const voidedReqs = await deps.prisma.goalChangeRequest.updateMany({
          where: { goalId: { in: voidedGoalIds }, status: "PENDING" },
          data: { status: "VOIDED" },
        });
        voidedChangeRequestCount += voidedReqs.count;

        for (const request of voidedReqsToEmit) {
          await createFeedEvent(
            {
              eventType: "CHANGE_REQUEST_RESULT",
              groupId: request.goal.groupId,
              metadata: {
                requestId: request.id,
                goalId: request.goalId,
                goalName: request.goal.name,
                type: request.type,
                result: "VOIDED",
              },
            },
            { prisma: deps.prisma }
          );
        }
      }
    }

    activatedCount += activated.count;
    settlingCount += settling.count;
    voidedCount += voided.count;
  }

  // 进行中目标进入待结算后：该目标下所有待确认请求自动作废
  const voidedBySettlingToEmit = await deps.prisma.goalChangeRequest.findMany({
    where: {
      status: "PENDING",
      goal: {
        status: "SETTLING",
      },
    },
    select: {
      id: true,
      goalId: true,
      type: true,
      goal: {
        select: {
          name: true,
          groupId: true,
        },
      },
    },
  });

  const voidedBySettling = await deps.prisma.goalChangeRequest.updateMany({
    where: {
      status: "PENDING",
      goal: {
        status: "SETTLING",
      },
    },
    data: { status: "VOIDED" },
  });

  // 超时3天自动通过打卡
  const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);

  const checkinsToAutoApprove = await deps.prisma.checkin.findMany({
    where: {
      status: "PENDING_REVIEW",
      createdAt: { lte: threeDaysAgo },
    },
    include: {
      evidence: {
        select: {
          id: true,
        },
      },
      member: {
        select: {
          user: {
            select: {
              nickname: true,
            },
          },
        },
      },
      goal: {
        select: {
          id: true,
          name: true,
          unit: true,
          groupId: true,
        },
      },
    },
  });

  const autoApproved = await deps.prisma.checkin.updateMany({
    where: {
      status: "PENDING_REVIEW",
      createdAt: { lte: threeDaysAgo },
    },
    data: { status: "AUTO_APPROVED" },
  });

  for (const checkin of checkinsToAutoApprove) {
    await createFeedEvent(
      {
        eventType: "CHECKIN_AUTO_APPROVED",
        groupId: checkin.goal.groupId,
        metadata: {
          checkinId: checkin.id,
          checkinDate: checkin.checkinDate.toISOString().slice(0, 10),
          checkinOwnerNickname: checkin.member.user.nickname,
          evidenceCount: (checkin.evidence ?? []).length,
          goalId: checkin.goal.id,
          goalName: checkin.goal.name,
          value: Number(checkin.value),
          unit: checkin.goal.unit,
        },
      },
      { prisma: deps.prisma }
    );
  }

  for (const request of expiredByProposedDateRequests) {
    await createFeedEvent(
      {
        eventType: "CHANGE_REQUEST_RESULT",
        groupId: request.goal.groupId,
        metadata: {
          requestId: request.id,
          goalId: request.goalId,
          goalName: request.goal.name,
          type: request.type,
          result: "EXPIRED",
        },
      },
      { prisma: deps.prisma }
    );
  }

  for (const request of expiredRequestsToEmit) {
    await createFeedEvent(
      {
        eventType: "CHANGE_REQUEST_RESULT",
        groupId: request.goal.groupId,
        metadata: {
          requestId: request.id,
          goalId: request.goalId,
          goalName: request.goal.name,
          type: request.type,
          result: "EXPIRED",
        },
      },
      { prisma: deps.prisma }
    );
  }

  for (const request of voidedBySettlingToEmit) {
    await createFeedEvent(
      {
        eventType: "CHANGE_REQUEST_RESULT",
        groupId: request.goal.groupId,
        metadata: {
          requestId: request.id,
          goalId: request.goalId,
          goalName: request.goal.name,
          type: request.type,
          result: "VOIDED",
        },
      },
      { prisma: deps.prisma }
    );
  }

  return {
    activatedCount,
    settlingCount,
    voidedCount,
    expiredChangeRequestCount: expiredRequests.count + expiredByProposedDate.count,
    voidedChangeRequestCount: voidedChangeRequestCount + voidedBySettling.count,
    autoApprovedCheckinCount: autoApproved.count,
    checkedGroupCount: groups.length,
    checkedTimezoneCount: grouped.size,
    processedTimezoneCount,
  };
}

async function resolveCron(): Promise<{ schedule: (expression: string, cb: () => void) => CronTask }> {
  const mod = await import("node-cron");
  const cron = "default" in mod ? (mod as { default: unknown }).default : mod;
  if (!cron || typeof cron !== "object" || typeof (cron as { schedule?: unknown }).schedule !== "function") {
    throw new Error("Invalid node-cron module shape");
  }
  return cron as { schedule: (expression: string, cb: () => void) => CronTask };
}

export async function startGoalStatusScheduler(
  deps: GoalStatusSchedulerDeps,
  options?: { schedule?: string; runOnStart?: boolean; mode?: "auto" | "cron" | "interval" }
): Promise<{ stop: () => void }> {
  const expression = options?.schedule ?? "* * * * *";
  const logger = deps.logger ?? console;
  const mode = options?.mode ?? "auto";
  const isDev =
    (import.meta as unknown as { dev?: boolean }).dev === true ||
    (process as unknown as { dev?: boolean }).dev === true ||
    process.env.NODE_ENV === "development";
  const shouldUseCron = mode === "cron" || (mode === "auto" && !isDev);

  let isRunning = false;
  const run = async () => {
    if (isRunning) {
      logger.warn?.("[scheduler] Previous tick still running, skip.");
      return;
    }
    isRunning = true;
    try {
      const result = await runGoalStatusSchedulerTick(deps);
      if (result.activatedCount > 0 || result.settlingCount > 0 || result.voidedCount > 0 || result.expiredChangeRequestCount > 0 || result.voidedChangeRequestCount > 0 || result.autoApprovedCheckinCount > 0) {
        logger.info?.(
          `[scheduler] Goal status updated: activated=${result.activatedCount}, settling=${result.settlingCount}, voided=${result.voidedCount}, ` +
            `expiredRequests=${result.expiredChangeRequestCount}, voidedRequests=${result.voidedChangeRequestCount}, ` +
            `autoApprovedCheckins=${result.autoApprovedCheckinCount}, ` +
            `groups=${result.checkedGroupCount}, timezones=${result.processedTimezoneCount}/${result.checkedTimezoneCount}.`
        );
      }
    } catch (error) {
      logger.error?.("[scheduler] Tick failed.", error);
    } finally {
      isRunning = false;
    }
  };

  if (options?.runOnStart !== false) {
    void run();
  }

  if (!shouldUseCron) {
    const interval = setInterval(() => {
      void run();
    }, 60_000);

    return {
      stop: () => {
        clearInterval(interval);
      },
    };
  }

  try {
    const cron = await resolveCron();
    const task = cron.schedule(expression, () => {
      void run();
    });
    return {
      stop: () => {
        try {
          task.stop();
        } catch {
          // ignore
        }
      },
    };
  } catch (error) {
    logger.warn?.(
      "[scheduler] node-cron unavailable, fallback to setInterval. " +
        "Install node-cron in production for reliable scheduling.",
      error
    );

    const interval = setInterval(() => {
      void run();
    }, 60_000);

    return {
      stop: () => {
        clearInterval(interval);
      },
    };
  }
}
