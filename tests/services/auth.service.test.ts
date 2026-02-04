import { describe, expect, it, vi } from "vitest";

import { registerUser, loginUser } from "../../server/services/auth.service";
import { AppError } from "../../server/utils/app-error";
import type { PrismaClientLike } from "../../server/services/auth.service";

function createPrismaMock() {
  const findUniqueMock = vi.fn();
  const createMock = vi.fn();

  const prisma: PrismaClientLike = {
    user: {
      findUnique: findUniqueMock as unknown as PrismaClientLike["user"]["findUnique"],
      create: createMock as unknown as PrismaClientLike["user"]["create"],
    },
  };

  return {
    prisma,
    mocks: { findUnique: findUniqueMock, create: createMock },
  };
}

describe("US-01 注册", () => {
  it("场景1: 成功注册", async () => {
    const { prisma, mocks } = createPrismaMock();

    mocks.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    mocks.create.mockResolvedValueOnce({ id: 1, username: "user123", nickname: "昵称" });

    const hashPassword = vi.fn(async () => "hashed");

    const user = await registerUser(
      { username: "user123", password: "12345678", nickname: "昵称" },
      { prisma, hashPassword }
    );

    expect(user).toEqual({ id: 1, username: "user123", nickname: "昵称" });
    expect(hashPassword).toHaveBeenCalledWith("12345678");
    expect(mocks.create).toHaveBeenCalledWith({
      data: { username: "user123", password: "hashed", nickname: "昵称" },
      select: { id: true, username: true, nickname: true },
    });
  });

  it("场景2: 用户名已存在 → 提示“用户名已被占用”", async () => {
    const { prisma, mocks } = createPrismaMock();

    mocks.findUnique.mockResolvedValueOnce({ id: 1 }).mockResolvedValueOnce(null);

    const promise = registerUser(
      { username: "user123", password: "12345678", nickname: "昵称" },
      { prisma, hashPassword: async () => "hashed" }
    );
    await expect(promise).rejects.toBeInstanceOf(AppError);
    await expect(promise).rejects.toMatchObject({
      statusCode: 409,
      message: "用户名已被占用",
    });
  });

  it("场景3: 昵称已存在 → 提示“昵称已被占用”", async () => {
    const { prisma, mocks } = createPrismaMock();

    mocks.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 2 });

    const promise = registerUser(
      { username: "user123", password: "12345678", nickname: "昵称" },
      { prisma, hashPassword: async () => "hashed" }
    );
    await expect(promise).rejects.toBeInstanceOf(AppError);
    await expect(promise).rejects.toMatchObject({
      statusCode: 409,
      message: "昵称已被占用",
    });
  });

  it("用户名格式不符 → 提示“用户名需为3-20位英文或数字”", async () => {
    const { prisma } = createPrismaMock();

    const promise = registerUser(
      { username: "ab", password: "12345678", nickname: "昵称" },
      { prisma, hashPassword: async () => "hashed" }
    );
    await expect(promise).rejects.toBeInstanceOf(AppError);
    await expect(promise).rejects.toMatchObject({
      statusCode: 400,
      message: "用户名需为3-20位英文或数字",
    });
  });

  it("密码格式不符 → 提示“密码需为8-20位”", async () => {
    const { prisma } = createPrismaMock();

    const promise = registerUser(
      { username: "user123", password: "1234567", nickname: "昵称" },
      { prisma, hashPassword: async () => "hashed" }
    );
    await expect(promise).rejects.toBeInstanceOf(AppError);
    await expect(promise).rejects.toMatchObject({
      statusCode: 400,
      message: "密码需为8-20位",
    });
  });

  it("昵称长度规则(英文/数字=0.5)：20 位英文昵称允许注册", async () => {
    const { prisma, mocks } = createPrismaMock();

    mocks.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    mocks.create.mockResolvedValueOnce({
      id: 1,
      username: "user123",
      nickname: "abcdefghijklmnopqrst",
    });

    const user = await registerUser(
      {
        username: "user123",
        password: "12345678",
        nickname: "abcdefghijklmnopqrst",
      },
      { prisma, hashPassword: async () => "hashed" }
    );

    expect(user.nickname).toBe("abcdefghijklmnopqrst");
  });
});

describe("US-02 登录", () => {
  it("场景1: 成功登录", async () => {
    const { prisma, mocks } = createPrismaMock();

    mocks.findUnique.mockResolvedValueOnce({
      id: 1,
      username: "user123",
      nickname: "昵称",
      password: "hashed",
    });

    const verifyPassword = vi.fn(async () => true);

    await expect(
      loginUser({ username: "user123", password: "12345678" }, { prisma, verifyPassword })
    ).resolves.toEqual({
      user: { id: 1, username: "user123", nickname: "昵称" },
      sessionMaxAge: undefined,
    });
  });

  it("场景2: 登录失败 → 提示“用户名或密码错误”", async () => {
    const { prisma, mocks } = createPrismaMock();

    mocks.findUnique.mockResolvedValueOnce({
      id: 1,
      username: "user123",
      nickname: "昵称",
      password: "hashed",
    });

    const promise = loginUser(
      { username: "user123", password: "wrong" },
      { prisma, verifyPassword: async () => false }
    );
    await expect(promise).rejects.toBeInstanceOf(AppError);
    await expect(promise).rejects.toMatchObject({
      statusCode: 401,
      message: "用户名或密码错误",
    });
  });

  it("场景2: 用户名不存在 → 提示“用户名或密码错误”", async () => {
    const { prisma, mocks } = createPrismaMock();

    mocks.findUnique.mockResolvedValueOnce(null);

    const promise = loginUser(
      { username: "not-exists", password: "12345678" },
      { prisma, verifyPassword: async () => true }
    );
    await expect(promise).rejects.toBeInstanceOf(AppError);
    await expect(promise).rejects.toMatchObject({
      statusCode: 401,
      message: "用户名或密码错误",
    });
  });

  it("场景3: 记住我 → 成功登录时返回 sessionMaxAge", async () => {
    const { prisma, mocks } = createPrismaMock();

    mocks.findUnique.mockResolvedValueOnce({
      id: 1,
      username: "user123",
      nickname: "昵称",
      password: "hashed",
    });

    const result = await loginUser(
      { username: "user123", password: "12345678", rememberMe: true },
      { prisma, verifyPassword: async () => true }
    );

    expect(result.sessionMaxAge).toBe(60 * 60 * 24 * 7);
  });
});
