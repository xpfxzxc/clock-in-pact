function parseDateOnlyParts(dateOnly: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateOnly);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null;
  }

  return { year, month, day };
}

function formatDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDaysToDateOnly(dateOnly: string, days: number): string | null {
  const parsed = parseDateOnlyParts(dateOnly);
  if (!parsed) return null;

  const shifted = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day + days));
  if (Number.isNaN(shifted.getTime())) {
    return null;
  }

  return formatDateOnly(shifted);
}

function toDateOnly(value: unknown): string | null {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return formatDateOnly(value);
  }
  return null;
}

function getPart(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): number | null {
  const value = parts.find((part) => part.type === type)?.value;
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function getUtcDateTimeForTimezoneDateStart(dateOnly: string, timeZone: string): Date | null {
  const parsed = parseDateOnlyParts(dateOnly);
  if (!parsed) return null;

  const targetUtc = Date.UTC(parsed.year, parsed.month - 1, parsed.day, 0, 0, 0);
  let guess = targetUtc;

  for (let i = 0; i < 5; i += 1) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      hourCycle: "h23",
    }).formatToParts(new Date(guess));

    const year = getPart(parts, "year");
    const month = getPart(parts, "month");
    const day = getPart(parts, "day");
    const hour = getPart(parts, "hour");
    const minute = getPart(parts, "minute");
    const second = getPart(parts, "second");

    if (year === null || month === null || day === null || hour === null || minute === null || second === null) {
      return null;
    }

    const currentUtc = Date.UTC(year, month - 1, day, hour, minute, second);
    const diff = currentUtc - targetUtc;
    if (diff === 0) {
      break;
    }

    guess -= diff;
  }

  return new Date(guess);
}

export function getGoalChangeRequestEffectiveExpiresAt(input: {
  type: string;
  expiresAt: Date;
  proposedChanges: unknown;
  timezone?: string;
}): Date {
  let effectiveExpiresAt = input.expiresAt;

  if (input.type !== "MODIFY") {
    return effectiveExpiresAt;
  }

  const changes = input.proposedChanges as Record<string, unknown> | null;
  if (!input.timezone) {
    return effectiveExpiresAt;
  }

  const proposedDates = [changes?.startDate, changes?.endDate];
  for (const proposedDate of proposedDates) {
    if (typeof proposedDate !== "string") {
      continue;
    }

    const proposedAt = getUtcDateTimeForTimezoneDateStart(proposedDate, input.timezone);
    if (!proposedAt) {
      continue;
    }

    if (proposedAt.getTime() < effectiveExpiresAt.getTime()) {
      effectiveExpiresAt = proposedAt;
    }
  }

  return effectiveExpiresAt;
}

export function getGoalChangeRequestDisplayExpiresAt(input: {
  type: string;
  expiresAt: Date;
  proposedChanges: unknown;
  timezone?: string;
  goalStatus?: string;
  goalStartDate?: unknown;
  goalEndDate?: unknown;
}): Date {
  let displayExpiresAt = getGoalChangeRequestEffectiveExpiresAt(input);

  if (!input.timezone) {
    return displayExpiresAt;
  }

  const changes = input.proposedChanges as Record<string, unknown> | null;
  const hasProposedStartDate = typeof changes?.startDate === "string";

  const shouldApplyGoalStartDeadline =
    input.goalStatus === "PENDING" ||
    (input.goalStatus === "UPCOMING" && input.type === "MODIFY" && hasProposedStartDate);

  if (shouldApplyGoalStartDeadline) {
    const goalStartDateOnly = toDateOnly(input.goalStartDate);
    if (goalStartDateOnly) {
      const goalStartAt = getUtcDateTimeForTimezoneDateStart(goalStartDateOnly, input.timezone);
      if (goalStartAt && goalStartAt.getTime() < displayExpiresAt.getTime()) {
        displayExpiresAt = goalStartAt;
      }
    }
  }

  const shouldApplyGoalEndDeadline = input.goalStatus === "ACTIVE";
  if (shouldApplyGoalEndDeadline) {
    const goalEndDateOnly = toDateOnly(input.goalEndDate);
    if (goalEndDateOnly) {
      const goalEndNextDateOnly = addDaysToDateOnly(goalEndDateOnly, 1);
      if (goalEndNextDateOnly) {
        const goalEndAfterDay = getUtcDateTimeForTimezoneDateStart(goalEndNextDateOnly, input.timezone);
        if (goalEndAfterDay && goalEndAfterDay.getTime() < displayExpiresAt.getTime()) {
          displayExpiresAt = goalEndAfterDay;
        }
      }
    }
  }

  return displayExpiresAt;
}
