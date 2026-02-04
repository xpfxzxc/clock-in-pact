import type { LoginRequest, AuthResponse } from "../../types/auth";
import { loginUser } from "../../services/auth.service";
import { verifyPassword } from "../../services/password";
import { isAppError } from "../../utils/app-error";
import prisma from "../../utils/prisma";

export default defineEventHandler(async (event) => {
  const body = await readBody<LoginRequest>(event);

  try {
    const { user, sessionMaxAge } = await loginUser(body, { prisma, verifyPassword });

    await setUserSession(event, { user }, { maxAge: sessionMaxAge });

    return { user } satisfies AuthResponse;
  } catch (error) {
    if (isAppError(error)) {
      throw createError({ statusCode: error.statusCode, message: error.message });
    }
    throw error;
  }
});
