import { describe, expect, it, vi } from "vitest";

import {
  createGroup,
  getMyGroups,
  getGroupDetail,
  joinGroup,
  type GroupPrismaClient,
} from "../../server/services/group.service";
import { AppError } from "../../server/utils/app-error";

async function expectAppError(
  promise: Promise<unknown>,
  expected: { statusCode: number; message: string | RegExp }
) {
  await expect(promise).rejects.toBeInstanceOf(AppError);
  const caught = await promise.catch((e: unknown) => e);
  if (!(caught instanceof AppError)) {
    throw caught;
  }
  const error = caught;
  expect(error).toMatchObject({ statusCode: expected.statusCode });
  if (expected.message instanceof RegExp) {
    expect(String(error.message)).toMatch(expected.message);
  } else {
    expect(String(error.message)).toBe(expected.message);
  }
}

function createPrismaMock() {
  const groupCreateMock = vi.fn();
  const groupFindManyMock = vi.fn();
  const groupFindUniqueMock = vi.fn();
  const groupMemberFindUniqueMock = vi.fn();
  const groupMemberCreateMock = vi.fn();
  const inviteCodeFindUniqueMock = vi.fn();
  const inviteCodeUpdateManyMock = vi.fn();
  const goalFindFirstMock = vi.fn().mockResolvedValue(null);
  const goalParticipantCreateMock = vi.fn();
  const goalConfirmationCreateMock = vi.fn();
  const goalChangeRequestFindManyMock = vi.fn().mockResolvedValue([]);
  const goalChangeVoteCreateMock = vi.fn();
  const feedEventCreateMock = vi.fn();

  const transactionMock = vi.fn(async (fn: (tx: any) => Promise<unknown>) => {
    return fn({
      groupMember: { create: groupMemberCreateMock },
      inviteCode: { updateMany: inviteCodeUpdateManyMock },
      goal: { findFirst: goalFindFirstMock },
      goalParticipant: { create: goalParticipantCreateMock },
      goalConfirmation: { create: goalConfirmationCreateMock },
      goalChangeRequest: { findMany: goalChangeRequestFindManyMock },
      goalChangeVote: { create: goalChangeVoteCreateMock },
      feedEvent: { create: feedEventCreateMock },
    });
  });

  const prisma: GroupPrismaClient = {
    $transaction: transactionMock as unknown as GroupPrismaClient["$transaction"],
    group: {
      create: groupCreateMock as unknown as GroupPrismaClient["group"]["create"],
      findMany: groupFindManyMock as unknown as GroupPrismaClient["group"]["findMany"],
      findUnique: groupFindUniqueMock as unknown as GroupPrismaClient["group"]["findUnique"],
    },
    groupMember: {
      findUnique: groupMemberFindUniqueMock as unknown as GroupPrismaClient["groupMember"]["findUnique"],
      create: groupMemberCreateMock as unknown as GroupPrismaClient["groupMember"]["create"],
    },
    inviteCode: {
      findUnique: inviteCodeFindUniqueMock as unknown as GroupPrismaClient["inviteCode"]["findUnique"],
      updateMany: inviteCodeUpdateManyMock as unknown as GroupPrismaClient["inviteCode"]["updateMany"],
    },
    goal: {
      findFirst: goalFindFirstMock as unknown as GroupPrismaClient["goal"]["findFirst"],
    },
    goalParticipant: {
      create: goalParticipantCreateMock as unknown as GroupPrismaClient["goalParticipant"]["create"],
    },
    goalConfirmation: {
      create: goalConfirmationCreateMock as unknown as GroupPrismaClient["goalConfirmation"]["create"],
    },
    feedEvent: {
      create: feedEventCreateMock as unknown as GroupPrismaClient["feedEvent"]["create"],
    },
  };

  return {
    prisma,
    mocks: {
      transaction: transactionMock,
      groupCreate: groupCreateMock,
      groupFindMany: groupFindManyMock,
      groupFindUnique: groupFindUniqueMock,
      groupMemberFindUnique: groupMemberFindUniqueMock,
      groupMemberCreate: groupMemberCreateMock,
      inviteCodeFindUnique: inviteCodeFindUniqueMock,
      inviteCodeUpdateMany: inviteCodeUpdateManyMock,
      goalFindFirst: goalFindFirstMock,
      goalParticipantCreate: goalParticipantCreateMock,
      goalConfirmationCreate: goalConfirmationCreateMock,
      goalChangeRequestFindMany: goalChangeRequestFindManyMock,
      goalChangeVoteCreate: goalChangeVoteCreateMock,
      feedEventCreate: feedEventCreateMock,
    },
  };
}

