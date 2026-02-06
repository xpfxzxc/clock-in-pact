import prisma from "../utils/prisma";
import { startGoalStatusScheduler } from "../services/scheduler.service";

const SCHEDULER_KEY = "__clockInPactGoalStatusScheduler";

export default defineNitroPlugin(() => {
  const globalAny = globalThis as unknown as Record<string, unknown>;
  if (globalAny[SCHEDULER_KEY]) return;

  globalAny[SCHEDULER_KEY] = true;
  void startGoalStatusScheduler({ prisma, logger: console });
});
