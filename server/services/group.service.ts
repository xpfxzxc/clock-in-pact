import { randomInt } from "node:crypto";
import type { MemberRole } from "@prisma/client";
import type {
  CreateGroupRequest,
  GroupResponse,
  GroupDetailResponse,
  JoinGroupRequest,
  JoinGroupResponse,
  GroupMemberInfo,
} from "../types/group";
import { AppError } from "../utils/app-error";

const GROUP_NAME_MIN_UNITS = 2;
const GROUP_NAME_MAX_UNITS = 20;
const GROUP_DESCRIPTION_MAX_LENGTH = 100;
const GROUP_MAX_MEMBERS = 6;
const INVITE_CODE_LENGTH = 8;
const INITIAL_INVITE_CODE_COUNT = 5;
const INVITE_CODE_WRITE_MAX_ATTEMPTS = 5;
const DEFAULT_TIMEZONE = "Asia/Shanghai";

export interface GroupPrismaClient {
  $transaction<T>(fn: (tx: GroupPrismaTransactionClient) => Promise<T>): Promise<T>;
  group: {
    create(args: {
      data: {
        name: string;
        description?: string | null;
        timezone: string;
        members: { create: { userId: number; role: MemberRole } };
        inviteCodes: { create: Array<{ code: string }> };
      };
      include: {
        members: { include: { user: { select: { nickname: true } } } };
        inviteCodes: { where: { usedAt: null }; take: number };
        _count: { select: { members: true } };
      };
    }): Promise<{
      id: number;
      name: string;
      description: string | null;
      timezone: string;
      createdAt: Date;
      members: Array<{
        id: number;
        userId: number;
        role: MemberRole;
        createdAt: Date;
        user: { nickname: string };
      }>;
      inviteCodes: Array<{ code: string }>;
      _count: { members: number };
    }>;
    findMany(args: {
      where: { members: { some: { userId: number } } };
      include: {
        _count: { select: { members: true } };
        members: { where: { userId: number }; select: { role: true } };
      };
      orderBy: { createdAt: "desc" };
    }): Promise<
      Array<{
        id: number;
        name: string;
        description: string | null;
        timezone: string;
        createdAt: Date;
        _count: { members: number };
        members: Array<{ role: MemberRole }>;
      }>
    >;
    findUnique(args: {
      where: { id: number };
      include: {
        members: {
          include: { user: { select: { nickname: true } } };
          orderBy: { createdAt: "asc" };
        };
        inviteCodes: { where: { usedAt: null }; take: number; orderBy: { createdAt: "asc" } };
        _count: { select: { members: true } };
      };
    }): Promise<{
      id: number;
      name: string;
      description: string | null;
      timezone: string;
      createdAt: Date;
      members: Array<{
        id: number;
        userId: number;
        role: MemberRole;
        createdAt: Date;
        user: { nickname: string };
      }>;
      inviteCodes: Array<{ code: string }>;
      _count: { members: number };
    } | null>;
  };
  groupMember: {
    findUnique(args: {
      where: { groupId_userId: { groupId: number; userId: number } };
      select: { role: true };
    }): Promise<{ role: MemberRole } | null>;
    create(args: {
      data: { groupId: number; userId: number; role: MemberRole };
    }): Promise<{ id: number; groupId: number; userId: number; role: MemberRole }>;
  };
  inviteCode: {
    findUnique(args: {
      where: { code: string };
      include: {
        group: {
          select: {
            id: true;
            name: true;
            description: true;
            timezone: true;
            createdAt: true;
            _count: { select: { members: true } };
          };
        };
      };
    }): Promise<{
      id: number;
      groupId: number;
      code: string;
      usedAt: Date | null;
      usedById: number | null;
      group: {
        id: number;
        name: string;
        description: string | null;
        timezone: string;
        createdAt: Date;
        _count: { members: number };
      };
    } | null>;
    updateMany(args: {
      where: { id: number; usedAt: null };
      data: { usedAt: Date; usedById: number };
    }): Promise<{ count: number }>;
  };
}

export interface GroupPrismaTransactionClient {
  groupMember: Pick<GroupPrismaClient["groupMember"], "create">;
  inviteCode: Pick<GroupPrismaClient["inviteCode"], "updateMany">;
}