describe("US-03 创建小组", () => {
  it("场景1: 成功创建小组（生成5个邀请码 + 创建者以所选角色加入）", async () => {
    const { prisma, mocks } = createPrismaMock();
    const now = new Date();

    mocks.groupCreate.mockResolvedValueOnce({
      id: 1,
      name: "测试小组",
      description: "这是一个测试小组",
      timezone: "Asia/Shanghai",
      createdAt: now,
      members: [
        {
          id: 1,
          userId: 1,
          role: "SUPERVISOR",
          createdAt: now,
          user: { nickname: "用户1" },
        },
      ],
      inviteCodes: [
        { code: "ABC12345" },
        { code: "DEF67890" },
        { code: "GHI11111" },
        { code: "JKL22222" },
        { code: "MNO33333" },
      ],
      _count: { members: 1 },
    });

    const result = await createGroup(
      { name: "测试小组", description: "这是一个测试小组", role: "SUPERVISOR" },
      1,
      { prisma }
    );

    expect(result.id).toBe(1);
    expect(result.name).toBe("测试小组");
    expect(result.description).toBe("这是一个测试小组");
    expect(result.myRole).toBe("SUPERVISOR");
    expect(result.memberCount).toBe(1);
    expect(result.inviteCodes).toHaveLength(5);
    expect(result.inviteCodes).toContain("ABC12345");
    expect(result.members).toHaveLength(1);
    expect(result.members[0].nickname).toBe("用户1");
    expect(mocks.groupCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          members: { create: { userId: 1, role: "SUPERVISOR" } },
          inviteCodes: { create: expect.arrayContaining([{ code: expect.any(String) }]) },
        }),
      })
    );
  });

  it("场景2: 小组名称超过20字符 → 提示错误", async () => {
    const { prisma } = createPrismaMock();

    await expectAppError(createGroup({ name: "测".repeat(21), role: "CHALLENGER" }, 1, { prisma }), {
      statusCode: 400,
      message: /^小组名称需为2-20字符/,
    });
  });

  it("小组名称不足2字符（中文=1，英文/数字=0.5）→ 提示错误", async () => {
    const { prisma } = createPrismaMock();

    await expectAppError(createGroup({ name: "测", role: "CHALLENGER" }, 1, { prisma }), {
      statusCode: 400,
      message: /^小组名称需为2-20字符/,
    });
  });

  it("小组简介超过100字符 → 提示错误", async () => {
    const { prisma } = createPrismaMock();

    await expectAppError(
      createGroup({ name: "测试小组", description: "a".repeat(101), role: "CHALLENGER" }, 1, {
        prisma,
      }),
      {
      statusCode: 400,
      message: "小组简介不能超过100字符",
      }
    );
  });

  it("小组名称规则（英文/数字=0.5）：40位英文名允许创建", async () => {
    const { prisma, mocks } = createPrismaMock();
    const now = new Date();
    const name = "a".repeat(40);

    mocks.groupCreate.mockResolvedValueOnce({
      id: 1,
      name,
      description: null,
      timezone: "Asia/Shanghai",
      createdAt: now,
      members: [
        {
          id: 1,
          userId: 1,
          role: "CHALLENGER",
          createdAt: now,
          user: { nickname: "用户1" },
        },
      ],
      inviteCodes: [
        { code: "ABC12345" },
        { code: "DEF67890" },
        { code: "GHI11111" },
        { code: "JKL22222" },
        { code: "MNO33333" },
      ],
      _count: { members: 1 },
    });

    const result = await createGroup({ name, role: "CHALLENGER" }, 1, { prisma });
    expect(result.name).toBe(name);
    expect(result.inviteCodes).toHaveLength(5);
    expect(mocks.groupCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name, members: { create: { userId: 1, role: "CHALLENGER" } } }),
      })
    );
  });

  it("小组名称规则（英文/数字=0.5）：41位英文名不允许创建", async () => {
    const { prisma } = createPrismaMock();

    await expectAppError(
      createGroup({ name: "a".repeat(41), role: "CHALLENGER" }, 1, { prisma }),
      {
        statusCode: 400,
        message: /^小组名称需为2-20字符/,
      }
    );
  });

  it("创建时自动生成5个一次性邀请码", async () => {
    const { prisma, mocks } = createPrismaMock();
    const now = new Date();

    mocks.groupCreate.mockResolvedValueOnce({
      id: 1,
      name: "测试小组",
      description: null,
      timezone: "Asia/Shanghai",
      createdAt: now,
      members: [
        {
          id: 1,
          userId: 1,
          role: "CHALLENGER",
          createdAt: now,
          user: { nickname: "用户1" },
        },
      ],
      inviteCodes: [
        { code: "ABC12345" },
        { code: "DEF67890" },
        { code: "GHI11111" },
        { code: "JKL22222" },
        { code: "MNO33333" },
      ],
      _count: { members: 1 },
    });

    await createGroup({ name: "测试小组", role: "CHALLENGER" }, 1, { prisma });

    const call = mocks.groupCreate.mock.calls[0]?.[0];
    expect(call?.data?.inviteCodes?.create).toHaveLength(5);
    expect(call?.data?.inviteCodes?.create).toEqual(
      Array.from({ length: 5 }, () => ({ code: expect.any(String) }))
    );
  });

  it("邀请码唯一约束冲突时自动重试", async () => {
    const { prisma, mocks } = createPrismaMock();
    const now = new Date();

    mocks.groupCreate
      .mockRejectedValueOnce({ code: "P2002", meta: { target: ["code"] } })
      .mockResolvedValueOnce({
        id: 1,
        name: "测试小组",
        description: null,
        timezone: "Asia/Shanghai",
        createdAt: now,
        members: [
          {
            id: 1,
            userId: 1,
            role: "CHALLENGER",
            createdAt: now,
            user: { nickname: "用户1" },
          },
        ],
        inviteCodes: [
          { code: "ABC12345" },
          { code: "DEF67890" },
          { code: "GHI11111" },
          { code: "JKL22222" },
          { code: "MNO33333" },
        ],
        _count: { members: 1 },
      });

    const result = await createGroup({ name: "测试小组", role: "CHALLENGER" }, 1, { prisma });

    expect(result.id).toBe(1);
    expect(result.inviteCodes).toHaveLength(5);
    expect(mocks.groupCreate).toHaveBeenCalledTimes(2);
  });

  it("角色无效 → 提示错误", async () => {
    const { prisma } = createPrismaMock();

    await expectAppError(createGroup({ name: "测试小组", role: "INVALID" as any }, 1, { prisma }), {
      statusCode: 400,
      message: "请选择有效的角色",
    });
  });

  it("场景3: 时区设定 - 使用指定时区创建小组", async () => {
    const { prisma, mocks } = createPrismaMock();
    const now = new Date();

    mocks.groupCreate.mockResolvedValueOnce({
      id: 1,
      name: "测试小组",
      description: null,
      timezone: "America/New_York",
      createdAt: now,
      members: [
        {
          id: 1,
          userId: 1,
          role: "CHALLENGER",
          createdAt: now,
          user: { nickname: "用户1" },
        },
      ],
      inviteCodes: [
        { code: "ABC12345" },
        { code: "DEF67890" },
        { code: "GHI11111" },
        { code: "JKL22222" },
        { code: "MNO33333" },
      ],
      _count: { members: 1 },
    });

    const result = await createGroup(
      { name: "测试小组", role: "CHALLENGER", timezone: "America/New_York" },
      1,
      { prisma }
    );

    expect(mocks.groupCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          timezone: "America/New_York",
        }),
      })
    );
    expect(result.timezone).toBe("America/New_York");
  });

  it("不指定时区时使用默认时区 Asia/Shanghai", async () => {
    const { prisma, mocks } = createPrismaMock();
    const now = new Date();

    mocks.groupCreate.mockResolvedValueOnce({
      id: 1,
      name: "测试小组",
      description: null,
      timezone: "Asia/Shanghai",
      createdAt: now,
      members: [
        {
          id: 1,
          userId: 1,
          role: "CHALLENGER",
          createdAt: now,
          user: { nickname: "用户1" },
        },
      ],
      inviteCodes: [
        { code: "ABC12345" },
        { code: "DEF67890" },
        { code: "GHI11111" },
        { code: "JKL22222" },
        { code: "MNO33333" },
      ],
      _count: { members: 1 },
    });

    const result = await createGroup({ name: "测试小组", role: "CHALLENGER" }, 1, { prisma });

    expect(mocks.groupCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          timezone: "Asia/Shanghai",
        }),
      })
    );
    expect(result.timezone).toBe("Asia/Shanghai");
  });

  it("无效时区 → 提示错误", async () => {
    const { prisma } = createPrismaMock();

    await expectAppError(
      createGroup({ name: "测试小组", role: "CHALLENGER", timezone: "Invalid/Timezone" }, 1, { prisma }),
      {
        statusCode: 400,
        message: "请选择有效的时区",
      }
    );
  });
});

