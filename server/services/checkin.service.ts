import type { MemberRole, PrismaClient } from "@prisma/client";

import type { CheckinEvidenceResponse, CheckinListResponse, CheckinResponse, CreateCheckinInput, ReviewCheckinInput, ReviewCheckinResponse } from "../types/checkin";
import { AppError } from "../utils/app-error";

const CHECKIN_NOTE_MAX_LENGTH = 500;
const MIN_EVIDENCE_COUNT = 1;
const MAX_EVIDENCE_COUNT = 5;
const MAX_EVIDENCE_FILE_SIZE = 5 * 1024 * 1024;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type CheckinPrismaClient = PrismaClient | any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type CheckinPrismaTransactionClient = any;

export interface CheckinEvidenceFileInput {
  filePath: string;
  fileSize: number;
}

type DecimalLike = { toNumber(): number } | { toString(): string };

type CheckinRecord = {
  id: number;
  goalId: number;
  memberId: number;
  checkinDate: Date;
  value: DecimalLike | number;
  note: string | null;
  status: "PENDING_REVIEW" | "CONFIRMED" | "DISPUTED" | "AUTO_APPROVED";
  createdAt: Date;
  evidence: CheckinEvidenceResponse[];
  member: {
    user: {
      nickname: string;
    };
  };
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
  return date.toISOString().split("T")[0]!;
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

function decimalToNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (value && typeof value === "object") {
    const maybe = value as { toNumber?: () => number; toString?: () => string };
    if (typeof maybe.toNumber === "function") return maybe.toNumber();
    if (typeof maybe.toString === "function") return Number(maybe.toString());
  }

  return Number(value);
}

function normalizeNote(note: unknown): string | null {
  if (note === undefined || note === null) return null;
  if (typeof note !== "string") {
    throw new AppError(400, "备注格式错误");
  }

  const trimmedNote = note.trim();
  if (!trimmedNote) return null;
  if (trimmedNote.length > CHECKIN_NOTE_MAX_LENGTH) {
    throw new AppError(400, "备注不能超过500字符");
  }

  return trimmedNote;
}

function assertPositiveNumber(value: unknown, message: string): asserts value is number {
  if (typeof value !== "number" || Number.isNaN(value) || !Number.isFinite(value)) {
    throw new AppError(400, message);
  }
  if (value <= 0) {
    throw new AppError(400, "打卡数值必须大于0");
  }
}

function assertPositiveInteger(value: unknown, message: string): asserts value is number {
  if (typeof value !== "number" || Number.isNaN(value) || !Number.isFinite(value) || !Number.isInteger(value) || value <= 0) {
    throw new AppError(400, message);
  }
}

function isPrismaUniqueConstraintError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  return (error as { code?: unknown }).code === "P2002";
}

function assertEvidenceFiles(evidenceFiles: CheckinEvidenceFileInput[]): void {
  if (evidenceFiles.length < MIN_EVIDENCE_COUNT) {
    throw new AppError(400, "请至少上传1张图片");
  }
  if (evidenceFiles.length > MAX_EVIDENCE_COUNT) {
    throw new AppError(400, "最多上传5张图片");
  }

  for (const file of evidenceFiles) {
    if (!file.filePath || typeof file.filePath !== "string") {
      throw new AppError(400, "证据文件路径无效");
    }
    if (typeof file.fileSize !== "number" || Number.isNaN(file.fileSize) || file.fileSize <= 0) {
      throw new AppError(400, "证据文件大小无效");
    }
    if (file.fileSize > MAX_EVIDENCE_FILE_SIZE) {
      throw new AppError(400, "单张图片不超过5MB");
    }
  }
}

function mapCheckinResponse(checkin: CheckinRecord): CheckinResponse {
  return {
    id: checkin.id,
    goalId: checkin.goalId,
    memberId: checkin.memberId,
    checkinDate: formatDateOnly(checkin.checkinDate),
    value: decimalToNumber(checkin.value),
    note: checkin.note,
    status: checkin.status,
    evidence: (checkin.evidence ?? []).map((item) => ({
      id: item.id,
      filePath: item.filePath,
      fileSize: item.fileSize,
    })),
    reviews: [],
    createdByNickname: checkin.member.user.nickname,
    createdAt: checkin.createdAt.toISOString(),
  };
}

