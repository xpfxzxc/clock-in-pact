import type { LoginRequest, RegisterRequest } from "../types/auth";
import { AppError } from "../utils/app-error";

const USERNAME_REGEX = /^[a-zA-Z0-9]{3,20}$/;
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 20;

const NICKNAME_MIN_UNITS = 1;
const NICKNAME_MAX_UNITS = 10;

const REMEMBER_ME_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

export interface PrismaClientLike {
  user: {
    findUnique(args: {
      where: { username: string };
      select: { id: true };
    }): Promise<{ id: number } | null>;
    findUnique(args: {
      where: { nickname: string };
      select: { id: true };
    }): Promise<{ id: number } | null>;
    findUnique(args: {
      where: { username: string };
      select: { id: true; username: true; nickname: true; password: true };
    }): Promise<{ id: number; username: string; nickname: string; password: string } | null>;
    create(args: {
      data: { username: string; password: string; nickname: string };
      select: { id: true; username: true; nickname: true };
    }): Promise<{ id: number; username: string; nickname: string }>;
  };
}

export function calculateNicknameLengthUnits(nickname: string): number {
  let units = 0;
  for (const char of nickname) {
    units += /[A-Za-z0-9]/.test(char) ? 0.5 : 1;
  }
  return units;
}

function assertRegisterInput(body: RegisterRequest): void {
  if (!body.username || !USERNAME_REGEX.test(body.username)) {
    throw new AppError(400, "用户名需为3-20位英文或数字");
  }

  if (
    !body.password ||
    body.password.length < PASSWORD_MIN_LENGTH ||
    body.password.length > PASSWORD_MAX_LENGTH
  ) {
    throw new AppError(400, "密码需为8-20位");
  }

  const nicknameUnits = calculateNicknameLengthUnits(body.nickname ?? "");
  if (
    !body.nickname ||
    nicknameUnits < NICKNAME_MIN_UNITS ||
    nicknameUnits > NICKNAME_MAX_UNITS
  ) {
    throw new AppError(400, "昵称需为1-10字符（中文=1，英文/数字=0.5）");
  }
}

function getUniqueTargets(error: unknown): string[] {
  if (!error || typeof error !== "object") return [];
  const meta = (error as { meta?: unknown }).meta;
  if (!meta || typeof meta !== "object") return [];
  const target = (meta as { target?: unknown }).target;
  if (Array.isArray(target)) return target.map((t) => String(t));
  if (typeof target === "string") return [target];
  return [];
}

export async function registerUser(
  body: RegisterRequest,
  deps: {
    prisma: PrismaClientLike;
    hashPassword: (password: string) => Promise<string>;
  }
): Promise<{ id: number; username: string; nickname: string }> {
  assertRegisterInput(body);

  const [existingByUsername, existingByNickname] = await Promise.all([
    deps.prisma.user.findUnique({
      where: { username: body.username },
      select: { id: true },
    }),
    deps.prisma.user.findUnique({
      where: { nickname: body.nickname },
      select: { id: true },
    }),
  ]);

  if (existingByUsername) {
    throw new AppError(409, "用户名已被占用");
  }
  if (existingByNickname) {
    throw new AppError(409, "昵称已被占用");
  }

  const hashedPassword = await deps.hashPassword(body.password);

  try {
    const user = await deps.prisma.user.create({
      data: {
        username: body.username,
        password: hashedPassword,
        nickname: body.nickname,
      },
      select: { id: true, username: true, nickname: true },
    });
    return user;
  } catch (error) {
    const code =
      error && typeof error === "object" ? (error as { code?: unknown }).code : undefined;
    if (code === "P2002") {
      const targets = getUniqueTargets(error);
      if (targets.some((t) => t.includes("username"))) {
        throw new AppError(409, "用户名已被占用");
      }
      if (targets.some((t) => t.includes("nickname"))) {
        throw new AppError(409, "昵称已被占用");
      }
      throw new AppError(409, "用户名或昵称已被占用");
    }
    throw error;
  }
}

export async function loginUser(
  body: LoginRequest,
  deps: {
    prisma: PrismaClientLike;
    verifyPassword: (hashedPassword: string, password: string) => Promise<boolean>;
  }
): Promise<{
  user: { id: number; username: string; nickname: string };
  sessionMaxAge?: number;
}> {
  if (!body.username || !body.password) {
    throw new AppError(400, "用户名和密码不能为空");
  }

  const user = await deps.prisma.user.findUnique({
    where: { username: body.username },
    select: { id: true, username: true, nickname: true, password: true },
  });

  if (!user) {
    throw new AppError(401, "用户名或密码错误");
  }

  const isValid = await deps.verifyPassword(user.password, body.password);
  if (!isValid) {
    throw new AppError(401, "用户名或密码错误");
  }

  return {
    user: { id: user.id, username: user.username, nickname: user.nickname },
    sessionMaxAge: body.rememberMe ? REMEMBER_ME_MAX_AGE_SECONDS : undefined,
  };
}