describe("US-03 获取我的小组列表", () => {
  it("返回用户所属的所有小组", async () => {
    const { prisma, mocks } = createPrismaMock();
    const now = new Date();

    mocks.groupFindMany.mockResolvedValueOnce([
      {
        id: 1,
        name: "小组1",
        description: "描述1",
        timezone: "Asia/Shanghai",
        createdAt: now,
        _count: { members: 3 },
        members: [{ role: "CHALLENGER" }],
      },
      {
        id: 2,
        name: "小组2",
        description: null,
        timezone: "America/New_York",
        createdAt: now,
        _count: { members: 2 },
        members: [{ role: "SUPERVISOR" }],
      },
    ]);

    const result = await getMyGroups(1, { prisma });

    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("小组1");
    expect(result[0].myRole).toBe("CHALLENGER");
    expect(result[0].timezone).toBe("Asia/Shanghai");
    expect(result[1].name).toBe("小组2");
    expect(result[1].myRole).toBe("SUPERVISOR");
    expect(result[1].timezone).toBe("America/New_York");
  });
});

describe("US-03 获取小组详情", () => {
  it("场景1: 成功获取小组详情", async () => {
    const { prisma, mocks } = createPrismaMock();
    const now = new Date();

    mocks.groupFindUnique.mockResolvedValueOnce({
      id: 1,
      name: "测试小组",
      description: "描述",
      timezone: "Asia/Tokyo",
      createdAt: now,
      members: [
        {
          id: 1,
          userId: 1,
          role: "CHALLENGER",
          createdAt: now,
          user: { nickname: "用户1" },
        },
        {
          id: 2,
          userId: 2,
          role: "SUPERVISOR",
          createdAt: now,
          user: { nickname: "用户2" },
        },
      ],
      inviteCodes: [
        { code: "ABC12345" },
        { code: "DEF67890" },
        { code: "GHI11111" },
      ],
      _count: { members: 2 },
    });

    const result = await getGroupDetail(1, 1, { prisma });

    expect(result.id).toBe(1);
    expect(result.name).toBe("测试小组");
    expect(result.timezone).toBe("Asia/Tokyo");
    expect(result.members).toHaveLength(2);
    expect(result.inviteCodes).toHaveLength(3);
    expect(result.inviteCodes).toContain("ABC12345");
    expect(mocks.groupFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          inviteCodes: expect.objectContaining({
            where: { usedAt: null },
            take: 5,
          }),
        }),
      })
    );
  });

  it("场景2: 小组不存在 → 提示错误", async () => {
    const { prisma, mocks } = createPrismaMock();

    mocks.groupFindUnique.mockResolvedValueOnce(null);

    const promise = getGroupDetail(999, 1, { prisma });
    await expect(promise).rejects.toBeInstanceOf(AppError);
    await expect(promise).rejects.toMatchObject({
      statusCode: 404,
      message: "小组不存在",
    });
  });

  it("场景3: 非小组成员 → 提示错误", async () => {
    const { prisma, mocks } = createPrismaMock();
    const now = new Date();

    mocks.groupFindUnique.mockResolvedValueOnce({
      id: 1,
      name: "测试小组",
      description: null,
      timezone: "Asia/Shanghai",
      createdAt: now,
      members: [
        {
          id: 1,
          userId: 2,
          role: "CHALLENGER",
          createdAt: now,
          user: { nickname: "用户2" },
        },
      ],
      inviteCodes: [],
      _count: { members: 1 },
    });

    const promise = getGroupDetail(1, 1, { prisma });
    await expect(promise).rejects.toBeInstanceOf(AppError);
    await expect(promise).rejects.toMatchObject({
      statusCode: 403,
      message: "您不是该小组成员",
    });
  });
});