function assertDateRange(checkinDate: Date, startDate: Date, endDate: Date, todayInTimeZone: string): void {
  const checkinDateString = formatDateOnly(checkinDate);
  const startDateString = formatDateOnly(startDate);
  const endDateString = formatDateOnly(endDate);
  const maxDateString = todayInTimeZone < endDateString ? todayInTimeZone : endDateString;

  if (checkinDateString < startDateString || checkinDateString > maxDateString) {
    throw new AppError(400, "打卡日期无效");
  }
}

async function ensureGoalAndMembership(
  goalId: number,
  userId: number,
  deps: { prisma: CheckinPrismaClient }
): Promise<{
  goal: {
    id: number;
    groupId: number;
    status: string;
    startDate: Date;
    endDate: Date;
    group: { timezone: string };
  };
  member: {
    id: number;
    role: MemberRole;
  };
}> {
  const goal = await deps.prisma.goal.findUnique({
    where: { id: goalId },
    select: {
      id: true,
      groupId: true,
      status: true,
      startDate: true,
      endDate: true,
      group: { select: { timezone: true } },
    },
  });

  if (!goal) {
    throw new AppError(404, "目标不存在");
  }

  const member = await deps.prisma.groupMember.findUnique({
    where: {
      groupId_userId: {
        groupId: goal.groupId,
        userId,
      },
    },
    select: {
      id: true,
      role: true,
    },
  });

  if (!member) {
    throw new AppError(403, "您不是该小组成员");
  }

  return { goal, member };
}

export async function createCheckin(
  data: CreateCheckinInput,
  evidenceFiles: CheckinEvidenceFileInput[],
  userId: number,
  deps: { prisma: CheckinPrismaClient }
): Promise<CheckinResponse> {
  assertPositiveInteger(data.goalId, "无效的目标 ID");

  assertPositiveNumber(data.value, "打卡数值无效");
  assertEvidenceFiles(evidenceFiles);

  const checkinDate = parseDateOnly(data.checkinDate, "打卡日期无效");
  const note = normalizeNote(data.note);

  const { goal, member } = await ensureGoalAndMembership(data.goalId, userId, deps);

  if (goal.status !== "ACTIVE") {
    throw new AppError(400, "仅进行中的目标可打卡");
  }

  if (member.role !== "CHALLENGER") {
    throw new AppError(403, "仅挑战者可打卡");
  }

  const participant = await deps.prisma.goalParticipant.findUnique({
    where: {
      goalId_memberId: {
        goalId: goal.id,
        memberId: member.id,
      },
    },
    select: { id: true },
  });

  if (!participant) {
    throw new AppError(403, "您不是该目标参与者");
  }

  const todayInTimeZone = getTodayDateStringInTimeZone(goal.group.timezone);
  assertDateRange(checkinDate, goal.startDate, goal.endDate, todayInTimeZone);

  return deps.prisma.$transaction(async (tx: CheckinPrismaTransactionClient) => {
    const createdCheckin = await tx.checkin.create({
      data: {
        goalId: goal.id,
        memberId: member.id,
        checkinDate,
        value: data.value,
        note,
      },
    });

    await tx.checkinEvidence.createMany({
      data: evidenceFiles.map((file) => ({
        checkinId: createdCheckin.id,
        filePath: file.filePath,
        fileSize: file.fileSize,
      })),
    });

    const result = await tx.checkin.findUnique({
      where: { id: createdCheckin.id },
      include: {
        evidence: {
          select: {
            id: true,
            filePath: true,
            fileSize: true,
          },
        },
        member: {
          include: {
            user: {
              select: { nickname: true },
            },
          },
        },
      },
    });

    if (!result) {
      throw new AppError(500, "打卡创建失败");
    }

    return mapCheckinResponse(result);
  });
}