type GroupCreateResult = Awaited<ReturnType<GroupPrismaClient["group"]["create"]>>;

function generateInviteCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < INVITE_CODE_LENGTH; i++) {
    code += chars.charAt(randomInt(chars.length));
  }
  return code;
}

function generateUniqueInviteCodes(count: number): string[] {
  const inviteCodes = new Set<string>();
  while (inviteCodes.size < count) {
    inviteCodes.add(generateInviteCode());
  }
  return Array.from(inviteCodes);
}

function calculateLengthUnits(text: string): number {
  let units = 0;
  for (const char of text) {
    units += /[A-Za-z0-9]/.test(char) ? 0.5 : 1;
  }
  return units;
}

function assertRole(role: unknown): asserts role is MemberRole {
  if (!role || !["CHALLENGER", "SUPERVISOR"].includes(String(role))) {
    throw new AppError(400, "请选择有效的角色");
  }
}

function isValidTimezone(timezone: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

function assertTimezone(timezone: unknown): asserts timezone is string {
  if (typeof timezone !== "string" || !isValidTimezone(timezone)) {
    throw new AppError(400, "请选择有效的时区");
  }
}

function assertCreateGroupInput(body: CreateGroupRequest): void {
  const name = body.name?.trim() ?? "";
  const nameUnits = calculateLengthUnits(name);
  if (!name || nameUnits < GROUP_NAME_MIN_UNITS || nameUnits > GROUP_NAME_MAX_UNITS) {
    throw new AppError(400, "小组名称需为2-20字符（中文=1，英文/数字=0.5）");
  }

  const description = body.description?.trim();
  if (description && description.length > GROUP_DESCRIPTION_MAX_LENGTH) {
    throw new AppError(400, "小组简介不能超过100字符");
  }

  assertRole(body.role);

  if (body.timezone !== undefined) {
    assertTimezone(body.timezone);
  }
}

function isPrismaUniqueConstraintError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  return (error as { code?: unknown }).code === "P2002";
}

export async function createGroup(
  body: CreateGroupRequest,
  userId: number,
  deps: { prisma: GroupPrismaClient }
): Promise<GroupDetailResponse> {
  assertCreateGroupInput(body);

  let group: GroupCreateResult | null = null;
  for (let attempt = 0; attempt < INVITE_CODE_WRITE_MAX_ATTEMPTS; attempt++) {
    const inviteCodes = generateUniqueInviteCodes(INITIAL_INVITE_CODE_COUNT);
    try {
      group = await deps.prisma.group.create({
        data: {
          name: body.name.trim(),
          description: body.description?.trim() || null,
          timezone: body.timezone ?? DEFAULT_TIMEZONE,
          members: {
            create: {
              userId,
              role: body.role,
            },
          },
          inviteCodes: {
            create: inviteCodes.map((code) => ({ code })),
          },
        },
        include: {
          members: {
            include: {
              user: { select: { nickname: true } },
            },
          },
          inviteCodes: {
            where: { usedAt: null },
            take: INITIAL_INVITE_CODE_COUNT,
          },
          _count: { select: { members: true } },
        },
      });
      break;
    } catch (error) {
      if (isPrismaUniqueConstraintError(error)) {
        continue;
      }
      throw error;
    }
  }

  if (!group) {
    throw new AppError(500, "生成邀请码失败，请重试");
  }

  const myMembership = group.members.find((m) => m.userId === userId);
  if (!myMembership) {
    throw new AppError(500, "创建小组失败");
  }

  const members: GroupMemberInfo[] = group.members.map((m) => ({
    id: m.id,
    userId: m.userId,
    nickname: m.user.nickname,
    role: m.role,
    joinedAt: m.createdAt.toISOString(),
  }));

  return {
    id: group.id,
    name: group.name,
    description: group.description,
    timezone: group.timezone,
    createdAt: group.createdAt.toISOString(),
    memberCount: group._count.members,
    myRole: myMembership.role,
    members,
    inviteCodes: group.inviteCodes.map((ic) => ic.code),
  };
}

