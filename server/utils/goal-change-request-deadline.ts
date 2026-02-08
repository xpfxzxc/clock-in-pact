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
