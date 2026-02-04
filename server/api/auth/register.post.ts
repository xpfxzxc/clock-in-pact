import type { RegisterRequest, AuthResponse } from "../../types/auth";
import { registerUser } from "../../services/auth.service";
import { hashPassword } from "../../services/password";
import { isAppError } from "../../utils/app-error";
import prisma from "../../utils/prisma";

export default defineEventHandler(async (event) => {
  const body = await readBody<RegisterRequest>(event);

  try {
    const user = await registerUser(body, { prisma, hashPassword });

    await setUserSession(event, { user });

    return { user } satisfies AuthResponse;
  } catch (error) {
    if (isAppError(error)) {
      throw createError({ statusCode: error.statusCode, message: error.message });
    }
    throw error;
  }
});