export async function getMyGroups(
  userId: number,
  deps: { prisma: GroupPrismaClient }
): Promise<GroupResponse[]> {
  const groups = await deps.prisma.group.findMany({
    where: {
      members: {
        some: { userId },
      },
    },
    include: {
      _count: { select: { members: true } },
      members: {
        where: { userId },
        select: { role: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return groups.map((g) => ({
    id: g.id,
    name: g.name,
    description: g.description,
    timezone: g.timezone,
    createdAt: g.createdAt.toISOString(),
    memberCount: g._count.members,
    myRole: g.members[0]?.role,
  }));
}

export async function getGroupDetail(
  groupId: number,
  userId: number,
  deps: { prisma: GroupPrismaClient }
): Promise<GroupDetailResponse> {
  const group = await deps.prisma.group.findUnique({
    where: { id: groupId },
    include: {
      members: {
        include: {
          user: { select: { nickname: true } },
        },
        orderBy: { createdAt: "asc" },
      },
      inviteCodes: {
        where: { usedAt: null },
        take: INITIAL_INVITE_CODE_COUNT,
        orderBy: { createdAt: "asc" },
      },
      _count: { select: { members: true } },
    },
  });

  if (!group) {
    throw new AppError(404, "小组不存在");
  }

  const myMembership = group.members.find((m) => m.userId === userId);
  if (!myMembership) {
    throw new AppError(403, "您不是该小组成员");
  }

  const members: GroupMemberInfo[] = group.members.map((m) => ({
    id: m.id,
    userId: m.userId,
    nickname: m.user.nickname,
    role: m.role,
    joinedAt: m.createdAt.toISOString(),
  }));

  return {
    id: group.id,
    name: group.name,
    description: group.description,
    timezone: group.timezone,
    createdAt: group.createdAt.toISOString(),
    memberCount: group._count.members,
    myRole: myMembership.role,
    members,
    inviteCodes: group.inviteCodes.map((ic) => ic.code),
  };
}

export async function joinGroup(
  body: JoinGroupRequest,
  userId: number,
  deps: { prisma: GroupPrismaClient }
): Promise<JoinGroupResponse> {
  const inviteCode = body.inviteCode?.trim() ?? "";
  if (!inviteCode) {
    throw new AppError(400, "邀请码不能为空");
  }

  assertRole(body.role);

  const invite = await deps.prisma.inviteCode.findUnique({
    where: { code: inviteCode.toUpperCase() },
    include: {
      group: {
        select: {
          id: true,
          name: true,
          description: true,
          timezone: true,
          createdAt: true,
          _count: { select: { members: true } },
        },
      },
    },
  });

  if (!invite || invite.usedAt) {
    throw new AppError(400, "邀请码无效");
  }

  const existingMember = await deps.prisma.groupMember.findUnique({
    where: {
      groupId_userId: {
        groupId: invite.groupId,
        userId,
      },
    },
    select: { role: true },
  });

  if (existingMember) {
    throw new AppError(409, "您已是该小组成员");
  }

  if (invite.group._count.members >= GROUP_MAX_MEMBERS) {
    throw new AppError(400, "小组已满，无法加入");
  }

  const usedAt = new Date();
  await deps.prisma.$transaction(async (tx) => {
    const result = await tx.inviteCode.updateMany({
      where: { id: invite.id, usedAt: null },
      data: {
        usedAt,
        usedById: userId,
      },
    });

    if (result.count !== 1) {
      throw new AppError(400, "邀请码无效");
    }

    try {
      await tx.groupMember.create({
        data: {
          groupId: invite.groupId,
          userId,
          role: body.role,
        },
      });
    } catch (error) {
      if (isPrismaUniqueConstraintError(error)) {
        throw new AppError(409, "您已是该小组成员");
      }
      throw error;
    }
  });

  return {
    group: {
      id: invite.group.id,
      name: invite.group.name,
      description: invite.group.description,
      timezone: invite.group.timezone,
      createdAt: invite.group.createdAt.toISOString(),
      memberCount: invite.group._count.members + 1,
      myRole: body.role,
    },
    role: body.role,
  };
}

export { generateInviteCode as _generateInviteCode };