export async function listCheckins(
  goalId: number,
  userId: number,
  deps: { prisma: CheckinPrismaClient }
): Promise<CheckinListResponse> {
  assertPositiveInteger(goalId, "无效的目标 ID");

  const { goal, member } = await ensureGoalAndMembership(goalId, userId, deps);

  const checkins = await deps.prisma.checkin.findMany({
    where: { goalId: goal.id },
    include: {
      evidence: {
        select: {
          id: true,
          filePath: true,
          fileSize: true,
        },
      },
      member: {
        include: {
          user: {
            select: { nickname: true },
          },
        },
      },
      reviews: {
        include: {
          member: {
            include: {
              user: {
                select: { nickname: true },
              },
            },
          },
        },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const isSupervisor = member.role === "SUPERVISOR";

  return {
    checkins: checkins.map((checkin: CheckinRecord & { reviews?: Array<{ memberId: number; action: string; reason: string | null; createdAt: Date; member: { user: { nickname: string } } }> }) => {
      const response = mapCheckinResponse(checkin);
      response.reviews = (checkin.reviews ?? []).map((r) => ({
        memberId: r.memberId,
        reviewerNickname: r.member.user.nickname,
        action: r.action as "CONFIRMED" | "DISPUTED",
        reason: r.reason,
        createdAt: r.createdAt.toISOString(),
      }));
      if (isSupervisor) {
        const myReview = (checkin.reviews ?? []).find((r) => r.memberId === member.id);
        response.myReviewAction = myReview ? (myReview.action as "CONFIRMED" | "DISPUTED") : null;
      }
      return response;
    }),
    total: checkins.length,
  };
}

const REVIEW_REASON_MAX_LENGTH = 500;

export async function reviewCheckin(
  checkinId: number,
  input: ReviewCheckinInput,
  userId: number,
  deps: { prisma: CheckinPrismaClient }
): Promise<ReviewCheckinResponse> {
  assertPositiveInteger(checkinId, "无效的打卡 ID");

  if (input.action !== "CONFIRMED" && input.action !== "DISPUTED") {
    throw new AppError(400, "无效的审核操作");
  }

  const checkin = await deps.prisma.checkin.findUnique({
    where: { id: checkinId },
    select: {
      id: true,
      status: true,
      goal: {
        select: {
          id: true,
          groupId: true,
          status: true,
        },
      },
    },
  });

  if (!checkin) {
    throw new AppError(404, "打卡记录不存在");
  }

  if (checkin.status !== "PENDING_REVIEW") {
    throw new AppError(400, "该打卡记录不在待审核状态");
  }

  const goalStatus = checkin.goal.status;
  if (goalStatus !== "ACTIVE" && goalStatus !== "SETTLING") {
    throw new AppError(400, "目标状态不允许审核");
  }

  const member = await deps.prisma.groupMember.findUnique({
    where: {
      groupId_userId: {
        groupId: checkin.goal.groupId,
        userId,
      },
    },
    select: {
      id: true,
      role: true,
    },
  });

  if (!member) {
    throw new AppError(403, "您不是该小组成员");
  }

  if (member.role !== "SUPERVISOR") {
    throw new AppError(403, "仅监督者可审核打卡");
  }

  const existingReview = await deps.prisma.checkinReview.findUnique({
    where: {
      checkinId_memberId: {
        checkinId,
        memberId: member.id,
      },
    },
    select: { id: true },
  });

  if (existingReview) {
    throw new AppError(400, "您已审核过该打卡记录");
  }

  if (input.action === "DISPUTED") {
    if (!input.reason || typeof input.reason !== "string" || !input.reason.trim()) {
      throw new AppError(400, "质疑必须填写理由");
    }
    if (input.reason.trim().length > REVIEW_REASON_MAX_LENGTH) {
      throw new AppError(400, "质疑理由不能超过500字符");
    }

    try {
      await deps.prisma.checkinReview.create({
        data: {
          checkinId,
          memberId: member.id,
          action: "DISPUTED",
          reason: input.reason.trim(),
        },
      });
    } catch (error) {
      if (isPrismaUniqueConstraintError(error)) {
        throw new AppError(400, "您已审核过该打卡记录");
      }
      throw error;
    }

    await deps.prisma.checkin.update({
      where: { id: checkinId },
      data: { status: "DISPUTED" },
    });

    return {
      checkinId,
      action: "DISPUTED",
      checkinStatus: "DISPUTED",
    };
  }

  // CONFIRMED
  try {
    await deps.prisma.checkinReview.create({
      data: {
        checkinId,
        memberId: member.id,
        action: "CONFIRMED",
      },
    });
  } catch (error) {
    if (isPrismaUniqueConstraintError(error)) {
      throw new AppError(400, "您已审核过该打卡记录");
    }
    throw error;
  }

  const totalSupervisors = await deps.prisma.groupMember.count({
    where: {
      groupId: checkin.goal.groupId,
      role: "SUPERVISOR",
    },
  });

  const confirmedCount = await deps.prisma.checkinReview.count({
    where: {
      checkinId,
      action: "CONFIRMED",
    },
  });

  if (confirmedCount >= totalSupervisors) {
    await deps.prisma.checkin.update({
      where: { id: checkinId },
      data: { status: "CONFIRMED" },
    });

    return {
      checkinId,
      action: "CONFIRMED",
      checkinStatus: "CONFIRMED",
    };
  }

  return {
    checkinId,
    action: "CONFIRMED",
    checkinStatus: "PENDING_REVIEW",
  };
}
