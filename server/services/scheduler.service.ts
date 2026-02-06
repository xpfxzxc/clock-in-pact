import type { PrismaClient } from "@prisma/client";

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
  voidedCount: number;
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

  const groups = await deps.prisma.group.findMany({
    where: {
      goals: {
        some: {
          status: { in: ["PENDING", "UPCOMING"] },
          startDate: { lte: tomorrowUtcMidnight },
        },
      },
    },
    select: { id: true, timezone: true },
  });

  const grouped = groupIdsByTimezone(groups);

  let activatedCount = 0;
  let voidedCount = 0;
  let processedTimezoneCount = 0;

  for (const [timeZone, groupIds] of grouped) {
    const todayDate = getTodayUtcDateForTimeZone(now, timeZone);
    if (!todayDate) {
      deps.logger?.error?.(`[scheduler] Invalid timezone "${timeZone}", skip ${groupIds.length} group(s).`);
      continue;
    }
    processedTimezoneCount += 1;

    const activated = await deps.prisma.goal.updateMany({
      where: {
        groupId: { in: groupIds },
        status: "UPCOMING",
        startDate: { lte: todayDate },
      },
      data: { status: "ACTIVE" },
    });

    const voided = await deps.prisma.goal.updateMany({
      where: {
        groupId: { in: groupIds },
        status: "PENDING",
        startDate: { lte: todayDate },
      },
      data: { status: "VOIDED" },
    });

    activatedCount += activated.count;
    voidedCount += voided.count;
  }

  return {
    activatedCount,
    voidedCount,
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
      if (result.activatedCount > 0 || result.voidedCount > 0) {
        logger.info?.(
          `[scheduler] Goal status updated: activated=${result.activatedCount}, voided=${result.voidedCount}, ` +
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
