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

  const transactionMock = vi.fn(async (fn: (tx: any) => Promise<unknown>) => {
    return fn({
      groupMember: { create: groupMemberCreateMock },
      inviteCode: { updateMany: inviteCodeUpdateManyMock },
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
        createdAt: now,
        _count: { members: 3 },
        members: [{ role: "CHALLENGER" }],
      },
      {
        id: 2,
        name: "小组2",
        description: null,
        createdAt: now,
        _count: { members: 2 },
        members: [{ role: "SUPERVISOR" }],
      },
    ]);

    const result = await getMyGroups(1, { prisma });

    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("小组1");
    expect(result[0].myRole).toBe("CHALLENGER");
    expect(result[1].name).toBe("小组2");
    expect(result[1].myRole).toBe("SUPERVISOR");
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
  });

  it("邀请码在事务中被抢用 → 提示“邀请码无效”", async () => {
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

  it("并发加入时写入成员表冲突 → 仍提示“您已是该小组成员”", async () => {
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

  it.skip("场景4: 加入时有进行中目标（暂不实现：自动参与当前目标）", async () => {
    // 根据本轮需求：跳过 US-04 业务规则 #6
  });
});