describe("US-04 加入小组", () => {
  it("场景1: 成功加入小组 → 邀请码作废", async () => {
    const { prisma, mocks } = createPrismaMock();
    const now = new Date();

    mocks.inviteCodeFindUnique.mockResolvedValueOnce({
      id: 1,
      groupId: 1,
      code: "ABC12345",
      usedAt: null,
      usedById: null,
      group: {
        id: 1,
        name: "测试小组",
        description: "描述",
        timezone: "Asia/Shanghai",
        createdAt: now,
        _count: { members: 1 },
      },
    });
    mocks.groupMemberFindUnique.mockResolvedValueOnce(null);
    mocks.inviteCodeUpdateMany.mockResolvedValueOnce({ count: 1 });
    mocks.groupMemberCreate.mockResolvedValueOnce({
      id: 1,
      groupId: 1,
      userId: 2,
      role: "CHALLENGER",
    });

    const result = await joinGroup(
      { inviteCode: "ABC12345", role: "CHALLENGER" },
      2,
      { prisma }
    );

    expect(result.group.id).toBe(1);
    expect(result.role).toBe("CHALLENGER");
    expect(result.group.memberCount).toBe(2);
    expect(result.group.timezone).toBe("Asia/Shanghai");
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.inviteCodeUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1, usedAt: null },
        data: { usedAt: expect.any(Date), usedById: 2 },
      })
    );
    expect(mocks.groupMemberCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { groupId: 1, userId: 2, role: "CHALLENGER" },
      })
    );
    expect(mocks.feedEventCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          groupId: 1,
          eventType: "MEMBER_JOINED",
          actorId: 2,
          metadata: { role: "CHALLENGER", inviteCode: "ABC12345" },
        }),
      })
    );
  });

  it('邀请码在事务中被抢用 → 提示"邀请码无效"', async () => {
    const { prisma, mocks } = createPrismaMock();
    const now = new Date();

    mocks.inviteCodeFindUnique.mockResolvedValueOnce({
      id: 1,
      groupId: 1,
      code: "ABC12345",
      usedAt: null,
      usedById: null,
      group: {
        id: 1,
        name: "测试小组",
        description: null,
        timezone: "Asia/Shanghai",
        createdAt: now,
        _count: { members: 1 },
      },
    });
    mocks.groupMemberFindUnique.mockResolvedValueOnce(null);
    mocks.inviteCodeUpdateMany.mockResolvedValueOnce({ count: 0 });

    await expectAppError(joinGroup({ inviteCode: "ABC12345", role: "CHALLENGER" }, 2, { prisma }), {
      statusCode: 400,
      message: "邀请码无效",
    });
    expect(mocks.groupMemberCreate).not.toHaveBeenCalled();
  });

  it("成功加入小组（监督者）", async () => {
    const { prisma, mocks } = createPrismaMock();
    const now = new Date();

    mocks.inviteCodeFindUnique.mockResolvedValueOnce({
      id: 1,
      groupId: 1,
      code: "ABC12345",
      usedAt: null,
      usedById: null,
      group: {
        id: 1,
        name: "测试小组",
        description: null,
        timezone: "Asia/Shanghai",
        createdAt: now,
        _count: { members: 1 },
      },
    });
    mocks.groupMemberFindUnique.mockResolvedValueOnce(null);
    mocks.inviteCodeUpdateMany.mockResolvedValueOnce({ count: 1 });
    mocks.groupMemberCreate.mockResolvedValueOnce({
      id: 1,
      groupId: 1,
      userId: 2,
      role: "SUPERVISOR",
    });

    const result = await joinGroup(
      { inviteCode: "ABC12345", role: "SUPERVISOR" },
      2,
      { prisma }
    );

    expect(result.role).toBe("SUPERVISOR");
  });

  it("场景3: 邀请码为空 → 提示错误", async () => {
    const { prisma } = createPrismaMock();

    await expectAppError(joinGroup({ inviteCode: "", role: "CHALLENGER" }, 2, { prisma }), {
      statusCode: 400,
      message: "邀请码不能为空",
    });
  });

  it("邀请码仅空白字符 → 提示“邀请码不能为空”", async () => {
    const { prisma } = createPrismaMock();

    await expectAppError(joinGroup({ inviteCode: "   ", role: "CHALLENGER" }, 2, { prisma }), {
      statusCode: 400,
      message: "邀请码不能为空",
    });
  });

  it("场景4: 邀请码无效 → 提示错误", async () => {
    const { prisma, mocks } = createPrismaMock();

    mocks.inviteCodeFindUnique.mockResolvedValueOnce(null);

    await expectAppError(joinGroup({ inviteCode: "INVALID", role: "CHALLENGER" }, 2, { prisma }), {
      statusCode: 400,
      message: "邀请码无效",
    });
  });

  it("场景5: 邀请码已被使用 → 提示邀请码无效", async () => {
    const { prisma, mocks } = createPrismaMock();
    const now = new Date();

    mocks.inviteCodeFindUnique.mockResolvedValueOnce({
      id: 1,
      groupId: 1,
      code: "ABC12345",
      usedAt: now,
      usedById: 3,
      group: {
        id: 1,
        name: "测试小组",
        description: null,
        timezone: "Asia/Shanghai",
        createdAt: now,
        _count: { members: 1 },
      },
    });

    await expectAppError(joinGroup({ inviteCode: "ABC12345", role: "CHALLENGER" }, 2, { prisma }), {
      statusCode: 400,
      message: "邀请码无效",
    });
  });

  it("场景6: 已是小组成员 → 提示错误", async () => {
    const { prisma, mocks } = createPrismaMock();
    const now = new Date();

    mocks.inviteCodeFindUnique.mockResolvedValueOnce({
      id: 1,
      groupId: 1,
      code: "ABC12345",
      usedAt: null,
      usedById: null,
      group: {
        id: 1,
        name: "测试小组",
        description: null,
        timezone: "Asia/Shanghai",
        createdAt: now,
        _count: { members: 1 },
      },
    });
    mocks.groupMemberFindUnique.mockResolvedValueOnce({ role: "CHALLENGER" });

    await expectAppError(joinGroup({ inviteCode: "ABC12345", role: "CHALLENGER" }, 2, { prisma }), {
      statusCode: 409,
      message: "您已是该小组成员",
    });
  });

  it('并发加入时写入成员表冲突 → 仍提示"您已是该小组成员"', async () => {
    const { prisma, mocks } = createPrismaMock();
    const now = new Date();

    mocks.inviteCodeFindUnique.mockResolvedValueOnce({
      id: 1,
      groupId: 1,
      code: "ABC12345",
      usedAt: null,
      usedById: null,
      group: {
        id: 1,
        name: "测试小组",
        description: null,
        timezone: "Asia/Shanghai",
        createdAt: now,
        _count: { members: 1 },
      },
    });
    mocks.groupMemberFindUnique.mockResolvedValueOnce(null);
    mocks.inviteCodeUpdateMany.mockResolvedValueOnce({ count: 1 });
    mocks.groupMemberCreate.mockRejectedValueOnce({ code: "P2002", meta: { target: ["group_id", "user_id"] } });

    await expectAppError(joinGroup({ inviteCode: "ABC12345", role: "CHALLENGER" }, 2, { prisma }), {
      statusCode: 409,
      message: "您已是该小组成员",
    });
  });

  it("场景7: 小组已满6人 → 提示错误", async () => {
    const { prisma, mocks } = createPrismaMock();
    const now = new Date();

    mocks.inviteCodeFindUnique.mockResolvedValueOnce({
      id: 1,
      groupId: 1,
      code: "ABC12345",
      usedAt: null,
      usedById: null,
      group: {
        id: 1,
        name: "测试小组",
        description: null,
        timezone: "Asia/Shanghai",
        createdAt: now,
        _count: { members: 6 },
      },
    });
    mocks.groupMemberFindUnique.mockResolvedValueOnce(null);

    await expectAppError(joinGroup({ inviteCode: "ABC12345", role: "CHALLENGER" }, 2, { prisma }), {
      statusCode: 400,
      message: "小组已满，无法加入",
    });
    expect(mocks.inviteCodeUpdateMany).not.toHaveBeenCalled();
    expect(mocks.groupMemberCreate).not.toHaveBeenCalled();
  });

  it("角色无效 → 提示错误", async () => {
    const { prisma } = createPrismaMock();

    await expectAppError(
      joinGroup({ inviteCode: "ABC12345", role: "INVALID" as any }, 2, { prisma }),
      {
        statusCode: 400,
        message: "请选择有效的角色",
      }
    );
  });

  it("场景8: 邀请码大小写不敏感", async () => {
    const { prisma, mocks } = createPrismaMock();
    const now = new Date();

    mocks.inviteCodeFindUnique.mockResolvedValueOnce({
      id: 1,
      groupId: 1,
      code: "ABC12345",
      usedAt: null,
      usedById: null,
      group: {
        id: 1,
        name: "测试小组",
        description: null,
        timezone: "Asia/Shanghai",
        createdAt: now,
        _count: { members: 1 },
      },
    });
    mocks.groupMemberFindUnique.mockResolvedValueOnce(null);
    mocks.inviteCodeUpdateMany.mockResolvedValueOnce({ count: 1 });
    mocks.groupMemberCreate.mockResolvedValueOnce({
      id: 1,
      groupId: 1,
      userId: 2,
      role: "CHALLENGER",
    });

    await joinGroup({ inviteCode: "abc12345", role: "CHALLENGER" }, 2, { prisma });

    expect(mocks.inviteCodeFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { code: "ABC12345" },
      })
    );
  });

  it("场景5: 加入时有待开始或进行中目标（挑战者）→ 自动参与当前目标", async () => {
    const { prisma, mocks } = createPrismaMock();
    const now = new Date();

    mocks.inviteCodeFindUnique.mockResolvedValueOnce({
      id: 1,
      groupId: 1,
      code: "ABC12345",
      usedAt: null,
      usedById: null,
      group: {
        id: 1,
        name: "测试小组",
        description: null,
        timezone: "Asia/Shanghai",
        createdAt: now,
        _count: { members: 1 },
      },
    });
    mocks.groupMemberFindUnique.mockResolvedValueOnce(null);
    mocks.inviteCodeUpdateMany.mockResolvedValueOnce({ count: 1 });
    mocks.groupMemberCreate.mockResolvedValueOnce({
      id: 10,
      groupId: 1,
      userId: 2,
      role: "CHALLENGER",
      user: { nickname: "用户2" },
    });
    mocks.goalFindFirst.mockResolvedValueOnce({ id: 99, name: "跑步挑战" }); // UPCOMING/ACTIVE 目标
    mocks.goalParticipantCreate.mockResolvedValueOnce({ id: 1 });
    mocks.goalFindFirst.mockResolvedValueOnce(null); // 无 PENDING 目标

    await joinGroup({ inviteCode: "ABC12345", role: "CHALLENGER" }, 2, { prisma });

    expect(mocks.goalFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { groupId: 1, status: { in: ["UPCOMING", "ACTIVE"] } },
        select: { id: true, name: true },
      })
    );
    expect(mocks.goalParticipantCreate).toHaveBeenCalledWith({
      data: { goalId: 99, memberId: 10 },
    });
    expect(mocks.feedEventCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventType: "CHALLENGER_AUTO_ENROLLED",
          actorId: undefined,
          groupId: 1,
          metadata: {
            goalId: 99,
            goalName: "跑步挑战",
            challengerNickname: "用户2",
          },
        }),
      })
    );
  });

  it("加入时有待开始或进行中目标（监督者）→ 不自动参与当前目标", async () => {
    const { prisma, mocks } = createPrismaMock();
    const now = new Date();

    mocks.inviteCodeFindUnique.mockResolvedValueOnce({
      id: 1,
      groupId: 1,
      code: "ABC12345",
      usedAt: null,
      usedById: null,
      group: {
        id: 1,
        name: "测试小组",
        description: null,
        timezone: "Asia/Shanghai",
        createdAt: now,
        _count: { members: 1 },
      },
    });
    mocks.groupMemberFindUnique.mockResolvedValueOnce(null);
    mocks.inviteCodeUpdateMany.mockResolvedValueOnce({ count: 1 });
    mocks.groupMemberCreate.mockResolvedValueOnce({
      id: 10,
      groupId: 1,
      userId: 2,
      role: "SUPERVISOR",
    });
    mocks.goalFindFirst.mockResolvedValueOnce(null); // 无 PENDING 目标

    await joinGroup({ inviteCode: "ABC12345", role: "SUPERVISOR" }, 2, { prisma });

    expect(mocks.goalParticipantCreate).not.toHaveBeenCalled();
  });

  it("场景4: 加入时有待确认目标 → 自动获得确认请求", async () => {
    const { prisma, mocks } = createPrismaMock();
    const now = new Date();

    mocks.inviteCodeFindUnique.mockResolvedValueOnce({
      id: 1,
      groupId: 1,
      code: "ABC12345",
      usedAt: null,
      usedById: null,
      group: {
        id: 1,
        name: "测试小组",
        description: null,
        timezone: "Asia/Shanghai",
        createdAt: now,
        _count: { members: 1 },
      },
    });
    mocks.groupMemberFindUnique.mockResolvedValueOnce(null);
    mocks.inviteCodeUpdateMany.mockResolvedValueOnce({ count: 1 });
    mocks.groupMemberCreate.mockResolvedValueOnce({
      id: 10,
      groupId: 1,
      userId: 2,
      role: "CHALLENGER",
    });
    mocks.goalFindFirst.mockResolvedValueOnce(null); // 无 UPCOMING/ACTIVE 目标
    mocks.goalFindFirst.mockResolvedValueOnce({ id: 50 }); // 有 PENDING 目标
    mocks.goalConfirmationCreate.mockResolvedValueOnce({ id: 1 });

    await joinGroup({ inviteCode: "ABC12345", role: "CHALLENGER" }, 2, { prisma });

    expect(mocks.goalFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { groupId: 1, status: "PENDING" },
        select: { id: true },
      })
    );
    expect(mocks.goalConfirmationCreate).toHaveBeenCalledWith({
      data: { goalId: 50, memberId: 10 },
    });
  });

  it("加入时有待确认目标（监督者）→ 自动获得确认请求", async () => {
    const { prisma, mocks } = createPrismaMock();
    const now = new Date();

    mocks.inviteCodeFindUnique.mockResolvedValueOnce({
      id: 1,
      groupId: 1,
      code: "ABC12345",
      usedAt: null,
      usedById: null,
      group: {
        id: 1,
        name: "测试小组",
        description: null,
        timezone: "Asia/Shanghai",
        createdAt: now,
        _count: { members: 1 },
      },
    });
    mocks.groupMemberFindUnique.mockResolvedValueOnce(null);
    mocks.inviteCodeUpdateMany.mockResolvedValueOnce({ count: 1 });
    mocks.groupMemberCreate.mockResolvedValueOnce({
      id: 20,
      groupId: 1,
      userId: 2,
      role: "SUPERVISOR",
    });
    mocks.goalFindFirst.mockResolvedValueOnce({ id: 51 });
    mocks.goalConfirmationCreate.mockResolvedValueOnce({ id: 2 });

    await joinGroup({ inviteCode: "ABC12345", role: "SUPERVISOR" }, 2, { prisma });

    expect(mocks.goalFindFirst).toHaveBeenCalledTimes(1);
    expect(mocks.goalFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { groupId: 1, status: "PENDING" },
        select: { id: true },
      })
    );
    expect(mocks.goalParticipantCreate).not.toHaveBeenCalled();
    expect(mocks.goalConfirmationCreate).toHaveBeenCalledWith({
      data: { goalId: 51, memberId: 20 },
    });
  });

  it("场景6: 加入时有待确认的修改/取消请求 → 自动获得投票记录", async () => {
    const { prisma, mocks } = createPrismaMock();
    const now = new Date();

    mocks.inviteCodeFindUnique.mockResolvedValueOnce({
      id: 1,
      groupId: 1,
      code: "ABC12345",
      usedAt: null,
      usedById: null,
      group: {
        id: 1,
        name: "测试小组",
        description: null,
        timezone: "Asia/Shanghai",
        createdAt: now,
        _count: { members: 1 },
      },
    });
    mocks.groupMemberFindUnique.mockResolvedValueOnce(null);
    mocks.inviteCodeUpdateMany.mockResolvedValueOnce({ count: 1 });
    mocks.groupMemberCreate.mockResolvedValueOnce({
      id: 30,
      groupId: 1,
      userId: 2,
      role: "SUPERVISOR",
    });
    mocks.goalFindFirst.mockResolvedValueOnce(null);
    mocks.goalChangeRequestFindMany.mockResolvedValueOnce([{ id: 201 }, { id: 202 }]);
    mocks.goalChangeVoteCreate.mockResolvedValue({ id: 1 });

    await joinGroup({ inviteCode: "ABC12345", role: "SUPERVISOR" }, 2, { prisma });

    expect(mocks.goalChangeRequestFindMany).toHaveBeenCalledWith({
      where: {
        goal: { groupId: 1 },
        status: "PENDING",
      },
      select: { id: true },
    });
    expect(mocks.goalChangeVoteCreate).toHaveBeenCalledTimes(2);
    expect(mocks.goalChangeVoteCreate).toHaveBeenNthCalledWith(1, {
      data: { requestId: 201, memberId: 30 },
    });
    expect(mocks.goalChangeVoteCreate).toHaveBeenNthCalledWith(2, {
      data: { requestId: 202, memberId: 30 },
    });
  });
});
